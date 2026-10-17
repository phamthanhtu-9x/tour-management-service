/** Slug hợp lệ: a-z, 0-9, '-', dài 3–30, không bắt đầu/kết thúc bằng '-'. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export const SLUG_FORMAT_MESSAGE =
  "Slug chỉ gồm chữ thường a-z, số 0-9 và '-', dài 3–30 ký tự, không bắt đầu hoặc kết thúc bằng '-'";

/** Các từ dành riêng (route/hệ thống) không được dùng làm slug. */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'administrator',
  'api',
  'auth',
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'me',
  'user',
  'users',
  'tour',
  'tours',
  'player',
  'players',
  'setup',
  'upload',
  'uploads',
  'docs',
  'settings',
  'profile',
  'account',
  'help',
  'support',
  'root',
  'system',
  'null',
  'undefined',
  'new',
  'edit',
  'delete',
  'www',
  'static',
  'assets',
  'public',
  'dashboard',
];

/** Độ dài tối đa của phần gốc khi sinh slug (chừa chỗ cho hậu tố "-NNN"). */
const BASE_MAX_LENGTH = 26;

/**
 * Sinh phần gốc của slug từ email (phần trước '@'):
 * bỏ dấu, chữ thường, ký tự không hợp lệ → '-', cắt còn tối đa 26 ký tự.
 * Quá ngắn (< 3) hoặc trùng từ dành riêng → thêm hậu tố "-member".
 * Phải khớp với cách migration backfill slug cho user cũ.
 */
export function slugBaseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  let base = local
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  if (base.length < 3 || RESERVED_SLUGS.includes(base)) {
    base = base ? `${base}-member` : 'member';
  }
  return base;
}

/** Ứng viên slug thứ n: n = 1 → base, n ≥ 2 → base-n. */
export function slugCandidate(base: string, n: number): string {
  return n <= 1 ? base : `${base}-${n}`;
}
