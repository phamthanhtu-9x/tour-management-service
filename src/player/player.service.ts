import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InsertPlayerDto, SearchPlayerQueryDto, UpdatePlayerDto } from './dto';
import { toPhoneSearch } from './dto/phone.util';
import { toSearchText } from './player.search';
import { Prisma } from 'src/generated/prisma/client';

/** Cột nội bộ, không trả cho client. */
const OMIT_INTERNAL = { searchName: true } as const;
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';

@Injectable()
export class PlayerService {
  constructor(private prismaService: PrismaService) {}

  async getPlayers(
    userId: number,
    query: SearchPlayerQueryDto,
  ): Promise<PaginatedResource<any>> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;
    const where = this.buildSearchWhere(userId, search);

    const [players, totalItems] = await this.prismaService.$transaction([
      this.prismaService.player.findMany({
        where,
        omit: OMIT_INTERNAL,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.player.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items: players,
      meta: {
        totalItems,
        itemCount: players.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  /**
   * Điều kiện lọc: player của user, và nếu có `search` thì
   * tên (không dấu, không phân biệt hoa thường) HOẶC số điện thoại chứa từ khoá.
   */
  private buildSearchWhere(
    userId: number,
    search?: string,
  ): Prisma.PlayerWhereInput {
    if (!search) return { userId };

    const or: Prisma.PlayerWhereInput[] = [];
    const nameTerm = toSearchText(search);
    if (nameTerm) or.push({ searchName: { contains: nameTerm } });
    const phoneTerm = toPhoneSearch(search);
    if (phoneTerm) or.push({ phone: { contains: phoneTerm } });

    return { userId, OR: or };
  }

  /**
   * Tải player theo id, kiểm tra tồn tại và thuộc về user đang đăng nhập.
   */
  private async getOwnedPlayer(userId: number, playerId: number) {
    const player = await this.prismaService.player.findUnique({
      where: { id: playerId },
      omit: OMIT_INTERNAL,
    });

    if (!player) {
      throw new NotFoundException('Không tìm thấy người chơi');
    }
    if (player.userId !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập người chơi này',
      );
    }

    return player;
  }

  async getPlayerById(userId: number, playerId: number) {
    return this.getOwnedPlayer(userId, playerId);
  }

  /** Số điện thoại không được trùng với player khác của cùng user. */
  private async assertPhoneAvailable(
    userId: number,
    phone: string | null | undefined,
    excludePlayerId?: number,
  ): Promise<void> {
    if (phone == null) return;
    const existing = await this.prismaService.player.findFirst({
      where: {
        userId,
        phone,
        ...(excludePlayerId !== undefined
          ? { NOT: { id: excludePlayerId } }
          : {}),
      },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException(
        `Số điện thoại đã được dùng cho người chơi "${existing.name}"`,
      );
    }
  }

  /** Bắt lỗi unique (userId, phone) khi 2 request ghi cùng lúc. */
  private rethrowPhoneConflict(error: unknown): never {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw new ConflictException(
        'Số điện thoại đã được dùng cho người chơi khác',
      );
    }
    throw error;
  }

  async insertPlayer(userId: number, dto: InsertPlayerDto) {
    await this.assertPhoneAvailable(userId, dto.phone);
    try {
      return await this.prismaService.player.create({
        data: { ...dto, userId, searchName: toSearchText(dto.name) },
        omit: OMIT_INTERNAL,
      });
    } catch (error) {
      this.rethrowPhoneConflict(error);
    }
  }

  async updatePlayer(userId: number, playerId: number, dto: UpdatePlayerDto) {
    await this.getOwnedPlayer(userId, playerId);
    await this.assertPhoneAvailable(userId, dto.phone, playerId);

    try {
      return await this.prismaService.player.update({
        where: { id: playerId },
        data: {
          ...dto,
          ...(dto.name !== undefined
            ? { searchName: toSearchText(dto.name) }
            : {}),
        },
        omit: OMIT_INTERNAL,
      });
    } catch (error) {
      this.rethrowPhoneConflict(error);
    }
  }

  async deletePlayer(userId: number, playerId: number) {
    await this.getOwnedPlayer(userId, playerId);

    return this.prismaService.player.delete({
      where: { id: playerId },
      omit: OMIT_INTERNAL,
    });
  }
}
