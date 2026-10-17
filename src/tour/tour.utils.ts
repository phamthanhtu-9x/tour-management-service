import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  EntryLogActionType,
  EntryLogItem,
  PlayerEntry,
} from './tour.gateway';

/**
 * Đăng ký (re-entry) còn mở hay không.
 * - `regEnd = null` → không giới hạn, luôn mở.
 * - Ngược lại mở cho tới HẾT level `regEnd` (currentLevel <= regEnd).
 */
export function isRegistrationOpen(
  regEnd: number | null,
  currentLevel: number,
): boolean {
  return regEnd === null || currentLevel <= regEnd;
}

/**
 * Chuẩn hoá entries đọc từ DB (JSON) trước khi trả cho client:
 * bù giá trị mặc định cho các trường mà dữ liệu cũ có thể còn thiếu.
 */
export function normalizeEntries(raw: unknown): PlayerEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<PlayerEntry>[]).map(
    (entry) =>
      ({
        ...entry,
        isEliminated: entry.isEliminated ?? false,
        reBuyCount: entry.reBuyCount ?? 0,
        addOn: Array.isArray(entry.addOn) ? entry.addOn : [],
      }) as PlayerEntry,
  );
}

/** So sánh hai danh sách entries theo nội dung (không phụ thuộc thứ tự key). */
export function entriesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Chuyển bản ghi TourEntryLog (đã select) sang dạng gửi cho frontend. */
export function toEntryLogItem(log: {
  id: number;
  action: string;
  entryId: string | null;
  entryName: string | null;
  createdAt: Date;
  undoneAt: Date | null;
}): EntryLogItem {
  return {
    id: log.id,
    action: log.action as EntryLogActionType,
    entryId: log.entryId,
    entryName: log.entryName,
    createdAt: log.createdAt,
    undoneAt: log.undoneAt,
  };
}

/** Thông tin tối thiểu của một log để xét phụ thuộc. */
export interface LogRef {
  id: number;
  action: string;
  entryId: string | null;
}

/**
 * Các log CHƯA undo phía sau `target` đang chặn việc hoàn tác `target`:
 * - target là BULK_UPDATE → mọi log phía sau đều chặn (chỉ undo được khi mới nhất)
 * - log phía sau là BULK_UPDATE → chặn (nó đã ghi đè cả danh sách)
 * - log phía sau tác động cùng entry → chặn,
 *   ngoại trừ REBUY sau REBUY (độc lập về thứ tự, không cần chặn)
 */
export function findBlockingLogIds(
  target: LogRef,
  activeLogs: LogRef[],
): number[] {
  return activeLogs
    .filter((log) => log.id > target.id)
    .filter(
      (log) =>
        target.action === 'BULK_UPDATE' ||
        log.action === 'BULK_UPDATE' ||
        (log.entryId === target.entryId &&
          !(target.action === 'REBUY' && log.action === 'REBUY')),
    )
    .map((log) => log.id)
    .sort((a, b) => a - b);
}

/** Id các log chưa undo đang có thể hoàn tác (mới nhất trước). */
export function computeUndoableIds(activeLogs: LogRef[]): number[] {
  return activeLogs
    .filter((log) => findBlockingLogIds(log, activeLogs).length === 0)
    .map((log) => log.id)
    .sort((a, b) => b - a);
}

/**
 * Áp dụng thao tác NGƯỢC của `target` lên entries hiện tại.
 * Ném ConflictException nếu không thể áp dụng trên trạng thái hiện tại.
 */
export function applyInverse(
  target: {
    action: string;
    entryId: string | null;
    entryName: string | null;
    before: unknown;
    after: unknown;
  },
  current: PlayerEntry[],
): PlayerEntry[] {
  const name = target.entryName ?? '';
  switch (target.action) {
    case 'BULK_UPDATE': {
      if (!entriesEqual(current, normalizeEntries(target.after))) {
        throw new ConflictException(
          'Danh sách entries đã thay đổi, không thể hoàn tác. Vui lòng tải lại',
        );
      }
      return normalizeEntries(target.before);
    }
    case 'ADD': {
      if (!current.some((e) => e.id === target.entryId)) {
        throw new ConflictException(`Entry "${name}" không còn tồn tại`);
      }
      return current.filter((e) => e.id !== target.entryId);
    }
    case 'REMOVE': {
      if (current.some((e) => e.id === target.entryId)) {
        throw new ConflictException(`Entry "${name}" đã có trong danh sách`);
      }
      const before = normalizeEntries(target.before);
      const k = before.findIndex((e) => e.id === target.entryId);
      if (k === -1) {
        throw new ConflictException(
          'Không tìm thấy dữ liệu entry để khôi phục',
        );
      }
      // Chèn ngay sau entry đứng trước nó (lúc bị xoá) còn tồn tại; không có thì chèn đầu
      let insertAt = 0;
      for (let j = k - 1; j >= 0; j--) {
        const pos = current.findIndex((e) => e.id === before[j].id);
        if (pos !== -1) {
          insertAt = pos + 1;
          break;
        }
      }
      const next = [...current];
      next.splice(insertAt, 0, before[k]);
      return next;
    }
    case 'REBUY': {
      const idx = current.findIndex((e) => e.id === target.entryId);
      if (idx === -1) {
        throw new ConflictException(`Entry "${name}" không còn tồn tại`);
      }
      if (current[idx].reBuyCount <= 0) {
        throw new ConflictException(`reBuyCount của "${name}" đã là 0`);
      }
      const next = [...current];
      next[idx] = { ...current[idx], reBuyCount: current[idx].reBuyCount - 1 };
      return next;
    }
    default:
      throw new BadRequestException('Thao tác này không hỗ trợ hoàn tác');
  }
}

/**
 * Số giây đã trôi trong level hiện tại, tính bằng server clock
 * (cùng công thức với TourService / TourGateway).
 */
export function calcElapsedSeconds(
  control: {
    isPaused: boolean;
    pausedAtSecond: number;
    levelStartedAt: Date | null;
  },
  now: number = Date.now(),
): number {
  if (control.isPaused || !control.levelStartedAt) {
    return control.pausedAtSecond;
  }
  const diff = Math.floor((now - control.levelStartedAt.getTime()) / 1000);
  return control.pausedAtSecond + Math.max(0, diff);
}
