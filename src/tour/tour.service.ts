import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  forwardRef,
} from '@nestjs/common';
import {
  InsertTourDto,
  UpdateTourDto,
  SetLevelDto,
  PlayerEntryDto,
  UpdateGtdDto,
  AddEntryDto,
} from './dto';
import { randomUUID } from 'crypto';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanService } from 'src/plan/plan.service';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';
import { DEFAULT_TOUR_LEVELS } from './tour.constants';
import { EntryLogActionType, PlayerEntry, TourGateway } from './tour.gateway';
import {
  applyInverse,
  findBlockingLogIds,
  isRegistrationOpen,
  normalizeEntries,
  toEntryLogItem,
} from './tour.utils';

/** Các cột log trả cho frontend (không kèm snapshot before/after). */
const LOG_SELECT = {
  id: true,
  action: true,
  entryId: true,
  entryName: true,
  createdAt: true,
  undoneAt: true,
} as const;

const toJson = (entries: PlayerEntry[]) =>
  entries as unknown as Prisma.InputJsonValue;

/** Bảo đảm mọi entry có id (dữ liệu cũ chưa có id sẽ được gán). */
const withEntryIds = (entries: PlayerEntry[]): PlayerEntry[] =>
  entries.map((entry) => (entry.id ? entry : { ...entry, id: randomUUID() }));

@Injectable()
export class TourService implements OnModuleDestroy {
  /**
   * Timer in-memory cho mỗi tour: tự động chuyển level khi hết duration.
   * Key = tourId, value = handle của setTimeout đang chờ.
   */
  private readonly levelTimers = new Map<number, NodeJS.Timeout>();

  constructor(
    private prismaService: PrismaService,
    @Inject(forwardRef(() => TourGateway))
    private tourGateway: TourGateway,
    private planService: PlanService,
  ) {}

  /** Dọn sạch toàn bộ timer khi service bị huỷ (tránh leak khi shutdown/HMR). */
  onModuleDestroy(): void {
    for (const handle of this.levelTimers.values()) {
      clearTimeout(handle);
    }
    this.levelTimers.clear();
  }
  async getTours(
    userId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResource<any>> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [tours, totalItems] = await this.prismaService.$transaction([
      this.prismaService.tour.findMany({
        where: {
          userId,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.tour.count({
        where: {
          userId,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items: tours,
      meta: {
        totalItems,
        itemCount: tours.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getTourById(tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });
    return tour;
  }

  async getTourLevels(userId: number, tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: { id: tourId },
    });

    if (!tour) {
      throw new NotFoundException('Không tìm thấy tour');
    }
    if (tour.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem tour này');
    }

    return this.prismaService.tourLevel.findMany({
      where: { tourId },
      orderBy: { idx: 'asc' },
    });
  }

  async getTourControl(userId: number, tourId: number) {
    const { control, totalLevels, regEnd } = await this.getOwnedControl(
      userId,
      tourId,
    );

    // Fallback: nếu elapsed >= duration mà chưa được advance (vd mất timer do restart)
    const advanced = await this.ensureAdvanceIfExpired(
      tourId,
      control,
      totalLevels,
    );
    if (advanced) {
      // Load lại control sau khi đã advance
      const updated = await this.getOwnedControl(userId, tourId);
      const elapsed = this.elapsedSeconds(updated.control);
      await this.tourGateway.broadcastTourState(tourId);
      await this.scheduleLevelAdvance(tourId);
      return {
        ...updated.control,
        entries: normalizeEntries(updated.control.entries),
        elapsedSeconds: elapsed,
        totalLevels: updated.totalLevels,
        regEnd: updated.regEnd,
        isRegOpen: isRegistrationOpen(
          updated.regEnd,
          updated.control.currentLevel,
        ),
      };
    }

    const elapsed = this.elapsedSeconds(control);
    return {
      ...control,
      entries: normalizeEntries(control.entries),
      elapsedSeconds: elapsed,
      totalLevels,
      regEnd,
      isRegOpen: isRegistrationOpen(regEnd, control.currentLevel),
    };
  }

  async insertTour(userId: number, insertTourDto: InsertTourDto) {
    await this.planService.assertCanCreateTour(userId);
    // Lấy cấu hình level mặc định của user; nếu chưa có thì dùng bộ mặc định sẵn
    const userDefaultLevels = await this.prismaService.defaultLevel.findMany({
      where: { userId },
      orderBy: { idx: 'asc' },
    });

    const levels =
      userDefaultLevels.length > 0
        ? userDefaultLevels.map((level) => ({
            name: level.name,
            type: level.type,
            idx: level.idx,
            duration: level.duration,
            smallBlind: level.smallBlind,
            bigBlind: level.bigBlind,
            ante: level.ante,
          }))
        : DEFAULT_TOUR_LEVELS;

    this.assertValidRegEnd(insertTourDto.regEnd, levels.length);

    const tour = await this.prismaService.tour.create({
      data: {
        ...insertTourDto,
        userId,
        levels: {
          create: levels,
        },
        control: {
          create: {},
        },
      },
      include: {
        levels: {
          orderBy: {
            idx: 'asc',
          },
        },
        control: true,
      },
    });

    return tour;
  }

  async updateTour(
    userId: number,
    tourId: number,
    updateTourDto: UpdateTourDto,
  ) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });

    if (!tour) {
      throw new ForbiddenException('Tour not found to update');
    }
    if (tour.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền sửa tour này');
    }

    const { levels, ...rest } = updateTourDto;
    // regEnd có trong body (kể cả null để xoá giới hạn)
    const regEndChanged = rest.regEnd !== undefined;

    // regEnd phải hợp lệ với bộ level SAU khi cập nhật
    if (regEndChanged || levels) {
      const nextRegEnd = regEndChanged ? rest.regEnd : tour.regEnd;
      const nextTotalLevels = levels
        ? levels.length
        : await this.prismaService.tourLevel.count({ where: { tourId } });
      this.assertValidRegEnd(nextRegEnd, nextTotalLevels);
    }

    const result = await this.prismaService.tour.update({
      where: {
        id: tourId,
      },
      data: {
        ...rest,
        // Nếu có gửi levels thì thay thế toàn bộ level hiện tại của tour
        ...(levels
          ? {
              levels: {
                deleteMany: {},
                create: levels,
              },
            }
          : {}),
      },
      include: {
        levels: {
          orderBy: {
            idx: 'asc',
          },
        },
      },
    });

    // Nếu levels thay đổi, broadcast real-time đến các client đang xem tour
    if (levels) {
      await this.tourGateway.broadcastTourLevels(tourId);
    }
    // tour-state chứa totalLevels, regEnd, isRegOpen → broadcast khi một trong
    // các giá trị này có thể đã thay đổi
    if (levels || regEndChanged) {
      await this.tourGateway.broadcastTourState(tourId);
    }

    return result;
  }

  /** regEnd phải nằm trong số level của tour (null/undefined = không giới hạn). */
  private assertValidRegEnd(
    regEnd: number | null | undefined,
    totalLevels: number,
  ): void {
    if (regEnd != null && regEnd > totalLevels) {
      throw new BadRequestException(
        `regEnd (${regEnd}) vượt quá số level của tour (${totalLevels})`,
      );
    }
  }

  async deleteTour(tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });

    if (!tour) {
      throw new ForbiddenException('Tour not found to delete');
    }

    return await this.prismaService.tour.delete({
      where: {
        id: tourId,
      },
    });
  }

  // --- ĐIỀU KHIỂN CLOCK ---

  /**
   * Tải tour + control, kiểm tra tour tồn tại và thuộc về user đang đăng nhập.
   * Trả về control hiện tại cùng số level của tour.
   */
  private async getOwnedControl(userId: number, tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: { id: tourId },
      include: {
        control: true,
        _count: { select: { levels: true } },
      },
    });

    if (!tour) {
      throw new NotFoundException('Không tìm thấy tour');
    }
    if (tour.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền điều khiển tour này');
    }
    if (!tour.control) {
      throw new NotFoundException('Tour chưa có cấu hình điều khiển');
    }

    return {
      control: tour.control,
      totalLevels: tour._count.levels,
      regEnd: tour.regEnd,
    };
  }

  private updateControl(
    controlId: number,
    data: {
      currentLevel?: number;
      isPaused?: boolean;
      isRunning?: boolean;
      pausedAtSecond?: number;
      levelStartedAt?: Date | null;
    },
  ) {
    return this.prismaService.tourControl.update({
      where: { id: controlId },
      data,
    });
  }

  /** Số giây đã trôi trong level hiện tại tại thời điểm now. */
  private elapsedSeconds(control: {
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

  // --- AUTO-ADVANCE TIMER ---

  /** Huỷ timer đang chờ của một tour (nếu có). */
  private clearLevelTimer(tourId: number): void {
    const handle = this.levelTimers.get(tourId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.levelTimers.delete(tourId);
    }
  }

  /**
   * Đọc duration (giây) của level hiện tại trong DB.
   * Trả về null nếu không tìm thấy level.
   */
  private async getLevelDuration(
    tourId: number,
    currentLevel: number,
  ): Promise<number | null> {
    const level = await this.prismaService.tourLevel.findUnique({
      where: { tourId_idx: { tourId, idx: currentLevel } },
      select: { duration: true },
    });
    return level?.duration ?? null;
  }

  /**
   * Đọc các mảnh cần thiết từ DB để tính thời gian còn lại.
   * Trả về null nếu tour/control không tồn tại hoặc đã dừng.
   */
  private async loadAdvanceContext(tourId: number): Promise<{
    controlId: number;
    currentLevel: number;
    totalLevels: number;
    isPaused: boolean;
    pausedAtSecond: number;
    elapsed: number;
  } | null> {
    const tour = await this.prismaService.tour.findUnique({
      where: { id: tourId },
      select: {
        control: {
          select: {
            id: true,
            currentLevel: true,
            isPaused: true,
            pausedAtSecond: true,
            levelStartedAt: true,
            isRunning: true,
          },
        },
        _count: { select: { levels: true } },
      },
    });
    if (!tour?.control) return null;
    if (!tour.control.isRunning) return null; // Đã dừng/không chạy → không đặt timer

    const { control, _count } = tour;
    const elapsed = this.elapsedSeconds({
      isPaused: control.isPaused,
      pausedAtSecond: control.pausedAtSecond,
      levelStartedAt: control.levelStartedAt,
    });

    return {
      controlId: control.id,
      currentLevel: control.currentLevel,
      totalLevels: _count.levels,
      isPaused: control.isPaused,
      pausedAtSecond: control.pausedAtSecond,
      elapsed,
    };
  }

  /**
   * Đặt setTimeout để tự động advance level sau khi hết duration.
   * @param tourId ID của tour
   */
  private async scheduleLevelAdvance(tourId: number): Promise<void> {
    // Luôn clear timer cũ trước khi đặt mới
    this.clearLevelTimer(tourId);

    const ctx = await this.loadAdvanceContext(tourId);
    if (!ctx) return; // Tour không tồn tại hoặc không running
    if (ctx.isPaused) return; // Đang pause → không đặt timer

    const duration = await this.getLevelDuration(tourId, ctx.currentLevel);
    if (duration === null || duration <= 0) return;

    const remainingMs = Math.max(0, (duration * 60 - ctx.elapsed) * 1000);

    const handle = setTimeout(() => {
      void this.onLevelTimer(tourId);
    }, remainingMs);

    this.levelTimers.set(tourId, handle);
  }

  /**
   * Callback khi timer của một level hết hạn.
   * Kiểm tra lại DB trước khi advance (tránh race condition).
   */
  private async onLevelTimer(tourId: number): Promise<void> {
    this.levelTimers.delete(tourId);

    const ctx = await this.loadAdvanceContext(tourId);
    if (!ctx) return; // Tour đã bị xoá hoặc đã dừng
    if (ctx.isPaused) return; // Đã pause giữa chừng

    const duration = await this.getLevelDuration(tourId, ctx.currentLevel);
    if (duration === null || duration <= 0) return;

    // Chỉ advance nếu thực sự đã hết thời gian (bảo vệ race condition)
    if (ctx.elapsed < duration * 60) {
      // Chưa thực sự hết — đặt lại timer cho phần còn lại
      await this.scheduleLevelAdvance(tourId);
      return;
    }

    // Level hiện tại đã hết giờ → auto advance
    await this.autoAdvance(tourId, ctx);
  }

  /** Tự động chuyển level hoặc kết thúc tour. */
  private async autoAdvance(
    tourId: number,
    ctx: NonNullable<Awaited<ReturnType<TourService['loadAdvanceContext']>>>,
  ): Promise<void> {
    if (ctx.currentLevel >= ctx.totalLevels) {
      // Level cuối đã hết → dừng clock
      await this.updateControl(ctx.controlId, {
        isPaused: true,
        isRunning: false,
        pausedAtSecond: 0,
        levelStartedAt: null,
      });
      await this.tourGateway.broadcastTourState(tourId);
      return;
    }

    // Chuyển sang level kế tiếp
    await this.updateControl(ctx.controlId, {
      currentLevel: ctx.currentLevel + 1,
      pausedAtSecond: 0,
      levelStartedAt: new Date(),
    });
    await this.tourGateway.broadcastTourState(tourId);

    // Đặt timer cho level mới
    await this.scheduleLevelAdvance(tourId);
  }

  /**
   * Fallback: tự động advance nếu phát hiện elapsed >= duration.
   * Dùng trong getControl và WebSocket join-tour để sửa trạng thái
   * khi timer bị mất (VD: server restart).
   * Trả về true nếu đã advance (để caller biết state đã thay đổi và broadcast).
   */
  private async ensureAdvanceIfExpired(
    tourId: number,
    control: {
      id: number;
      isRunning: boolean;
      isPaused: boolean;
      currentLevel: number;
      pausedAtSecond: number;
      levelStartedAt: Date | null;
    },
    totalLevels: number,
  ): Promise<boolean> {
    // Chỉ kiểm tra khi clock đang chạy và không pause
    if (!control.isRunning || control.isPaused) return false;

    const duration = await this.getLevelDuration(tourId, control.currentLevel);
    if (duration === null || duration <= 0) return false;

    const elapsed = this.elapsedSeconds({
      isPaused: control.isPaused,
      pausedAtSecond: control.pausedAtSecond,
      levelStartedAt: control.levelStartedAt,
    });

    if (elapsed < duration * 60) return false;

    // Đã hết giờ — advance hoặc kết thúc
    if (control.currentLevel >= totalLevels) {
      await this.updateControl(control.id, {
        isPaused: true,
        isRunning: false,
        pausedAtSecond: 0,
        levelStartedAt: null,
      });
    } else {
      await this.updateControl(control.id, {
        currentLevel: control.currentLevel + 1,
        pausedAtSecond: 0,
        levelStartedAt: new Date(),
      });
    }

    return true; // Báo hiệu đã có thay đổi
  }

  async startClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    await this.planService.assertCanStartTour(userId, tourId);
    const result = await this.updateControl(control.id, {
      isPaused: false,
      isRunning: true,
      pausedAtSecond: 0,
      levelStartedAt: new Date(),
    });
    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return result;
  }

  async pauseClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (control.isPaused) {
      return control;
    }
    this.clearLevelTimer(tourId);
    const result = await this.updateControl(control.id, {
      isPaused: true,
      pausedAtSecond: this.elapsedSeconds(control),
      levelStartedAt: null,
    });
    await this.tourGateway.broadcastTourState(tourId);
    return result;
  }

  async resumeClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (!control.isPaused) {
      return control;
    }
    const result = await this.updateControl(control.id, {
      isPaused: false,
      levelStartedAt: new Date(),
    });
    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return result;
  }

  async nextLevel(userId: number, tourId: number) {
    const { control, totalLevels } = await this.getOwnedControl(userId, tourId);
    if (control.currentLevel >= totalLevels) {
      throw new ForbiddenException('Đã ở level cuối cùng');
    }
    const result = await this.goToLevel(control, control.currentLevel + 1);
    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return result;
  }

  async prevLevel(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (control.currentLevel <= 1) {
      throw new ForbiddenException('Đã ở level đầu tiên');
    }
    const result = await this.goToLevel(control, control.currentLevel - 1);
    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return result;
  }

  async setLevel(userId: number, tourId: number, dto: SetLevelDto) {
    const { control, totalLevels } = await this.getOwnedControl(userId, tourId);
    if (dto.level > totalLevels) {
      throw new ForbiddenException(
        `Level không hợp lệ (tour chỉ có ${totalLevels} level)`,
      );
    }
    const result = await this.goToLevel(control, dto.level);
    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return result;
  }

  /** Nhảy tới level mới: reset thời gian, giữ nguyên trạng thái pause hiện tại. */
  private goToLevel(
    control: { id: number; isPaused: boolean },
    targetLevel: number,
  ) {
    return this.updateControl(control.id, {
      currentLevel: targetLevel,
      pausedAtSecond: 0,
      levelStartedAt: control.isPaused ? null : new Date(),
    });
  }

  /**
   * Public wrapper cho Gateway: kiểm tra và tự động advance nếu level đã hết giờ.
   * Được gọi khi client join tour (fallback nếu timer mất do restart).
   */
  async ensureTourAdvance(tourId: number): Promise<void> {
    const tour = await this.prismaService.tour.findUnique({
      where: { id: tourId },
      select: {
        control: {
          select: {
            id: true,
            isRunning: true,
            isPaused: true,
            currentLevel: true,
            pausedAtSecond: true,
            levelStartedAt: true,
          },
        },
        _count: { select: { levels: true } },
      },
    });
    if (!tour?.control) return;

    const advanced = await this.ensureAdvanceIfExpired(
      tourId,
      tour.control,
      tour._count.levels,
    );
    if (advanced) {
      await this.tourGateway.broadcastTourState(tourId);
      await this.scheduleLevelAdvance(tourId);
    }
  }

  async resetClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    this.clearLevelTimer(tourId);
    // Reset clock xoá luôn entries và log thao tác entries của tour
    const [result] = await this.prismaService.$transaction([
      this.prismaService.tourControl.update({
        where: { id: control.id },
        data: {
          currentLevel: 1,
          isPaused: true,
          isRunning: false,
          pausedAtSecond: 0,
          levelStartedAt: null,
          entries: [],
          gtd: null,
        },
      }),
      this.prismaService.tourEntryLog.deleteMany({ where: { tourId } }),
    ]);
    await this.tourGateway.broadcastTourState(tourId);
    this.tourGateway.broadcastTourLog({
      tourId,
      type: 'reset',
      canUndo: false,
      undoableLogIds: [],
    });
    return result;
  }

  // --- TUA THỜI GIAN (FORWARD / REWIND) ---

  /**
   * Tua tới 5 giây trong level hiện tại.
   * Nếu vượt duration → advance sang level kế tiếp (carry overflow),
   * hoặc kết thúc tour nếu là level cuối.
   */
  async forwardTime(userId: number, tourId: number) {
    return this.adjustTime(userId, tourId, 5);
  }

  /**
   * Tua lùi 5 giây trong level hiện tại.
   * Nếu lùi quá 0 giây → nhảy sang level trước, đặt elapsed ở cuối level đó.
   * Nếu đang ở level 1 thì chỉ clamp về 0.
   */
  async rewindTime(userId: number, tourId: number) {
    return this.adjustTime(userId, tourId, -5);
  }

  /**
   * Điều chỉnh thời gian đã trôi trong level hiện tại.
   *
   * - Tua tới (deltaSeconds > 0): nếu chạm/vượt duration thì advance sang
   *   level kế tiếp, carry overflow sang level mới.
   * - Tua lùi (deltaSeconds < 0): nếu chạm 0 thì nhảy sang level trước,
   *   đặt elapsed = duration của level trước + overflow.
   */
  private async adjustTime(
    userId: number,
    tourId: number,
    deltaSeconds: number,
  ) {
    const { control, totalLevels } = await this.getOwnedControl(userId, tourId);

    this.clearLevelTimer(tourId);

    // --- tua tới vượt duration: advance + carry overflow ---
    if (deltaSeconds > 0) {
      return this.forwardOverflow(control, totalLevels, tourId, deltaSeconds);
    }

    // --- tua lùi quá 0: retreat + carry overflow ---
    if (deltaSeconds < 0) {
      return this.rewindOverflow(control, tourId, deltaSeconds);
    }

    return control;
  }

  /**
   * Tua tới: advance level khi overflow, carry phần dư sang level mới.
   */
  private async forwardOverflow(
    control: {
      id: number;
      currentLevel: number;
      isPaused: boolean;
      pausedAtSecond: number;
      levelStartedAt: Date | null;
    },
    totalLevels: number,
    tourId: number,
    deltaSeconds: number,
  ) {
    let current = control;
    let remaining = deltaSeconds;

    while (remaining > 0) {
      const duration = await this.getLevelDuration(
        tourId,
        current.currentLevel,
      );
      const durationSeconds = (duration ?? 0) * 60;
      const elapsed = this.elapsedSeconds(current);
      const gap = durationSeconds - elapsed; // còn bao nhiêu giây nữa mới hết level

      if (gap > remaining) {
        // Còn đủ chỗ trong level hiện tại → chỉ cần điều chỉnh
        await this.applySkip(current.id, current.isPaused, remaining);
        break;
      }

      // Không đủ chỗ → advance sang level kế tiếp
      remaining -= gap;

      if (current.currentLevel >= totalLevels) {
        // Level cuối → dừng clock
        await this.updateControl(current.id, {
          isPaused: true,
          isRunning: false,
          pausedAtSecond: 0,
          levelStartedAt: null,
        });
        break;
      }

      // Advance sang level kế tiếp, carry overflow
      const next = await this.updateControl(current.id, {
        currentLevel: current.currentLevel + 1,
        pausedAtSecond: 0,
        levelStartedAt: current.isPaused ? null : new Date(),
      });
      current = {
        id: next.id,
        currentLevel: next.currentLevel,
        isPaused: next.isPaused,
        pausedAtSecond: next.pausedAtSecond,
        levelStartedAt: next.levelStartedAt,
      };
    }

    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return current;
  }

  /**
   * Tua lùi: retreat về level trước khi overflow, carry phần dư.
   */
  private async rewindOverflow(
    control: {
      id: number;
      currentLevel: number;
      isPaused: boolean;
      pausedAtSecond: number;
      levelStartedAt: Date | null;
    },
    tourId: number,
    deltaSeconds: number, // luôn âm
  ) {
    let current = control;
    let remaining = Math.abs(deltaSeconds); // làm việc với số dương cho dễ
    const originalPaused = control.isPaused;

    while (remaining > 0) {
      const elapsed = this.elapsedSeconds(current);

      if (remaining <= elapsed) {
        // Còn đủ chỗ trong level hiện tại → lùi bình thường
        await this.applySkip(current.id, current.isPaused, -remaining);
        break;
      }

      // Không đủ chỗ → lùi sang level trước
      remaining -= elapsed;

      if (current.currentLevel <= 1) {
        // Đã ở level 1 → clamp về 0
        await this.updateControl(current.id, {
          pausedAtSecond: originalPaused ? 0 : current.pausedAtSecond,
          levelStartedAt: originalPaused ? null : new Date(),
        });
        break;
      }

      // Lùi sang level trước, đặt elapsed ở cuối level đó
      const prevDuration = await this.getLevelDuration(
        tourId,
        current.currentLevel - 1,
      );
      const prevDurationSeconds = (prevDuration ?? 0) * 60;

      // Lấy duration cũ để trừ overflow (remaining đã trừ hết elapsed của current)
      const startFrom = Math.max(0, prevDurationSeconds - remaining);

      const prev = await this.updateControl(current.id, {
        currentLevel: current.currentLevel - 1,
        pausedAtSecond: startFrom,
        levelStartedAt: originalPaused ? null : new Date(),
      });

      remaining = 0; // đã hấp thụ toàn bộ overflow vào level trước
      current = {
        id: prev.id,
        currentLevel: prev.currentLevel,
        isPaused: prev.isPaused,
        pausedAtSecond: prev.pausedAtSecond,
        levelStartedAt: prev.levelStartedAt,
      };
    }

    await this.tourGateway.broadcastTourState(tourId);
    await this.scheduleLevelAdvance(tourId);
    return current;
  }

  /**
   * Điều chỉnh thời gian trong cùng một level (không overflow).
   * @param skipSeconds > 0 = tua tới, < 0 = tua lùi
   */
  private async applySkip(
    controlId: number,
    isPaused: boolean,
    skipSeconds: number,
  ) {
    const control = await this.prismaService.tourControl.findUnique({
      where: { id: controlId },
      select: {
        id: true,
        isPaused: true,
        pausedAtSecond: true,
        levelStartedAt: true,
      },
    });
    if (!control) return;

    if (control.isPaused) {
      const target = control.pausedAtSecond + skipSeconds;
      await this.updateControl(controlId, {
        pausedAtSecond: Math.max(0, target),
      });
    } else if (skipSeconds > 0) {
      // Tua tới: lùi levelStartedAt
      const newStart = new Date(
        control.levelStartedAt!.getTime() - skipSeconds * 1000,
      );
      await this.updateControl(controlId, { levelStartedAt: newStart });
    } else {
      // Tua lùi: trừ pausedAtSecond trước, phần dư đẩy levelStartedAt
      const reduce = Math.abs(skipSeconds);
      const reduceFromPaused = Math.min(control.pausedAtSecond, reduce);
      const newPaused = control.pausedAtSecond - reduceFromPaused;
      const remainder = reduce - reduceFromPaused;
      const newStart = new Date(
        control.levelStartedAt!.getTime() + remainder * 1000,
      );
      await this.updateControl(controlId, {
        pausedAtSecond: newPaused,
        levelStartedAt: newStart,
      });
    }
  }

  /**
   * Mọi playerId trong entries phải là id của một player có thật
   * và thuộc về user hiện tại.
   */
  private async assertOwnedPlayers(
    userId: number,
    entries: PlayerEntryDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        entries
          .map((entry) => entry.playerId)
          .filter((id): id is number => id != null),
      ),
    ];
    if (ids.length === 0) return;

    const found = await this.prismaService.player.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    const foundIds = new Set(found.map((p) => p.id));
    const invalid = ids.filter((id) => !foundIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `playerId không tồn tại hoặc không thuộc về bạn: ${invalid.join(', ')}`,
      );
    }
  }

  /** Chuẩn hoá một entry từ body request (chưa gồm id). */
  private buildEntry(dto: AddEntryDto): Omit<PlayerEntry, 'id'> {
    return {
      ...(dto.playerId != null ? { playerId: dto.playerId } : {}),
      name: dto.name,
      ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      isEliminated: dto.isEliminated ?? false,
      reBuyCount: dto.reBuyCount ?? 0,
      addOn: dto.addOn ?? [],
    };
  }

  /** Khoá dòng tour_controls (FOR UPDATE) và đọc entries hiện tại. */
  private async lockEntries(
    tx: Prisma.TransactionClient,
    controlId: number,
  ): Promise<PlayerEntry[]> {
    await tx.$queryRaw`SELECT id FROM "tour_controls" WHERE id = ${controlId} FOR UPDATE`;
    const row = await tx.tourControl.findUniqueOrThrow({
      where: { id: controlId },
      select: { entries: true },
    });
    return withEntryIds(normalizeEntries(row.entries));
  }

  /**
   * Thực hiện một thao tác trên entries trong transaction (khoá dòng control
   * để tránh ghi đè khi nhiều thiết bị thao tác cùng lúc), ghi log,
   * rồi broadcast `tour-state` + `tour-log`.
   */
  private async applyEntriesChange(
    userId: number,
    tourId: number,
    action: EntryLogActionType,
    change: (current: PlayerEntry[]) => {
      next: PlayerEntry[];
      entryId?: string | null;
      entryName?: string | null;
    },
  ) {
    const { control } = await this.getOwnedControl(userId, tourId);

    const { updated, next, log } = await this.prismaService.$transaction(
      async (tx) => {
        const current = await this.lockEntries(tx, control.id);
        const { next, entryId = null, entryName = null } = change(current);
        const updated = await tx.tourControl.update({
          where: { id: control.id },
          data: { entries: toJson(next) },
        });
        const log = await tx.tourEntryLog.create({
          data: {
            action,
            entryId,
            entryName,
            before: toJson(current),
            after: toJson(next),
            userId,
            tourId,
          },
          select: LOG_SELECT,
        });
        return { updated, next, log };
      },
    );

    const logItem = toEntryLogItem(log);
    const undoState = await this.tourGateway.getUndoState(tourId);
    await this.tourGateway.broadcastTourState(tourId);
    this.tourGateway.broadcastTourLog({
      tourId,
      type: 'created',
      log: logItem,
      ...undoState,
    });
    return { control: updated, entries: next, log: logItem };
  }

  private findEntryIndex(entries: PlayerEntry[], entryId: string): number {
    const idx = entries.findIndex((entry) => entry.id === entryId);
    if (idx === -1) {
      throw new NotFoundException('Không tìm thấy entry');
    }
    return idx;
  }

  /**
   * Cập nhật hàng loạt (ghi đè toàn bộ entries). Giữ để tương thích ngược;
   * được ghi log dạng BULK_UPDATE. Entry gửi kèm `id` sẽ giữ nguyên id,
   * entry không có `id` được gán id mới.
   */
  async updateEntries(
    userId: number,
    tourId: number,
    entries: PlayerEntryDto[],
  ) {
    const ids = entries.map((e) => e.id).filter((id): id is string => !!id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Danh sách entries có id bị trùng');
    }
    await this.assertOwnedPlayers(userId, entries);

    const normalized: PlayerEntry[] = entries.map((entry) => ({
      id: entry.id ?? randomUUID(),
      ...this.buildEntry(entry),
    }));
    const { control } = await this.applyEntriesChange(
      userId,
      tourId,
      'BULK_UPDATE',
      () => ({ next: normalized }),
    );
    return control;
  }

  /** Thêm một entry vào cuối danh sách. */
  async addEntry(userId: number, tourId: number, dto: AddEntryDto) {
    await this.assertOwnedPlayers(userId, [dto]);
    const entry: PlayerEntry = { id: randomUUID(), ...this.buildEntry(dto) };
    const { entries, log } = await this.applyEntriesChange(
      userId,
      tourId,
      'ADD',
      (current) => ({
        next: [...current, entry],
        entryId: entry.id,
        entryName: entry.name,
      }),
    );
    return { entry, entries, log };
  }

  /** Xoá một entry khỏi danh sách. */
  async removeEntry(userId: number, tourId: number, entryId: string) {
    const { entries, log } = await this.applyEntriesChange(
      userId,
      tourId,
      'REMOVE',
      (current) => {
        const idx = this.findEntryIndex(current, entryId);
        return {
          next: current.filter((_, i) => i !== idx),
          entryId,
          entryName: current[idx].name,
        };
      },
    );
    return { entries, log };
  }

  /** Rebuy: tăng reBuyCount của entry thêm 1. */
  async rebuyEntry(userId: number, tourId: number, entryId: string) {
    let entry: PlayerEntry | undefined;
    const { entries, log } = await this.applyEntriesChange(
      userId,
      tourId,
      'REBUY',
      (current) => {
        const idx = this.findEntryIndex(current, entryId);
        entry = { ...current[idx], reBuyCount: current[idx].reBuyCount + 1 };
        const next = [...current];
        next[idx] = entry;
        return { next, entryId, entryName: entry.name };
      },
    );
    return { entry, entries, log };
  }

  /**
   * Hoàn tác một thao tác entries bằng THAO TÁC NGƯỢC trên danh sách hiện tại.
   * - `logId` bỏ trống → thao tác gần nhất chưa được undo.
   * - Bị chặn (409) nếu phía sau còn thao tác chưa undo phụ thuộc vào nó
   *   (cùng entry, hoặc cập nhật hàng loạt) – trả kèm `details.blockingLogIds`.
   */
  async undoLog(userId: number, tourId: number, logId?: number) {
    const { control } = await this.getOwnedControl(userId, tourId);

    const { restored, log } = await this.prismaService.$transaction(
      async (tx) => {
        const current = await this.lockEntries(tx, control.id);
        const target =
          logId === undefined
            ? await tx.tourEntryLog.findFirst({
                where: { tourId, undoneAt: null },
                orderBy: { id: 'desc' },
              })
            : await tx.tourEntryLog.findFirst({ where: { id: logId, tourId } });
        if (!target) {
          if (logId === undefined) {
            throw new BadRequestException('Không còn thao tác nào để hoàn tác');
          }
          throw new NotFoundException('Không tìm thấy log');
        }
        if (target.undoneAt) {
          throw new BadRequestException('Thao tác này đã được hoàn tác');
        }

        const later = await tx.tourEntryLog.findMany({
          where: { tourId, undoneAt: null, id: { gt: target.id } },
          select: { id: true, action: true, entryId: true },
        });
        const blockingLogIds = findBlockingLogIds(target, later);
        if (blockingLogIds.length > 0) {
          const blockedByBulk = later.some(
            (l) => blockingLogIds.includes(l.id) && l.action === 'BULK_UPDATE',
          );
          throw new ConflictException({
            message:
              target.action === 'BULK_UPDATE'
                ? 'Chỉ hoàn tác được cập nhật hàng loạt khi đó là thao tác mới nhất chưa hoàn tác'
                : blockedByBulk
                  ? 'Cần hoàn tác thao tác cập nhật hàng loạt phía sau trước'
                  : `Cần hoàn tác các thao tác phía sau trên "${target.entryName ?? ''}" trước`,
            error: { blockingLogIds },
          });
        }

        const restored = applyInverse(target, current);
        await tx.tourControl.update({
          where: { id: control.id },
          data: { entries: toJson(restored) },
        });
        const log = await tx.tourEntryLog.update({
          where: { id: target.id },
          data: { undoneAt: new Date() },
          select: LOG_SELECT,
        });
        return { restored, log };
      },
    );

    const logItem = toEntryLogItem(log);
    const undoState = await this.tourGateway.getUndoState(tourId);
    await this.tourGateway.broadcastTourState(tourId);
    this.tourGateway.broadcastTourLog({
      tourId,
      type: 'undone',
      log: logItem,
      ...undoState,
    });
    return { entries: restored, log: logItem, ...undoState };
  }

  /** Danh sách log thao tác entries (mới nhất trước). */
  async getEntryLogs(userId: number, tourId: number) {
    await this.getOwnedControl(userId, tourId);
    const { logs, canUndo, undoableLogIds } =
      await this.tourGateway.getLogSnapshot(tourId);
    return { logs, canUndo, undoableLogIds };
  }

  async updateGtd(userId: number, tourId: number, dto: UpdateGtdDto) {
    const { control } = await this.getOwnedControl(userId, tourId);
    const result = await this.prismaService.tourControl.update({
      where: { id: control.id },
      data: { gtd: dto.gtd },
    });
    await this.tourGateway.broadcastTourState(tourId);
    return result;
  }
}
