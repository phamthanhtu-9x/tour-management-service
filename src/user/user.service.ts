import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dto';

@Injectable()
export class UserService {
  constructor(private prismaService: PrismaService) {}

  async updateProfile(userId: number, updateUserDto: UpdateUserDto) {
    if (updateUserDto.slug !== undefined) {
      const taken = await this.prismaService.user.findFirst({
        where: { slug: updateUserDto.slug, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('Slug đã được sử dụng, hãy chọn slug khác');
      }
    }

    try {
      return await this.prismaService.user.update({
        where: {
          id: userId,
        },
        data: {
          ...updateUserDto,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          slug: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      // 2 người đặt cùng slug đồng thời → DB chặn bằng unique index
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Slug đã được sử dụng, hãy chọn slug khác');
      }
      throw error;
    }
  }
}
