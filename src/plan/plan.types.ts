export type Role = 'SUPER_ADMIN' | 'TRIAL' | 'STANDARD';
/** Các gói có cấu hình giới hạn (super admin không bị giới hạn). */
export type Plan = 'TRIAL' | 'STANDARD';
export const PLANS: readonly Plan[] = ['TRIAL', 'STANDARD'];

export interface PlanLimits {
  /** null = không giới hạn */
  maxPlayers: number | null;
  maxTours: number | null;
  maxRunningTours: number | null;
  canExportPlayers: boolean;
}

export interface PlanUsage {
  players: number;
  tours: number;
  runningTours: number;
}

export type LimitKey = 'maxPlayers' | 'maxTours' | 'maxRunningTours';
