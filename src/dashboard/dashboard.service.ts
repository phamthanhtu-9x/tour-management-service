import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  calcElapsedSeconds,
  isRegistrationOpen,
  normalizeEntries,
} from 'src/tour/tour.utils';
import {
  DashboardLevel,
  DashboardSummary,
  RunningTourItem,
  RunningToursResponse,
} from './dashboard.types';

const toDashboardLevel = (level: {
  type: string;
  name: string | null;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  duration: number;
}): DashboardLevel => ({
  type: level.type,
  name: level.name,
  smallBlind: level.smallBlind,
  bigBlind: level.bigBlind,
  ante: level.ante,
  duration: level.duration,
});

@Injectable()
export class DashboardService {
  constructor(private prismaService: PrismaService) {}

  /** Tổng số tour đã tạo và tổng số player của user. */
  async getSummary(userId: number): Promise<DashboardSummary> {
    const [totalTours, totalPlayers] = await this.prismaService.$transaction([
      this.prismaService.tour.count({ where: { userId } }),
      this.prismaService.player.count({ where: { userId } }),
    ]);
    return { totalTours, totalPlayers };
  }

  /**
   * Các tour của user đang chạy (đã start, chưa kết thúc/reset) –
   * gồm cả tour đang tạm dừng. Tour bắt đầu level gần nhất xếp trước.
   */
  async getRunningTours(userId: number): Promise<RunningToursResponse> {
    const tours = await this.prismaService.tour.findMany({
      where: { userId, control: { is: { isRunning: true } } },
      select: {
        id: true,
        title: true,
        regEnd: true,
        control: {
          select: {
            currentLevel: true,
            isPaused: true,
            pausedAtSecond: true,
            levelStartedAt: true,
            entries: true,
            updatedAt: true,
          },
        },
        levels: {
          orderBy: { idx: 'asc' },
          select: {
            idx: true,
            type: true,
            name: true,
            smallBlind: true,
            bigBlind: true,
            ante: true,
            duration: true,
          },
        },
      },
    });

    const now = Date.now();
    const rows: { item: RunningTourItem; sortKey: number }[] = [];
    for (const tour of tours) {
      const control = tour.control;
      if (!control) continue;

      const current = tour.levels.find((l) => l.idx === control.currentLevel);
      const next = tour.levels.find((l) => l.idx === control.currentLevel + 1);
      const elapsedSeconds = calcElapsedSeconds(control, now);
      const remainingSeconds = current
        ? Math.max(0, current.duration * 60 - elapsedSeconds)
        : 0;
      const entries = normalizeEntries(control.entries);

      rows.push({
        item: {
          id: tour.id,
          title: tour.title,
          status: control.isPaused ? 'PAUSED' : 'RUNNING',
          currentLevel: control.currentLevel,
          totalLevels: tour.levels.length,
          level: current ? toDashboardLevel(current) : null,
          nextLevel: next ? toDashboardLevel(next) : null,
          elapsedSeconds,
          remainingSeconds,
          entriesCount: entries.length,
          remainingPlayers: entries.filter((e) => !e.isEliminated).length,
          isRegOpen: isRegistrationOpen(tour.regEnd, control.currentLevel),
        },
        // Mốc sắp xếp: thời điểm bắt đầu level hiện tại, hoặc lần cập nhật cuối khi đang pause
        sortKey: (control.levelStartedAt ?? control.updatedAt).getTime(),
      });
    }

    rows.sort((a, b) => b.sortKey - a.sortKey);
    return {
      items: rows.map((row) => row.item),
      total: rows.length,
    };
  }
}
