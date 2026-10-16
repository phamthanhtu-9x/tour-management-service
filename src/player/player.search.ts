/**
 * Chuẩn hoá chuỗi để tìm kiếm không dấu, không phân biệt hoa thường:
 * bỏ dấu tiếng Việt (kể cả đ/Đ → d), chữ thường, gộp khoảng trắng.
 * Phải khớp với cách migration backfill cột `searchName`.
 */
export function toSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
