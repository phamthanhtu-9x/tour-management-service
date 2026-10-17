# Player API – Danh sách, Tìm kiếm & Xuất Excel – Tài liệu tích hợp Frontend

Tài liệu này mô tả các API quản lý người chơi (player) của user đang đăng nhập, gồm thêm / sửa / xoá, **tìm kiếm theo tên hoặc số điện thoại** và **xuất file Excel**.

---

## 1. Tóm tắt nhanh

| Việc cần làm | Gọi |
|---|---|
| Danh sách (phân trang, tìm kiếm) | `GET /players?search=&page=&limit=` |
| Xem 1 player | `GET /players/:id` |
| Thêm player | `POST /players` |
| Sửa player | `PATCH /players/:id` |
| Xoá player | `DELETE /players/:id/delete` |
| **Xuất Excel** | `GET /players/export?search=` |

Quy ước chung:

- Base URL: `http://<host>:3002`
- Header: `Authorization: Bearer <accessToken>` (mọi API đều cần đăng nhập)
- Response JSON thành công được bọc:
  ```json
  { "statusCode": 200, "message": "Success", "data": { ... } }
  ```
  → dữ liệu thật nằm trong `data`. **Riêng API xuất Excel trả file trực tiếp, không bọc JSON** (xem mục 5).
- Response lỗi:
  ```json
  { "statusCode": 409, "timestamp": "...", "message": "Số điện thoại đã được dùng cho người chơi \"An\"", "details": null }
  ```

---

## 2. Kiểu dữ liệu

```typescript
export interface Player {
  id: number;
  name: string;
  avatar: string | null;
  /** Điểm – số thực, không âm */
  point: number;
  /** Số điện thoại đã chuẩn hoá: chỉ chữ số (có thể có '+' ở đầu), +84 được lưu thành 0 */
  phone: string | null;
  userId: number;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface PaginatedPlayers {
  items: Player[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}
```

---

## 3. Danh sách & tìm kiếm

`GET /players?search=nguyen&page=1&limit=10` → `data: PaginatedPlayers`

| Query | Mô tả |
|---|---|
| `search` | Tuỳ chọn, tối đa 100 ký tự. Bỏ trống → lấy tất cả |
| `page` | Mặc định `1` |
| `limit` | Mặc định `10`, tối đa `100` |

Một ô `search` tìm **đồng thời** theo:

- **Tên** – chứa từ khoá, **không dấu**, không phân biệt hoa thường.
  `nguyen van` → "Nguyễn Văn An", "nguyen van binh"; `dang` → "Đặng Hoàng Anh".
- **Số điện thoại** – chứa **một phần** số (cần ≥ 3 chữ số). Khoảng trắng, `.`, `-`, `(`, `)` được bỏ qua; **`+84` và `0` coi là một**.
  `0912`, `345 678`, `+84 912` → đều tìm ra `0912345678`.

Thứ tự: **mới tạo trước**. `meta.totalItems` đếm theo kết quả đã lọc.

---

## 4. Thêm / sửa player

`POST /players` (thêm) – `PATCH /players/:id` (sửa, mọi field tuỳ chọn)

```json
{
  "name": "Nguyễn Văn An",
  "avatar": "https://example.com/a.png",
  "point": 12.5,
  "phone": "0912 345 678"
}
```

| Field | Ràng buộc |
|---|---|
| `name` | string, **bắt buộc khi thêm**, không rỗng |
| `avatar` | string, tuỳ chọn (có thể bỏ trống) |
| `point` | số ≥ 0, cho phép số lẻ, mặc định `0` |
| `phone` | tuỳ chọn. 8–15 chữ số, có thể có `+` ở đầu. Server tự bỏ khoảng trắng / `.` / `-` / `(` / `)` và đổi `+84` → `0`. Gửi `null` hoặc `""` để bỏ trống / xoá số |

Lưu ý về `phone`:

- Response trả số **đã chuẩn hoá** (vd gửi `+84 912 345 678` → nhận `0912345678`). Muốn hiển thị `0912 345 678` thì frontend tự format.
- **Không được trùng** với player khác của bạn (`0912…` và `+84912…` coi là trùng) → `409`.

| Lỗi | Khi nào |
|---|---|
| `400` | Sai định dạng (vd `point` âm, `phone` sai) – `details` chứa danh sách lỗi |
| `403` | Player không thuộc về bạn |
| `404` | Không tìm thấy player |
| `409` | Số điện thoại đã dùng cho player khác |

---

## 5. Xuất Excel ⭐

`GET /players/export` hoặc `GET /players/export?search=nguyen`

- Trả về **file `.xlsx`** (không bọc JSON), tên file dạng `danh-sach-player-2026-10-16.xlsx` (ngày theo giờ Việt Nam).
- Có `search` → chỉ xuất player khớp, **cùng quy tắc tìm kiếm** như mục 3. Không có → xuất tất cả.
- Lấy **toàn bộ** kết quả (không phân trang), **cùng thứ tự** với danh sách (mới tạo trước).

Nội dung file (sheet `Players`):

| Tên | Số điện thoại | Điểm |
|---|---|---|
| Nguyễn Văn An | 0912345678 | 12.5 |
| Trần Thị Ánh | | 0 |

- **Số điện thoại** lưu dạng chữ → giữ nguyên số `0` ở đầu. Không có số → ô trống.
- **Điểm** lưu dạng số → cộng / sắp xếp / lọc được trong Excel.
- Dòng tiêu đề in đậm, cố định khi cuộn, có sẵn bộ lọc.

Response headers:

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="danh-sach-player-2026-10-16.xlsx"
Access-Control-Expose-Headers: Content-Disposition
```

### 5.1. Cách tải file từ frontend

> ⚠️ API cần token, nên **không thể** dùng `<a href="/players/export">` hay `window.open` trực tiếp. Phải gọi bằng `fetch`/`axios` kèm header `Authorization`, nhận dữ liệu dạng **blob**, rồi tạo link tải.

**Với `fetch`:**

```typescript
export async function exportPlayers(search?: string) {
  const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const res = await fetch(`${BASE_URL}/players/export${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    // Lỗi vẫn trả JSON như các API khác
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'Xuất file thất bại');
  }

  const blob = await res.blob();
  const filename =
    getFilename(res.headers.get('Content-Disposition')) ?? 'danh-sach-player.xlsx';
  downloadBlob(blob, filename);
}
```

**Với `axios`:**

```typescript
export async function exportPlayers(search?: string) {
  const res = await axios.get(`${BASE_URL}/players/export`, {
    params: search?.trim() ? { search: search.trim() } : undefined,
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob', // BẮT BUỘC
  });
  const filename =
    getFilename(res.headers['content-disposition']) ?? 'danh-sach-player.xlsx';
  downloadBlob(res.data, filename);
}
```

> Với axios + `responseType: 'blob'`, khi lỗi `res.data` cũng là Blob. Đọc message bằng: `JSON.parse(await error.response.data.text()).message`.

**Hàm tiện ích dùng chung:**

```typescript
/** Lấy tên file từ header Content-Disposition */
export function getFilename(header: string | null | undefined): string | null {
  const match = header?.match(/filename="?([^"]+)"?/);
  return match ? match[1] : null;
}

/** Kích hoạt tải file trong trình duyệt */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

### 5.2. Ví dụ nút "Xuất Excel" (React)

Xuất theo đúng từ khoá đang tìm trên màn hình danh sách:

```tsx
function ExportButton({ search }: { search: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await exportPlayers(search);
        } catch (e: any) {
          toast(e.message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Đang xuất…' : 'Xuất Excel'}
    </button>
  );
}
```

### 5.3. Lỗi

| Lỗi | Khi nào |
|---|---|
| `401` | Thiếu / hết hạn token |
| `400` | `search` dài quá 100 ký tự |

Không có player nào khớp → vẫn trả file hợp lệ, chỉ có dòng tiêu đề.

---

## 6. Lưu ý

- Mọi API chỉ thao tác trên player **của chính user** đang đăng nhập.
- Xoá player là **xoá hẳn**; nếu player đang được gắn vào entry của tour (`playerId`), entry vẫn giữ `playerId` cũ và `GET /players/:id` sẽ trả `404`.
- API tra cứu player **công khai** (không cần đăng nhập, theo slug của user) là API riêng: `GET /public/users/:slug/players?search=` – trả tối đa 20 kết quả, số điện thoại được che (`0912***678`), tìm số phải khớp đủ số, giới hạn 30 lần/phút/IP.
