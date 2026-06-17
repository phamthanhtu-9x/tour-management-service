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

// Lấy mock instance để config trong từng test
const mockPrismaService = {
  tour: { findUnique: jest.fn() },
  tourControl: { findUnique: jest.fn() },
  tourLevel: { count: jest.fn(), findMany: jest.fn() },
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret'),
};

describe('TourGateway', () => {
  let gateway: TourGateway;

  const mockSocket = {
    id: 'test-socket-id',
    handshake: {
      auth: { token: 'valid-jwt-token' },
      query: {},
    },
    data: {},
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket;

  const mockServer = {
    to: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  } as unknown as Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourGateway,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    gateway = module.get<TourGateway>(TourGateway);
    gateway.server = mockServer;

    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('nên xác thực và lưu userId khi token hợp lệ', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, email: 'test@test.com' });

      await gateway.handleConnection(mockSocket);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt-token', {
        secret: 'test-jwt-secret',
      });
      expect(mockSocket.data.userId).toBe(1);
      expect(mockSocket.data.email).toBe('test@test.com');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('nên disconnect khi thiếu token', async () => {
      const socketNoToken = {
        ...mockSocket,
        handshake: { auth: {}, query: {} },
      } as unknown as Socket;

      await gateway.handleConnection(socketNoToken);

      expect(socketNoToken.emit).toHaveBeenCalledWith('tour-error', {
        message: 'Thiếu token xác thực',
      });
      expect(socketNoToken.disconnect).toHaveBeenCalled();
    });

    it('nên disconnect khi token không hợp lệ', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('tour-error', {
        message: 'Token không hợp lệ hoặc đã hết hạn',
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleJoinTour', () => {
    const joinPayload = { tourId: 1 };

    beforeEach(() => {
      mockSocket.data.userId = 1;
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

      expect(mockSocket.join).toHaveBeenCalledWith('tour:1');
      expect(mockSocket.emit).toHaveBeenCalledWith(
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
      mockSocket.data.userId = undefined;

      await gateway.handleJoinTour(mockSocket, joinPayload);

      expect(mockSocket.emit).toHaveBeenCalledWith('tour-error', {
        message: 'Chưa xác thực',
      });
    });

    it('nên gửi lỗi khi tour không thuộc về user', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue({
        userId: 999,
        _count: { levels: 7 },
      });

      await gateway.handleJoinTour(mockSocket, joinPayload);

      expect(mockSocket.emit).toHaveBeenCalledWith('tour-error', {
        message: 'Bạn không có quyền truy cập tour này',
      });
    });
  });

  describe('handleLeaveTour', () => {
    it('nên rời room', async () => {
      await gateway.handleLeaveTour(mockSocket, { tourId: 1 });
      expect(mockSocket.leave).toHaveBeenCalledWith('tour:1');
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

      expect(mockServer.to).toHaveBeenCalledWith('tour:1');
      const roomEmit = (mockServer.to as jest.Mock).mock.results[0].value.emit;
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
      expect(mockServer.to).toHaveBeenCalledWith('tour:1');
      const roomEmit = (mockServer.to as jest.Mock).mock.results[0].value.emit;
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
