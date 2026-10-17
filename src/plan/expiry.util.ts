import { ForbiddenException } from '@nestjs/common';
import type { Role } from './plan.types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Việt Nam: UTC+7, không có giờ mùa hè. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tài khoản đã hết hạn? Super admin và hạn = null không bao giờ hết hạn. */
export function isAccountExpired(
  role: Role,
  planExpiresAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (role === 'SUPER_ADMIN' || planExpiresAt === null) return false;
  return planExpiresAt.getTime() <= now;
}

/**
 * Số ngày còn lại (làm tròn lên): còn 1 giờ → 1. null nếu vô thời hạn.
 * Đã hết hạn → 0.
 */
export function daysLeft(
  planExpiresAt: Date | null,
  now: number = Date.now(),
): number | null {
  if (planExpiresAt === null) return null;
  return Math.max(0, Math.ceil((planExpiresAt.getTime() - now) / DAY_MS));
}

/** Ngày dạng YYYY-MM-DD → 23:59:59.999 giờ Việt Nam của ngày đó (Date UTC). */
export function endOfDayVN(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - VN_OFFSET_MS);
}

/**
 * Gia hạn cộng dồn: còn hạn → cộng từ hạn cũ; đã hết hạn → cộng từ hiện tại.
 */
export function extendExpiry(
  current: Date | null,
  days: number,
  now: number = Date.now(),
): Date {
  const base =
    current !== null && current.getTime() > now ? current.getTime() : now;
  return new Date(base + days * DAY_MS);
}

/** Hạn mặc định cho user mới: now + durationDays; null = vô thời hạn. */
export function defaultExpiry(
  durationDays: number | null,
  now: number = Date.now(),
): Date | null {
  return durationDays === null ? null : new Date(now + durationDays * DAY_MS);
}

export const ACCOUNT_EXPIRED_MESSAGE =
  'Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn';

/** 403 khi tài khoản hết hạn: details = { code: 'ACCOUNT_EXPIRED', expiredAt }. */
export function accountExpiredError(planExpiresAt: Date): ForbiddenException {
  return new ForbiddenException({
    message: ACCOUNT_EXPIRED_MESSAGE,
    error: { code: 'ACCOUNT_EXPIRED', expiredAt: planExpiresAt.toISOString() },
  });
}
