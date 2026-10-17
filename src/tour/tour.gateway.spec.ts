// Mock PrismaService trước khi import bất kỳ module nào phụ thuộc vào nó
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    tour: { findUnique: jest.fn() },
    tourControl: { findUnique: jest.fn() },
    tourLevel: { count: jest.fn(), findMany: jest.fn() },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';
import { TourGateway } from './tour.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from '../plan/plan.service';

// Lấy mock instance để config trong từng test
const mockPrismaService = {
  tour: { findUnique: jest.fn() },
  tourControl: { findUnique: jest.fn() },
  tourLevel: { count: jest.fn(), findMany: jest.fn() },
  tourEntryLog: { findMany: jest.fn().mockResolvedValue([]) },
  user: {
    findUnique: jest
      .fn()
      .mockResolvedValue({ role: 'STANDARD', planExpiresAt: null }),
  },
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret'),
};

describe('TourGateway', () => {
  let gateway: TourGateway;

  // Giữ tham chiếu riêng tới từng mock để assert (tránh unbound-method)
  const socketData: { userId?: number; email?: string } = {};
  const socketEmit = jest.fn();
  const socketJoin = jest.fn();
  const socketLeave = jest.fn();
  const socketDisconnect = jest.fn();

  const mockSocket = {
    id: 'test-socket-id',
    handshake: {
      auth: { token: 'valid-jwt-token' },
      query: {},
    },
    data: socketData,
    emit: socketEmit,
    join: socketJoin,
    leave: socketLeave,
    disconnect: socketDisconnect,
  } as unknown as Socket;

  const roomEmit = jest.fn();
  const serverTo = jest.fn().mockReturnValue({ emit: roomEmit });

  const mockServer = {
    to: serverTo,
  } as unknown as Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourGateway,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: PlanService,
          // Không hạ gói trong test gateway: trả nguyên trạng thái user
          useValue: {
            resolveAccount: jest.fn(<T>(user: T) => Promise.resolve(user)),
          },
        },
      ],
    }).compile();

    gateway = module.get<TourGateway>(TourGateway);
    gateway.server = mockServer;

    jest.clearAllMocks();
  });

  describe('middleware xác thực (afterInit)', () => {
    type Middleware = (socket: Socket, next: (err?: Error) => void) => void;

    /** Lấy middleware gateway đăng ký vào namespace và chạy cho 1 socket. */
    const runMiddleware = async (
      socket: Socket,
    ): Promise<(Error & { data?: { code: string } }) | undefined> => {
      let middleware: Middleware | undefined;
      const fakeServer = {
        use: (fn: Middleware) => {
          middleware = fn;
        },
      } as unknown as Server;
      gateway.afterInit(fakeServer);
      return new Promise((resolve) => {
        middleware!(socket, (err?: Error) =>
          resolve(err as (Error & { data?: { code: string } }) | undefined),
        );
      });
    };

    it('token hợp lệ → cho kết nối và lưu userId trước khi connect', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, email: 'test@test.com' });

      const err = await runMiddleware(mockSocket);

      expect(err).toBeUndefined();
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt-token', {
        secret: 'test-jwt-secret',
      });
      expect(socketData.userId).toBe(1);
      expect(socketData.email).toBe('test@test.com');
    });

    it('thiếu token → connect_error UNAUTHORIZED', async () => {
      const socketNoToken = {
        ...mockSocket,
        data: {},
        handshake: { auth: {}, query: {} },
      } as unknown as Socket;

      const err = await runMiddleware(socketNoToken);

      expect(err?.message).toBe('Thiếu token xác thực');
      expect(err?.data).toEqual({ code: 'UNAUTHORIZED' });
    });

    it('token không hợp lệ → connect_error UNAUTHORIZED', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const err = await runMiddleware(mockSocket);

      expect(err?.message).toBe('Token không hợp lệ hoặc đã hết hạn');
      expect(err?.data).toEqual({ code: 'UNAUTHORIZED' });
    });

    it('tài khoản hết hạn → connect_error ACCOUNT_EXPIRED', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, email: 'test@test.com' });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 1,
        role: 'TRIAL',
        planExpiresAt: new Date(Date.now() - 1000),
      });

      const err = await runMiddleware(mockSocket);

      expect(err?.message).toContain('hết hạn');
      expect(err?.data).toEqual({ code: 'ACCOUNT_EXPIRED' });
    });

    it('super admin không bao giờ hết hạn', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, email: 'a@a.com' });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 1,
        role: 'SUPER_ADMIN',
        planExpiresAt: new Date(Date.now() - 1000),
      });

      const err = await runMiddleware(mockSocket);

      expect(err).toBeUndefined();
    });
  });

  describe('handleJoinTour', () => {
    const joinPayload = { tourId: 1 };

    beforeEach(() => {
      socketData.userId = 1;
      mockPrismaService.tour.findUnique.mockResolvedValue({
        userId: 1,
        _count: { levels: 7 },
      });
      mockPrismaService.tourControl.findUnique.mockResolvedValue({
        currentLevel: 2,
        isPaused: false,
        pausedAtSecond: 0,
        levelStartedAt: new Date(),
        entries: [],
      });
    });

    it('nên join room và gửi tour-state khi thành công', async () => {
      await gateway.handleJoinTour(mockSocket, joinPayload);

      expect(socketJoin).toHaveBeenCalledWith('tour:1');
      expect(socketEmit).toHaveBeenCalledWith(
        'tour-state',
        expect.objectContaining({
          tourId: 1,
          currentLevel: 2,
          isPaused: false,
          totalLevels: 7,
        }),
      );
    });

    it('nên gửi lỗi khi user chưa xác thực', async () => {
      socketData.userId = undefined;

      await gateway.handleJoinTour(mockSocket, joinPayload);

      expect(socketEmit).toHaveBeenCalledWith('tour-error', {
        message: 'Chưa xác thực',
      });
    });

    it('nên gửi lỗi khi tour không thuộc về user', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue({
        userId: 999,
        _count: { levels: 7 },
      });

      await gateway.handleJoinTour(mockSocket, joinPayload);

      expect(socketEmit).toHaveBeenCalledWith('tour-error', {
        message: 'Bạn không có quyền truy cập tour này',
      });
    });
  });

  describe('handleLeaveTour', () => {
    it('nên rời room', async () => {
      await gateway.handleLeaveTour(mockSocket, { tourId: 1 });
      expect(socketLeave).toHaveBeenCalledWith('tour:1');
    });
  });

  describe('broadcastTourState', () => {
    it('nên broadcast state tới room', async () => {
      mockPrismaService.tourLevel.count.mockResolvedValue(7);
      mockPrismaService.tourControl.findUnique.mockResolvedValue({
        currentLevel: 3,
        isPaused: true,
        pausedAtSecond: 120,
        levelStartedAt: null,
        entries: [{ name: 'Player 1', isEliminated: false }],
      });

      await gateway.broadcastTourState(1);

      expect(serverTo).toHaveBeenCalledWith('tour:1');
      expect(roomEmit).toHaveBeenCalledWith(
        'tour-state',
        expect.objectContaining({
          tourId: 1,
          currentLevel: 3,
          isPaused: true,
          elapsedSeconds: 120,
          totalLevels: 7,
        }),
      );
    });
  });

  describe('computeTourState', () => {
    it('nên tính đúng elapsedSeconds khi đang pause', async () => {
      mockPrismaService.tourControl.findUnique.mockResolvedValue({
        currentLevel: 2,
        isPaused: true,
        pausedAtSecond: 300,
        levelStartedAt: null,
        entries: [],
      });

      const state = await gateway.computeTourState(1, 7);

      expect(state.elapsedSeconds).toBe(300);
      expect(state.isPaused).toBe(true);
    });

    it('nên tính đúng elapsedSeconds khi đang chạy', async () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      mockPrismaService.tourControl.findUnique.mockResolvedValue({
        currentLevel: 1,
        isPaused: false,
        pausedAtSecond: 0,
        levelStartedAt: fiveSecondsAgo,
        entries: [],
      });

      const state = await gateway.computeTourState(1, 7);

      expect(state.elapsedSeconds).toBeGreaterThanOrEqual(5);
    });

    it('nên lấy regEnd từ tour trong cùng một query', async () => {
      mockPrismaService.tourControl.findUnique.mockResolvedValue({
        currentLevel: 1,
        isPaused: true,
        pausedAtSecond: 0,
        levelStartedAt: null,
        entries: [],
        tour: { regEnd: 3 },
      });

      await gateway.computeTourState(1, 7);

      expect(mockPrismaService.tourControl.findUnique).toHaveBeenCalledWith({
        where: { tourId: 1 },
        include: { tour: { select: { regEnd: true } } },
      });
    });

    it.each([
      { regEnd: null, currentLevel: 5, isRegOpen: true },
      { regEnd: 3, currentLevel: 2, isRegOpen: true },
      { regEnd: 3, currentLevel: 3, isRegOpen: true },
      { regEnd: 3, currentLevel: 4, isRegOpen: false },
    ])(
      'regEnd=$regEnd, currentLevel=$currentLevel → isRegOpen=$isRegOpen',
      async ({ regEnd, currentLevel, isRegOpen }) => {
        mockPrismaService.tourControl.findUnique.mockResolvedValue({
          currentLevel,
          isPaused: true,
          pausedAtSecond: 0,
          levelStartedAt: null,
          entries: [],
          tour: { regEnd },
        });

        const state = await gateway.computeTourState(1, 7);

        expect(state.regEnd).toBe(regEnd);
        expect(state.isRegOpen).toBe(isRegOpen);
      },
    );
  });

  describe('broadcastTourLevels', () => {
    it('nên broadcast danh sách level tới room', async () => {
      const mockLevels = [
        {
          id: 10,
          name: 'Level 1',
          type: 'BLIND',
          idx: 1,
          duration: 20,
          smallBlind: 100,
          bigBlind: 200,
          ante: 100,
        },
        {
          id: 11,
          name: 'Break',
          type: 'BREAK',
          idx: 2,
          duration: 10,
          smallBlind: null,
          bigBlind: null,
          ante: null,
        },
      ];
      mockPrismaService.tourLevel.findMany.mockResolvedValue(mockLevels);

      await gateway.broadcastTourLevels(1);

      expect(mockPrismaService.tourLevel.findMany).toHaveBeenCalledWith({
        where: { tourId: 1 },
        orderBy: { idx: 'asc' },
      });
      expect(serverTo).toHaveBeenCalledWith('tour:1');
      expect(roomEmit).toHaveBeenCalledWith('tour-levels', {
        tourId: 1,
        levels: [
          {
            id: 10,
            name: 'Level 1',
            type: 'BLIND',
            idx: 1,
            duration: 20,
            smallBlind: 100,
            bigBlind: 200,
            ante: 100,
          },
          {
            id: 11,
            name: 'Break',
            type: 'BREAK',
            idx: 2,
            duration: 10,
            smallBlind: null,
            bigBlind: null,
            ante: null,
          },
        ],
      });
    });
  });
});
