import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InsertPlayerDto, UpdatePlayerDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';

@Injectable()
export class PlayerService {
  constructor(private prismaService: PrismaService) {}

  async getPlayers(
    userId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResource<any>> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [players, totalItems] = await this.prismaService.$transaction([
      this.prismaService.player.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.player.count({ where: { userId } }),
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
   * Tải player theo id, kiểm tra tồn tại và thuộc về user đang đăng nhập.
   */
  private async getOwnedPlayer(userId: number, playerId: number) {
    const player = await this.prismaService.player.findUnique({
      where: { id: playerId },
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

  async insertPlayer(userId: number, dto: InsertPlayerDto) {
    return this.prismaService.player.create({
      data: { ...dto, userId },
    });
  }

  async updatePlayer(userId: number, playerId: number, dto: UpdatePlayerDto) {
    await this.getOwnedPlayer(userId, playerId);

    return this.prismaService.player.update({
      where: { id: playerId },
      data: { ...dto },
    });
  }

  async deletePlayer(userId: number, playerId: number) {
    await this.getOwnedPlayer(userId, playerId);

    return this.prismaService.player.delete({
      where: { id: playerId },
    });
  }
}
