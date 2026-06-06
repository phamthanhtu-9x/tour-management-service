import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SetDefaultLevelDto } from './dto';

@Injectable()
export class SetupService {
  constructor(private prismaService: PrismaService) {}

  async getDefaultLevels(userId: number) {
    return this.prismaService.defaultLevel.findMany({
      where: { userId },
      orderBy: { idx: 'asc' },
    });
  }

  async setDefaultLevels(userId: number, dto: SetDefaultLevelDto) {
    const data = dto.levels.map((level) => ({
      ...level,
      userId,
    }));

    // Thay thế toàn bộ cấu hình default level hiện tại của user
    await this.prismaService.$transaction([
      this.prismaService.defaultLevel.deleteMany({ where: { userId } }),
      this.prismaService.defaultLevel.createMany({ data }),
    ]);

    return this.getDefaultLevels(userId);
  }
}
