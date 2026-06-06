import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InsertTourDto,
  UpdateTourDto,
  SetLevelDto,
  PlayerEntryDto,
} from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';
import { DEFAULT_TOUR_LEVELS } from './tour.constants';

@Injectable()
export class TourService {
  constructor(private prismaService: PrismaService) {}
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
    const { control } = await this.getOwnedControl(userId, tourId);
    return { ...control, entries: control.entries ?? [] };
  }

  async insertTour(userId: number, insertTourDto: InsertTourDto) {
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

    const { levels, ...rest } = updateTourDto;

    return this.prismaService.tour.update({
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

    return { control: tour.control, totalLevels: tour._count.levels };
  }

  private updateControl(
    controlId: number,
    data: {
      currentLevel?: number;
      isPaused?: boolean;
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

  async startClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    return this.updateControl(control.id, {
      isPaused: false,
      pausedAtSecond: 0,
      levelStartedAt: new Date(),
    });
  }

  async pauseClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (control.isPaused) {
      return control;
    }
    return this.updateControl(control.id, {
      isPaused: true,
      pausedAtSecond: this.elapsedSeconds(control),
      levelStartedAt: null,
    });
  }

  async resumeClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (!control.isPaused) {
      return control;
    }
    return this.updateControl(control.id, {
      isPaused: false,
      levelStartedAt: new Date(),
    });
  }

  async nextLevel(userId: number, tourId: number) {
    const { control, totalLevels } = await this.getOwnedControl(userId, tourId);
    if (control.currentLevel >= totalLevels) {
      throw new ForbiddenException('Đã ở level cuối cùng');
    }
    return this.goToLevel(control, control.currentLevel + 1);
  }

  async prevLevel(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    if (control.currentLevel <= 1) {
      throw new ForbiddenException('Đã ở level đầu tiên');
    }
    return this.goToLevel(control, control.currentLevel - 1);
  }

  async setLevel(userId: number, tourId: number, dto: SetLevelDto) {
    const { control, totalLevels } = await this.getOwnedControl(userId, tourId);
    if (dto.level > totalLevels) {
      throw new ForbiddenException(
        `Level không hợp lệ (tour chỉ có ${totalLevels} level)`,
      );
    }
    return this.goToLevel(control, dto.level);
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

  async resetClock(userId: number, tourId: number) {
    const { control } = await this.getOwnedControl(userId, tourId);
    return this.prismaService.tourControl.update({
      where: { id: control.id },
      data: {
        currentLevel: 1,
        isPaused: true,
        pausedAtSecond: 0,
        levelStartedAt: null,
        entries: [],
      },
    });
  }

  async updateEntries(
    userId: number,
    tourId: number,
    entries: PlayerEntryDto[],
  ) {
    const { control } = await this.getOwnedControl(userId, tourId);
    const normalized = entries.map((entry) => ({
      name: entry.name,
      ...(entry.avatar !== undefined ? { avatar: entry.avatar } : {}),
      isEliminated: entry.isEliminated ?? false,
    }));
    return this.prismaService.tourControl.update({
      where: { id: control.id },
      data: { entries: normalized },
    });
  }
}
