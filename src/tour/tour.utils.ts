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
