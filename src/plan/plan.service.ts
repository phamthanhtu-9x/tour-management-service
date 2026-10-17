import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Plan, PlanLimits, PlanUsage, Role } from './plan.types';
import {
  DEFAULT_LIMITS,
  isLimitReached,
  planFeatureError,
  planLimitError,
  UNLIMITED,
} from './plan.util';
import { daysLeft } from './expiry.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thông tin tối thiểu để xét hết hạn / hạ gói. */
interface AccountState {
  id: number;
  role: Role;
  planExpiresAt: Date | null;
}

/**
 * Đọc giới hạn theo gói của user và chặn thao tác khi vượt giới hạn.
 * Super admin không bị giới hạn.
 */
@Injectable()
export class PlanService {
  constructor(private prismaService: PrismaService) {}

  async getRole(userId: number): Promise<Role> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new UnauthorizedException();
    return user.role;
  }

  /**
   * STANDARD đã hết hạn → hạ xuống TRIAL, hạn mới = hạn cũ + downgradeDays
   * (tính từ lúc hết hạn, không phải từ bây giờ). Ghi ngay vào DB.
   * Trả về role / hạn đang có hiệu lực. Các trường hợp khác giữ nguyên.
   * Lệnh ghi có điều kiện (role + hạn cũ) nên request đồng thời không hạ 2 lần.
   */
  async resolveAccount<T extends AccountState>(
    user: T,
    now: number = Date.now(),
  ): Promise<T> {
    if (
      user.role !== 'STANDARD' ||
      user.planExpiresAt === null ||
      user.planExpiresAt.getTime() > now
    ) {
      return user;
    }
    const { downgradeDays } = await this.getLimitsForRole('STANDARD');
    if (downgradeDays === null) return user; // cấu hình khoá ngay

    const newExpiresAt = new Date(
      user.planExpiresAt.getTime() + downgradeDays * DAY_MS,
    );
    await this.prismaService.user.updateMany({
      where: {
        id: user.id,
        role: 'STANDARD',
        planExpiresAt: user.planExpiresAt,
      },
      data: { role: 'TRIAL', planExpiresAt: newExpiresAt },
    });
    // Đọc lại trạng thái thật (phòng request khác vừa cập nhật trước)
    const fresh = await this.prismaService.user.findUnique({
      where: { id: user.id },
      select: { role: true, planExpiresAt: true },
    });
    return {
      ...user,
      role: fresh?.role ?? 'TRIAL',
      planExpiresAt: fresh ? fresh.planExpiresAt : newExpiresAt,
    };
  }

  /**
   * Hạ gói hàng loạt mọi STANDARD đã hết hạn (1 câu lệnh) – gọi trước khi
   * liệt kê user cho admin để dữ liệu luôn đúng mà không cần job định kỳ.
   */
  async downgradeExpiredStandard(): Promise<number> {
    const { downgradeDays } = await this.getLimitsForRole('STANDARD');
    if (downgradeDays === null) return 0;
    return this.prismaService.$executeRaw`
      UPDATE "users"
      SET "role" = 'TRIAL',
          "planExpiresAt" = "planExpiresAt" + make_interval(days => ${downgradeDays}::int),
          "updatedAt" = NOW()
      WHERE "role" = 'STANDARD' AND "planExpiresAt" <= NOW()`;
  }

  /** Giới hạn đang áp dụng cho một role. */
  async getLimitsForRole(role: Role): Promise<PlanLimits> {
    if (role === 'SUPER_ADMIN') return UNLIMITED;
    const row = await this.prismaService.planLimit.findUnique({
      where: { plan: role },
    });
    if (!row) return DEFAULT_LIMITS[role];
    return {
      maxPlayers: row.maxPlayers,
      maxTours: row.maxTours,
      maxRunningTours: row.maxRunningTours,
      canExportPlayers: row.canExportPlayers,
      durationDays: row.durationDays,
      downgradeDays: row.downgradeDays,
    };
  }

  /** Mức đang sử dụng của user. */
  async getUsage(userId: number): Promise<PlanUsage> {
    const [players, tours, runningTours] =
      await this.prismaService.$transaction([
        this.prismaService.player.count({ where: { userId } }),
        this.prismaService.tour.count({ where: { userId } }),
        this.prismaService.tour.count({
          where: { userId, control: { is: { isRunning: true } } },
        }),
      ]);
    return { players, tours, runningTours };
  }

  /** Gói, thời hạn, giới hạn và mức sử dụng – cho GET /users/me/limits. */
  async getMyLimits(userId: number): Promise<{
    role: Role;
    /** null = vô thời hạn */
    planExpiresAt: Date | null;
    /** Số ngày còn lại (làm tròn lên); null = vô thời hạn */
    daysLeft: number | null;
    limits: PlanLimits;
    usage: PlanUsage;
  }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true, planExpiresAt: true },
    });
    if (!user) throw new UnauthorizedException();
    const role = user.role;
    const planExpiresAt = role === 'SUPER_ADMIN' ? null : user.planExpiresAt;
    const [limits, usage] = await Promise.all([
      this.getLimitsForRole(role),
      this.getUsage(userId),
    ]);
    return {
      role,
      planExpiresAt,
      daysLeft: daysLeft(planExpiresAt),
      limits,
      usage,
    };
  }

  async assertCanAddPlayer(userId: number): Promise<void> {
    const role = await this.getRole(userId);
    const { maxPlayers } = await this.getLimitsForRole(role);
    if (maxPlayers === null) return;
    const current = await this.prismaService.player.count({
      where: { userId },
    });
    if (isLimitReached(maxPlayers, current)) {
      throw planLimitError(role, 'maxPlayers', maxPlayers, current);
    }
  }

  async assertCanCreateTour(userId: number): Promise<void> {
    const role = await this.getRole(userId);
    const { maxTours } = await this.getLimitsForRole(role);
    if (maxTours === null) return;
    const current = await this.prismaService.tour.count({ where: { userId } });
    if (isLimitReached(maxTours, current)) {
      throw planLimitError(role, 'maxTours', maxTours, current);
    }
  }

  /** Start clock của `tourId`: đếm các tour KHÁC đang chạy. */
  async assertCanStartTour(userId: number, tourId: number): Promise<void> {
    const role = await this.getRole(userId);
    const { maxRunningTours } = await this.getLimitsForRole(role);
    if (maxRunningTours === null) return;
    const current = await this.prismaService.tour.count({
      where: {
        userId,
        id: { not: tourId },
        control: { is: { isRunning: true } },
      },
    });
    if (isLimitReached(maxRunningTours, current)) {
      throw planLimitError(role, 'maxRunningTours', maxRunningTours, current);
    }
  }

  async assertCanExportPlayers(userId: number): Promise<void> {
    const role = await this.getRole(userId);
    const { canExportPlayers } = await this.getLimitsForRole(role);
    if (!canExportPlayers) {
      throw planFeatureError(role, 'canExportPlayers');
    }
  }

  /** Cấu hình của tất cả các gói (cho super admin). */
  async getAllPlans(): Promise<({ plan: Plan } & PlanLimits)[]> {
    const plans: Plan[] = ['TRIAL', 'STANDARD'];
    return Promise.all(
      plans.map(async (plan) => ({
        plan,
        ...(await this.getLimitsForRole(plan)),
      })),
    );
  }

  async updatePlan(
    plan: Plan,
    input: Omit<PlanLimits, 'downgradeDays'> & {
      /** undefined = giữ nguyên */
      downgradeDays?: number | null;
    },
  ): Promise<{ plan: Plan } & PlanLimits> {
    // downgradeDays chỉ áp dụng cho STANDARD
    const data =
      plan === 'STANDARD' ? input : { ...input, downgradeDays: undefined };
    const row = await this.prismaService.planLimit.upsert({
      where: { plan },
      create: { plan, ...data, downgradeDays: data.downgradeDays ?? null },
      update: data,
    });
    return {
      plan,
      maxPlayers: row.maxPlayers,
      maxTours: row.maxTours,
      maxRunningTours: row.maxRunningTours,
      canExportPlayers: row.canExportPlayers,
      durationDays: row.durationDays,
      downgradeDays: row.downgradeDays,
    };
  }
}
