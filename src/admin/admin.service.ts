import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanService } from 'src/plan/plan.service';
import { Prisma } from 'src/generated/prisma/client';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';
import {
  daysLeft,
  endOfDayVN,
  extendExpiry,
  isAccountExpired,
} from 'src/plan/expiry.util';
import type { Role } from 'src/plan/plan.types';
import { AdminUserQueryDto, UpdateSubscriptionDto } from './dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Các trường user trả cho super admin (không bao giờ có hashedPassword). */
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  slug: true,
  displayName: true,
  firstName: true,
  lastName: true,
  avatar: true,
  role: true,
  planExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tours: true, players: true } },
} as const;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

/** Chuẩn hoá user cho response admin: thêm trạng thái hạn, bỏ _count. */
function toAdminUser(row: AdminUserRow, now: number = Date.now()) {
  const { _count, ...u } = row;
  const role = u.role as Role;
  const lifetime = role === 'SUPER_ADMIN' || u.planExpiresAt === null;
  return {
    ...u,
    isExpired: isAccountExpired(role, u.planExpiresAt, now),
    daysLeft: lifetime ? null : daysLeft(u.planExpiresAt, now),
    toursCount: _count.tours,
    playersCount: _count.players,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private prismaService: PrismaService,
    private planService: PlanService,
  ) {}

  async getUsers(query: AdminUserQueryDto): Promise<PaginatedResource<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      expiringInDays,
    } = query;
    const skip = (page - 1) * limit;
    // Hạ gói các STANDARD đã hết hạn để danh sách / bộ lọc luôn đúng
    await this.planService.downgradeExpiredStandard();
    const now = new Date();

    const and: Prisma.UserWhereInput[] = [];
    if (role) and.push({ role });
    if (search) {
      and.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search.toLowerCase() } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (status === 'expired') {
      and.push({ role: { not: 'SUPER_ADMIN' }, planExpiresAt: { lte: now } });
    } else if (status === 'active') {
      and.push({
        OR: [
          { role: 'SUPER_ADMIN' },
          { planExpiresAt: null },
          { planExpiresAt: { gt: now } },
        ],
      });
    }
    if (expiringInDays) {
      and.push({
        role: { not: 'SUPER_ADMIN' },
        planExpiresAt: {
          gt: now,
          lte: new Date(now.getTime() + expiringInDays * DAY_MS),
        },
      });
    }
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

    const [users, totalItems] = await this.prismaService.$transaction([
      this.prismaService.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.user.count({ where }),
    ]);

    const nowMs = now.getTime();
    return {
      items: users.map((u) => toAdminUser(u, nowMs)),
      meta: {
        totalItems,
        itemCount: users.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  /** User đích phải tồn tại và không phải super admin. */
  private async getEditableUser(userId: number) {
    const target = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true, planExpiresAt: true },
    });
    if (!target) {
      throw new NotFoundException('Không tìm thấy user');
    }
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Không thể thay đổi tài khoản super admin');
    }
    return target;
  }

  /** Đổi gói TRIAL / STANDARD (giữ nguyên thời hạn). */
  async updateUserRole(userId: number, role: 'TRIAL' | 'STANDARD') {
    await this.getEditableUser(userId);
    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data: { role },
      select: ADMIN_USER_SELECT,
    });
    return toAdminUser(updated);
  }

  /**
   * Đổi gói và/hoặc thời hạn. Mọi trường độc lập; `expiresAt` và
   * `extendDays` không dùng cùng lúc. Gia hạn cộng dồn.
   */
  async updateSubscription(userId: number, dto: UpdateSubscriptionDto) {
    const hasRole = dto.role !== undefined;
    const hasExpiresAt = dto.expiresAt !== undefined;
    const hasExtend = dto.extendDays !== undefined;
    if (!hasRole && !hasExpiresAt && !hasExtend) {
      throw new BadRequestException(
        'Cần gửi ít nhất một trong: role, expiresAt, extendDays',
      );
    }
    if (hasExpiresAt && hasExtend) {
      throw new BadRequestException(
        'Chỉ dùng một trong expiresAt hoặc extendDays',
      );
    }

    const target = await this.getEditableUser(userId);

    const data: Prisma.UserUpdateInput = {};
    if (hasRole) data.role = dto.role;
    if (hasExpiresAt) {
      data.planExpiresAt = dto.expiresAt ? endOfDayVN(dto.expiresAt) : null;
    }
    if (hasExtend) {
      if (target.planExpiresAt === null) {
        throw new BadRequestException(
          'Tài khoản đang vô thời hạn, không cần gia hạn',
        );
      }
      data.planExpiresAt = extendExpiry(target.planExpiresAt, dto.extendDays!);
    }

    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data,
      select: ADMIN_USER_SELECT,
    });
    return toAdminUser(updated);
  }
}
