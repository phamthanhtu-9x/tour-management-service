export type RunningTourStatus = 'RUNNING' | 'PAUSED';

export interface DashboardLevel {
  type: string; // 'BLIND' | 'BREAK'
  name: string | null;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  /** Thời lượng level (phút) */
  duration: number;
}

export interface RunningTourItem {
  id: number;
  title: string;
  status: RunningTourStatus;
  currentLevel: number;
  totalLevels: number;
  /** Level hiện tại; null nếu tour không có level tương ứng */
  level: DashboardLevel | null;
  /** Level kế tiếp; null nếu đang ở level cuối */
  nextLevel: DashboardLevel | null;
  /** Số giây đã trôi trong level hiện tại (server tính) */
  elapsedSeconds: number;
  /** Số giây còn lại của level hiện tại (≥ 0) */
  remainingSeconds: number;
  /** Tổng số entry */
  entriesCount: number;
  /** Số entry chưa bị loại */
  remainingPlayers: number;
  /** Đăng ký (re-entry) còn mở */
  isRegOpen: boolean;
}

export interface RunningToursResponse {
  items: RunningTourItem[];
  total: number;
}

export interface DashboardSummary {
  /** Số tour user đã tạo (còn tồn tại) */
  totalTours: number;
  /** Số player trong danh sách player của user */
  totalPlayers: number;
}
