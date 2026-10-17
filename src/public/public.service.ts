import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { maskPhone, toExactPhone } from 'src/player/dto/phone.util';
import { toSearchText } from 'src/player/player.search';
import { SLUG_REGEX } from 'src/user/slug.util';

/** Số kết quả tối đa trả về cho API công khai. */
export const PUBLIC_SEARCH_LIMIT = 20;

/** Thông tin player được phép công khai. */
export interface PublicPlayer {
  id: number;
  name: string;
  avatar: string | null;
  point: number;
  /** Số điện thoại đã che, ví dụ 0912***678 */
  phone: string | null;
}

@Injectable()
export class PublicService {
  constructor(private prismaService: PrismaService) {}

  /**
   * Tra cứu player của user có `slug`:
   * tên chứa từ khoá (không dấu) HOẶC số điện thoại khớp CHÍNH XÁC.
   */
  async searchPlayers(
    slug: string,
    search: string,
  ): Promise<{ items: PublicPlayer[] }> {
    const normalizedSlug = slug.toLowerCase();
    if (!SLUG_REGEX.test(normalizedSlug)) {
      throw new NotFoundException('Không tìm thấy');
    }
    const owner = await this.prismaService.user.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (!owner) {
      throw new NotFoundException('Không tìm thấy');
    }

    const or: Prisma.PlayerWhereInput[] = [];
    const nameTerm = toSearchText(search);
    if (nameTerm.length >= 2) {
      or.push({ searchName: { contains: nameTerm } });
    }
    const phone = toExactPhone(search);
    if (phone) {
      or.push({ phone });
    }
    if (or.length === 0) {
      return { items: [] };
    }

    const players = await this.prismaService.player.findMany({
      where: { userId: owner.id, OR: or },
      select: { id: true, name: true, avatar: true, point: true, phone: true },
      orderBy: { name: 'asc' },
      take: PUBLIC_SEARCH_LIMIT,
    });

    return {
      items: players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        point: p.point,
        phone: maskPhone(p.phone),
      })),
    };
  }
}
