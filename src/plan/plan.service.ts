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

  /** Gói, giới hạn và mức sử dụng – cho GET /users/me/limits. */
  async getMyLimits(userId: number): Promise<{
    role: Role;
    limits: PlanLimits;
    usage: PlanUsage;
  }> {
    const role = await this.getRole(userId);
    const [limits, usage] = await Promise.all([
      this.getLimitsForRole(role),
      this.getUsage(userId),
    ]);
    return { role, limits, usage };
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
    limits: PlanLimits,
  ): Promise<{ plan: Plan } & PlanLimits> {
    const row = await this.prismaService.planLimit.upsert({
      where: { plan },
      create: { plan, ...limits },
      update: limits,
    });
    return {
      plan,
      maxPlayers: row.maxPlayers,
      maxTours: row.maxTours,
      maxRunningTours: row.maxRunningTours,
      canExportPlayers: row.canExportPlayers,
    };
  }
}
