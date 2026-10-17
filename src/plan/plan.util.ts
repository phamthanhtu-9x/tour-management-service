import { ForbiddenException } from '@nestjs/common';
import { LimitKey, Plan, PlanLimits, Role } from './plan.types';

/** Không giới hạn gì (super admin, hoặc gói chưa có cấu hình STANDARD). */
export const UNLIMITED: PlanLimits = {
  maxPlayers: null,
  maxTours: null,
  maxRunningTours: null,
  canExportPlayers: true,
};

/** Mặc định dự phòng nếu bảng plan_limits thiếu dòng (khớp migration). */
export const DEFAULT_LIMITS: Record<Plan, PlanLimits> = {
  TRIAL: {
    maxPlayers: 20,
    maxTours: 3,
    maxRunningTours: 1,
    canExportPlayers: false,
  },
  STANDARD: UNLIMITED,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  TRIAL: 'Gói dùng thử',
  STANDARD: 'Gói tiêu chuẩn',
};

const LIMIT_TEXT: Record<LimitKey, (max: number) => string> = {
  maxPlayers: (max) => `thêm tối đa ${max} người chơi`,
  maxTours: (max) => `tạo tối đa ${max} tour`,
  maxRunningTours: (max) => `chạy tối đa ${max} tour cùng lúc`,
};

/**
 * true nếu đã chạm giới hạn: `current` (đang có) >= `max`.
 * max = null → không giới hạn.
 */
export function isLimitReached(max: number | null, current: number): boolean {
  return max !== null && current >= max;
}

/**
 * Lỗi 403 khi vượt giới hạn gói. `details` có mã để frontend xử lý:
 * { code: 'PLAN_LIMIT', limit, max, current, role }
 */
export function planLimitError(
  role: Role,
  limit: LimitKey,
  max: number,
  current: number,
): ForbiddenException {
  return new ForbiddenException({
    message: `${ROLE_LABEL[role]} chỉ được ${LIMIT_TEXT[limit](max)}`,
    error: { code: 'PLAN_LIMIT', limit, max, current, role },
  });
}

/** Lỗi 403 khi gói không có tính năng. */
export function planFeatureError(
  role: Role,
  feature: 'canExportPlayers',
): ForbiddenException {
  return new ForbiddenException({
    message: `${ROLE_LABEL[role]} không có tính năng xuất Excel danh sách người chơi`,
    error: { code: 'PLAN_FEATURE', feature, role },
  });
}
