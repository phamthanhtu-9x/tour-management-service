import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import {
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TourService } from './tour.service';
import { PlanService } from '../plan/plan.service';
import { ACCOUNT_EXPIRED_MESSAGE, isAccountExpired } from '../plan/expiry.util';
import {
  computeUndoableIds,
  isRegistrationOpen,
  normalizeEntries,
  toEntryLogItem,
} from './tour.utils';

/**
 * Một entry (người chơi) trong danh sách entries của tour control.
 */
export interface PlayerEntry {
  /** Id (uuid) của entry do server sinh – dùng cho xoá/rebuy */
  id: string;
  /** Id của player (bảng players); không có nếu là khách vãng lai */
  playerId?: number;
  name: string;
  avatar?: string;
  isEliminated: boolean;
  reBuyCount: number;
  /** Số chip của từng lần add-on, ví dụ [10000, 10000] */
  addOn: number[];
}

/**
 * Một level của tour – dữ liệu gửi real-time cho frontend.
 */
export interface TourLevelData {
  id: number;
  name: string | null;
  type: string; // 'BLIND' | 'BREAK'
  idx: number;
  duration: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
}

/**
 * Dữ liệu trạng thái tour được gửi cho frontend.
 */
export interface TourState {
  tourId: number;
  currentLevel: number;
  isPaused: boolean;
  /** Tour đã được start và chưa bị reset hay chưa */
  isRunning: boolean;
  /** Tổng số giây đã trôi trong level hiện tại, do server tính */
  elapsedSeconds: number;
  /** Tổng số level của tour */
  totalLevels: number;
  /** Danh sách người chơi (entries) */
  entries: PlayerEntry[];
  /** Chuỗi GTD (giải thưởng) dạng '10/5/3/3/1/..' */
  gtd: string | null;
  /** Idx của level mà đăng ký (re-entry) kết thúc; null = không giới hạn */
  regEnd: number | null;
  /** Đăng ký còn mở: regEnd null hoặc currentLevel <= regEnd */
  isRegOpen: boolean;
}

/**
 * Dữ liệu gắn vào `socket.data` sau khi xác thực.
 */
interface SocketData {
  userId?: number;
  email?: string;
}

export type EntryLogActionType = 'ADD' | 'REMOVE' | 'REBUY' | 'BULK_UPDATE';

/** Một dòng log thao tác entries (gửi cho frontend, không kèm snapshot). */
export interface EntryLogItem {
  id: number;
  action: EntryLogActionType;
  /** Id (uuid) entry bị tác động; null với BULK_UPDATE */
  entryId: string | null;
  /** Tên entry tại thời điểm thao tác */
  entryName: string | null;
  createdAt: Date;
  /** Khác null = đã undo */
  undoneAt: Date | null;
}

/**
 * Payload event `tour-log`.
 * - snapshot: gửi khi join-tour (toàn bộ log hiện có)
 * - created:  vừa có thao tác mới
 * - undone:   vừa undo một thao tác
 * - reset:    log bị xoá (reset clock)
 */
export interface UndoState {
  /** Còn thao tác chưa undo (nút "Hoàn tác" gần nhất bật được) */
  canUndo: boolean;
  /** Id các log hiện có thể hoàn tác riêng lẻ (mới nhất trước) */
  undoableLogIds: number[];
}

export type TourLogEvent =
  | ({ tourId: number; type: 'snapshot'; logs: EntryLogItem[] } & UndoState)
  | ({ tourId: number; type: 'created'; log: EntryLogItem } & UndoState)
  | ({ tourId: number; type: 'undone'; log: EntryLogItem } & UndoState)
  | ({ tourId: number; type: 'reset' } & UndoState);

export type TourLogSnapshot = Extract<TourLogEvent, { type: 'snapshot' }>;

export interface TourLevelsPayload {
  tourId: number;
  levels: TourLevelData[];
}

/** Mã lỗi gửi kèm `connect_error` (err.data.code) khi xác thực WebSocket thất bại. */
export type SocketAuthErrorCode = 'UNAUTHORIZED' | 'ACCOUNT_EXPIRED';

/** Lỗi xác thực WebSocket – Socket.IO gửi `message` và `data` cho client qua `connect_error`. */
export class SocketAuthError extends Error {
  readonly data: { code: SocketAuthErrorCode };
  constructor(message: string, code: SocketAuthErrorCode) {
    super(message);
    this.data = { code };
  }
}

/** Chuẩn hoá mọi lỗi xác thực thành SocketAuthError (mặc định UNAUTHORIZED). */
function toConnectError(err: unknown): SocketAuthError {
  if (err instanceof SocketAuthError) return err;
  return new SocketAuthError(
    err instanceof Error ? err.message : 'Xác thực thất bại',
    'UNAUTHORIZED',
  );
}

@Injectable()
@WebSocketGateway({
  namespace: '/tour',
  cors: {
    origin: ['http://localhost:8082'],
    credentials: true,
  },
})
export class TourGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => TourService))
    private readonly tourService: TourService,
    private readonly planService: PlanService,
  ) {}

  // ---------------------------------------------------------------------------
  // Auth helpers
  // ---------------------------------------------------------------------------

  /**
   * Trích xuất và xác thực JWT từ handshake.auth.token.
   * Trả về payload (chứa `sub` là userId, `email`...).
   */
  private verifyToken(client: Socket): { sub: number; email: string } {
    const auth = client.handshake.auth as { token?: string } | undefined;
    const token: string | undefined =
      auth?.token || (client.handshake.query?.token as string | undefined);

    if (!token) {
      throw new UnauthorizedException('Thiếu token xác thực');
    }

    try {
      const payload = this.jwtService.verify<{ sub: number; email: string }>(
        token,
        {
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      );
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

  /**
   * Đăng ký middleware xác thực cho namespace /tour.
   * Middleware chạy TRƯỚC khi kết nối được chấp nhận → client chỉ nhận `connect`
   * khi đã xác thực xong (socket.data.userId đã có), nên `join-tour` gửi ngay sau
   * `connect` luôn hợp lệ. Lỗi xác thực → client nhận `connect_error`
   * (err.message, err.data.code) và Socket.IO client không tự reconnect.
   */
  afterInit(server: Server | Namespace): void {
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((err: unknown) => next(toConnectError(err)));
    });
  }

  /**
   * Xác thực socket: verify JWT → nạp user → hạ gói STANDARD hết hạn (nếu có)
   * → chặn tài khoản hết hạn → lưu userId vào socket.data.
   */
  async authenticate(client: Socket): Promise<void> {
    const payload = this.verifyToken(client);
    const found = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, planExpiresAt: true },
    });
    if (!found) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }
    // STANDARD hết hạn → tự hạ TRIAL (thêm downgradeDays) trước khi xét khoá
    const user = await this.planService.resolveAccount(found);
    if (isAccountExpired(user.role, user.planExpiresAt)) {
      throw new SocketAuthError(ACCOUNT_EXPIRED_MESSAGE, 'ACCOUNT_EXPIRED');
    }
    const socketData = client.data as SocketData;
    socketData.userId = payload.sub;
    socketData.email = payload.email;
  }

  handleDisconnect(): void {
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
      const userId = (client.data as SocketData).userId;
      if (!userId) {
        throw new UnauthorizedException('Chưa xác thực');
      }

      const tourId = data.tourId;
      const { totalLevels } = await this.verifyTourOwnership(userId, tourId);

      // Join room
      const room = `tour:${tourId}`;
      await client.join(room);

      // Fallback: tự advance nếu level đã hết giờ (vd timer mất do server restart)
      await this.tourService.ensureTourAdvance(tourId);

      // Lấy state hiện tại từ DB và gửi ngay cho client vừa join
      const state = await this.computeTourState(tourId, totalLevels);
      client.emit('tour-state', state);

      // Gửi kèm danh sách level để client có snapshot ban đầu
      const levels = await this.prismaService.tourLevel.findMany({
        where: { tourId },
        orderBy: { idx: 'asc' },
      });
      client.emit('tour-levels', {
        tourId,
        levels: levels.map((l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          idx: l.idx,
          duration: l.duration,
          smallBlind: l.smallBlind,
          bigBlind: l.bigBlind,
          ante: l.ante,
        })),
      } as TourLevelsPayload);

      // Snapshot log thao tác entries
      client.emit('tour-log', await this.getLogSnapshot(tourId));
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

  /**
   * Broadcast danh sách level mới nhất đến tất cả client trong room.
   * Được TourService gọi sau khi levels thay đổi (updateTour có kèm levels).
   */
  async broadcastTourLevels(tourId: number): Promise<void> {
    const levels = await this.prismaService.tourLevel.findMany({
      where: { tourId },
      orderBy: { idx: 'asc' },
    });
    const payload: TourLevelsPayload = {
      tourId,
      levels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        idx: l.idx,
        duration: l.duration,
        smallBlind: l.smallBlind,
        bigBlind: l.bigBlind,
        ante: l.ante,
      })),
    };
    const room = `tour:${tourId}`;
    this.server.to(room).emit('tour-levels', payload);
  }

  /**
   * Broadcast một sự kiện log thao tác entries tới room.
   * Được TourService gọi sau thêm/xoá/rebuy/cập nhật/undo/reset.
   */
  broadcastTourLog(event: TourLogEvent): void {
    this.server.to(`tour:${event.tourId}`).emit('tour-log', event);
  }

  /** Toàn bộ log của tour (mới nhất trước) + có undo được không. */
  async getLogSnapshot(tourId: number): Promise<TourLogSnapshot> {
    const logs = await this.prismaService.tourEntryLog.findMany({
      where: { tourId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        action: true,
        entryId: true,
        entryName: true,
        createdAt: true,
        undoneAt: true,
      },
    });
    const items = logs.map(toEntryLogItem);
    const active = items.filter((l) => l.undoneAt === null);
    return {
      tourId,
      type: 'snapshot',
      logs: items,
      canUndo: active.length > 0,
      undoableLogIds: computeUndoableIds(active),
    };
  }

  /** Trạng thái undo hiện tại của tour (dùng kèm các event tour-log). */
  async getUndoState(tourId: number): Promise<UndoState> {
    const active = await this.prismaService.tourEntryLog.findMany({
      where: { tourId, undoneAt: null },
      select: { id: true, action: true, entryId: true },
    });
    return {
      canUndo: active.length > 0,
      undoableLogIds: computeUndoableIds(active),
    };
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
      include: { tour: { select: { regEnd: true } } },
    });

    if (!control) {
      throw new Error('Tour chưa có control');
    }

    if (totalLevels === undefined) {
      totalLevels = await this.getTotalLevels(tourId);
    }

    // Tính elapsedSeconds bằng server clock
    const elapsedSeconds = this.calcElapsedSeconds(control);
    const regEnd = control.tour?.regEnd ?? null;

    return {
      tourId,
      currentLevel: control.currentLevel,
      isPaused: control.isPaused,
      isRunning: control.isRunning,
      elapsedSeconds,
      totalLevels,
      entries: normalizeEntries(control.entries),
      gtd: control.gtd,
      regEnd,
      isRegOpen: isRegistrationOpen(regEnd, control.currentLevel),
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
