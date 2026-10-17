import { Workbook } from 'exceljs';

export interface PlayerExportRow {
  name: string;
  phone: string | null;
  point: number;
}

const HEADERS = ['Tên', 'Số điện thoại', 'Điểm'] as const;

/**
 * Tạo file Excel (.xlsx) danh sách player: Tên | Số điện thoại | Điểm.
 * - Số điện thoại ghi dạng TEXT để Excel không làm mất số 0 ở đầu.
 * - Điểm ghi dạng số để có thể cộng / sắp xếp / lọc.
 */
export async function buildPlayersWorkbook(
  rows: PlayerExportRow[],
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Players', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: HEADERS[0], key: 'name' },
    { header: HEADERS[1], key: 'phone', style: { numFmt: '@' } },
    { header: HEADERS[2], key: 'point' },
  ];

  for (const row of rows) {
    sheet.addRow({ name: row.name, phone: row.phone ?? '', point: row.point });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: 'A1', to: 'C1' };

  // Độ rộng cột theo nội dung dài nhất (giới hạn 10–50 ký tự)
  const widths = [HEADERS[0], HEADERS[1], HEADERS[2]].map((h) => h.length);
  for (const row of rows) {
    widths[0] = Math.max(widths[0], row.name.length);
    widths[1] = Math.max(widths[1], (row.phone ?? '').length);
    widths[2] = Math.max(widths[2], String(row.point).length);
  }
  sheet.columns.forEach((col, i) => {
    col.width = Math.min(50, Math.max(10, widths[i] + 2));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
