import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';
import { AdminUserQueryDto } from './dto';

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
  createdAt: true,
  updatedAt: true,
  _count: { select: { tours: true, players: true } },
} as const;

@Injectable()
export class AdminService {
  constructor(private prismaService: PrismaService) {}

  async getUsers(query: AdminUserQueryDto): Promise<PaginatedResource<any>> {
    const { page = 1, limit = 10, search, role } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search.toLowerCase() } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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

    return {
      items: users.map(({ _count, ...u }) => ({
        ...u,
        toursCount: _count.tours,
        playersCount: _count.players,
      })),
      meta: {
        totalItems,
        itemCount: users.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  /** Đổi gói TRIAL / STANDARD. Không áp dụng cho tài khoản super admin. */
  async updateUserRole(userId: number, role: 'TRIAL' | 'STANDARD') {
    const target = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) {
      throw new NotFoundException('Không tìm thấy user');
    }
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Không thể thay đổi tài khoản super admin');
    }
    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data: { role },
      select: ADMIN_USER_SELECT,
    });
    const { _count, ...u } = updated;
    return {
      ...u,
      toursCount: _count.tours,
      playersCount: _count.players,
    };
  }
}
