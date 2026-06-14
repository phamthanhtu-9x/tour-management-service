import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dữ liệu trạng thái tour được gửi cho frontend.
 */
export interface TourState {
  tourId: number;
  currentLevel: number;
  isPaused: boolean;
  /** Tổng số giây đã trôi trong level hiện tại, do server tính */
  elapsedSeconds: number;
  /** Tổng số level của tour */
  totalLevels: number;
  /** Danh sách người chơi (entries) */
  entries: unknown;
}

@Injectable()
@WebSocketGateway({
  namespace: '/tour',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class TourGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ---------------------------------------------------------------------------
  // Auth helpers
  // ---------------------------------------------------------------------------

  /**
   * Trích xuất và xác thực JWT từ handshake.auth.token.
   * Trả về payload (chứa `sub` là userId, `email`...).
   */
  private verifyToken(client: Socket): { sub: number; email: string } {
    const token: string | undefined =
      client.handshake.auth?.token || client.handshake.query?.token;

    if (!token) {
      throw new UnauthorizedException('Thiếu token xác thực');
    }

    try {
      const payload = this.jwtService.verify(token) as { sub: number; email: string };
      return payload;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }

  /** Xác thực user có quyền truy cập tour này không. */
  private async verifyTourOwnership(
    userId: number,
    tourId: number,
  ): Promise<{ currentLevel: number; totalLevels: number }> {
    const tour = await this.prismaService.tour.findUnique({
      where: { id: tourId },
      select: {
        userId: true,
        _count: { select: { levels: true } },
      },
    });

    if (!tour) {
      throw new UnauthorizedException('Tour không tồn tại');
    }
    if (tour.userId !== userId) {
      throw new UnauthorizedException('Bạn không có quyền truy cập tour này');
    }

    return { currentLevel: 1, totalLevels: tour._count.levels };
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async handleConnection(client: Socket): Promise<void> {
    try {
      const payload = this.verifyToken(client);
      // Lưu userId vào socket data để dùng sau
      client.data.userId = payload.sub;
      client.data.email = payload.email;
    } catch (err) {
      client.emit('tour-error', {
        message: err instanceof Error ? err.message : 'Xác thực thất bại',
      });
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket): void {
    // Không cần cleanup đặc biệt – Socket.IO tự rời room khi disconnect
  }

  // ---------------------------------------------------------------------------
  // Client events
  // ---------------------------------------------------------------------------

  /**
   * Client gửi `join-tour` để bắt đầu nhận real-time state của một tour.
   */
  @SubscribeMessage('join-tour')
  async handleJoinTour(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tourId: number },
  ): Promise<void> {
    try {
      const userId = client.data.userId as number;
      if (!userId) {
        throw new UnauthorizedException('Chưa xác thực');
      }

      const tourId = data.tourId;
      const { totalLevels } = await this.verifyTourOwnership(userId, tourId);

      // Join room
      const room = `tour:${tourId}`;
      await client.join(room);

      // Lấy state hiện tại từ DB và gửi ngay cho client vừa join
      const state = await this.computeTourState(tourId, totalLevels);
      client.emit('tour-state', state);
    } catch (err) {
      client.emit('tour-error', {
        message: err instanceof Error ? err.message : 'Không thể join tour',
      });
    }
  }

  /**
   * Client gửi `leave-tour` để ngừng nhận update của một tour.
   */
  @SubscribeMessage('leave-tour')
  async handleLeaveTour(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tourId: number },
  ): Promise<void> {
    const room = `tour:${data.tourId}`;
    await client.leave(room);
  }

  // ---------------------------------------------------------------------------
  // Public methods – được gọi bởi TourService để broadcast
  // ---------------------------------------------------------------------------

  /**
   * Broadcast trạng thái tour mới nhất đến tất cả client đang trong room.
   * Được TourService gọi sau mỗi thao tác điều khiển.
   */
  async broadcastTourState(tourId: number): Promise<void> {
    const totalLevels = await this.getTotalLevels(tourId);
    const state = await this.computeTourState(tourId, totalLevels);
    const room = `tour:${tourId}`;
    this.server.to(room).emit('tour-state', state);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getTotalLevels(tourId: number): Promise<number> {
    return this.prismaService.tourLevel.count({ where: { tourId } });
  }

  /**
   * Đọc TourControl từ DB, tính elapsedSeconds từ server clock,
   * trả về TourState chuẩn cho frontend.
   */
  async computeTourState(
    tourId: number,
    totalLevels?: number,
  ): Promise<TourState> {
    const control = await this.prismaService.tourControl.findUnique({
      where: { tourId },
    });

    if (!control) {
      throw new Error('Tour chưa có control');
    }

    if (totalLevels === undefined) {
      totalLevels = await this.getTotalLevels(tourId);
    }

    // Tính elapsedSeconds bằng server clock
    const elapsedSeconds = this.calcElapsedSeconds(control);

    return {
      tourId,
      currentLevel: control.currentLevel,
      isPaused: control.isPaused,
      elapsedSeconds,
      totalLevels,
      entries: control.entries ?? [],
    };
  }

  /**
   * Tính số giây đã trôi trong level hiện tại, dùng server `Date.now()`.
   */
  private calcElapsedSeconds(control: {
    isPaused: boolean;
    pausedAtSecond: number;
    levelStartedAt: Date | null;
  }): number {
    if (control.isPaused || !control.levelStartedAt) {
      return control.pausedAtSecond;
    }
    const diff = Math.floor(
      (Date.now() - control.levelStartedAt.getTime()) / 1000,
    );
    return control.pausedAtSecond + Math.max(0, diff);
  }
}
