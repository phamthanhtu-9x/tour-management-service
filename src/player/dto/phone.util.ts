/** Số điện thoại hợp lệ sau chuẩn hoá: 8–15 chữ số, có thể có '+' ở đầu. */
export const PHONE_REGEX = /^\+?\d{8,15}$/;

/**
 * Đưa số điện thoại về dạng chuẩn để lưu / so sánh / tìm kiếm:
 * bỏ khoảng trắng, '.', '-', '(', ')' và đổi đầu số '+84' thành '0'
 * (coi +84 và 0 là một).
 */
export function canonicalPhone(raw: string): string {
  const cleaned = raw.replace(/[\s.\-()]/g, '');
  return cleaned.startsWith('+84') ? `0${cleaned.slice(3)}` : cleaned;
}

/**
 * Transform cho DTO: chuẩn hoá số điện thoại từ request.
 * Chuỗi rỗng → null (xoá số điện thoại). Giá trị không phải chuỗi giữ nguyên
 * để class-validator báo lỗi.
 */
export function normalizePhone({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const phone = canonicalPhone(value);
  return phone === '' ? null : phone;
}

/**
 * Từ khoá tìm kiếm → chuỗi để tìm một phần trong cột phone.
 * Trả null nếu từ khoá không giống số điện thoại hoặc có ít hơn 3 chữ số.
 */
export function toPhoneSearch(term: string): string | null {
  const phone = canonicalPhone(term);
  if (!/^\+?\d+$/.test(phone)) return null;
  return phone.replace('+', '').length >= 3 ? phone : null;
}
