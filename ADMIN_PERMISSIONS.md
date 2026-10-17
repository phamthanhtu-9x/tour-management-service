# Phân quyền & Giới hạn theo gói – Tài liệu tích hợp Frontend

Tài liệu mô tả hệ thống vai trò (role) của user, giới hạn tính năng theo gói, và các API quản trị dành cho super admin.

---

## 1. Tóm tắt

| Role | Ai | Giới hạn |
|---|---|---|
| `SUPER_ADMIN` | **Duy nhất 1 tài khoản** – quản lý user và cấu hình gói | Không giới hạn. Không ai sửa / xoá / đổi role được tài khoản này |
| `TRIAL` | Gói dùng thử – **mọi tài khoản đăng ký mới** | Theo cấu hình gói TRIAL (super admin chỉnh) |
| `STANDARD` | Gói tiêu chuẩn – tài khoản cũ (trước khi có tính năng) và user được nâng gói | Theo cấu hình gói STANDARD (mặc định không giới hạn) |

Các giới hạn có thể cấu hình cho từng gói:

| Giới hạn | Ý nghĩa | Mặc định TRIAL | Mặc định STANDARD |
|---|---|---|---|
| `maxPlayers` | Số player tối đa trong danh sách player | 20 | không giới hạn |
| `maxTours` | Số tour tối đa được tạo | 3 | không giới hạn |
| `maxRunningTours` | Số tour **chạy cùng lúc** tối đa | 1 | không giới hạn |
| `canExportPlayers` | Được xuất Excel danh sách player | ✗ | ✓ |

> `null` = không giới hạn.

Quy tắc:

- Giới hạn chỉ **chặn tạo thêm**. Nếu user bị hạ gói khi đang vượt giới hạn, dữ liệu cũ vẫn giữ nguyên.
- Đổi gói / đổi cấu hình **có hiệu lực ngay**, không cần đăng nhập lại.
- `maxRunningTours`: chỉ tính khi **Start** clock. Resume sau khi tạm dừng không bị chặn; start lại chính tour đang chạy cũng không bị chặn.

---

## 2. Kiểu dữ liệu (copy vào frontend)

```typescript
export type Role = 'SUPER_ADMIN' | 'TRIAL' | 'STANDARD';
export type Plan = 'TRIAL' | 'STANDARD';

export interface PlanLimits {
  maxPlayers: number | null;       // null = không giới hạn
  maxTours: number | null;
  maxRunningTours: number | null;
  canExportPlayers: boolean;
}

export interface PlanUsage {
  players: number;
  tours: number;
  runningTours: number;
}

export interface MyLimits {
  role: Role;
  limits: PlanLimits;
  usage: PlanUsage;
}

/** details của lỗi 403 khi vượt giới hạn / thiếu tính năng */
export type PlanErrorDetails =
  | { code: 'PLAN_LIMIT'; limit: 'maxPlayers' | 'maxTours' | 'maxRunningTours'; max: number; current: number; role: Role }
  | { code: 'PLAN_FEATURE'; feature: 'canExportPlayers'; role: Role };
```

---

## 3. API cho mọi user

### 3.1. `GET /users/me` – có thêm `role`

```json
{ "id": 7, "email": "tu@gmail.com", "slug": "tu", "displayName": "Tú", "role": "TRIAL", "...": "..." }
```

Dùng `role` để:

- Hiện menu **Quản trị** chỉ khi `role === 'SUPER_ADMIN'`.
- Hiện nhãn gói: `TRIAL` → "Dùng thử", `STANDARD` → "Tiêu chuẩn".

> `PATCH /users/me` **không** đổi được `role` (trường này bị bỏ qua). Super admin vẫn tự sửa hồ sơ (tên, avatar, slug…) bình thường.

### 3.2. `GET /users/me/limits` – giới hạn & mức đang dùng

```json
{
  "role": "TRIAL",
  "limits": { "maxPlayers": 20, "maxTours": 3, "maxRunningTours": 1, "canExportPlayers": false },
  "usage":  { "players": 12, "tours": 3, "runningTours": 1 }
}
```

Gọi khi vào app / sau khi thêm-xoá player, tạo-xoá tour, start-kết thúc tour để:

- Hiển thị "12/20 người chơi", "3/3 tour".
- **Khoá nút trước** khi user bấm (server vẫn chặn lại nếu frontend bỏ sót).

```typescript
export const isFull = (max: number | null, used: number) => max !== null && used >= max;

const canAddPlayer   = !isFull(limits.maxPlayers, usage.players);
const canCreateTour  = !isFull(limits.maxTours, usage.tours);
const canStartTour   = !isFull(limits.maxRunningTours, usage.runningTours); // tour khác đang chạy
const canExport      = limits.canExportPlayers;

export const formatUsage = (used: number, max: number | null) =>
  max === null ? `${used}` : `${used}/${max}`;
```

---

## 4. Lỗi khi vượt giới hạn (403)

Các API bị kiểm tra:

| API | Lỗi khi |
|---|---|
| `POST /players` | Đã đủ `maxPlayers` |
| `POST /tours` | Đã đủ `maxTours` |
| `PATCH /tours/:id/control/start` | Số tour **khác** đang chạy đã đủ `maxRunningTours` |
| `GET /players/export` | Gói không có `canExportPlayers` |

Response:

```json
{
  "statusCode": 403,
  "timestamp": "2026-10-17T17:00:00.000Z",
  "message": "Gói dùng thử chỉ được tạo tối đa 3 tour",
  "details": { "code": "PLAN_LIMIT", "limit": "maxTours", "max": 3, "current": 3, "role": "TRIAL" }
}
```

```json
{
  "statusCode": 403,
  "message": "Gói dùng thử không có tính năng xuất Excel danh sách người chơi",
  "details": { "code": "PLAN_FEATURE", "feature": "canExportPlayers", "role": "TRIAL" }
}
```

Các message mẫu:

| `limit` / `feature` | message |
|---|---|
| `maxPlayers` | "Gói dùng thử chỉ được thêm tối đa 20 người chơi" |
| `maxTours` | "Gói dùng thử chỉ được tạo tối đa 3 tour" |
| `maxRunningTours` | "Gói dùng thử chỉ được chạy tối đa 1 tour cùng lúc" |
| `canExportPlayers` | "Gói dùng thử không có tính năng xuất Excel danh sách người chơi" |

Gợi ý xử lý chung (axios interceptor):

```typescript
axios.interceptors.response.use(undefined, (error) => {
  const body = error.response?.data;
  const code = body?.details?.code;
  if (error.response?.status === 403 && (code === 'PLAN_LIMIT' || code === 'PLAN_FEATURE')) {
    showUpgradeDialog(body.message); // vd: "…  Liên hệ quản trị viên để nâng cấp gói."
  }
  return Promise.reject(error);
});
```

> Với API export (axios `responseType: 'blob'`), lỗi cũng là Blob: đọc bằng `JSON.parse(await error.response.data.text())` (xem `PLAYER_API.md`).

---

## 5. API quản trị – chỉ `SUPER_ADMIN`

Mọi API `/admin/*` cần token của super admin. User khác → `403 "Bạn không có quyền thực hiện thao tác này"`.

### 5.1. Danh sách user

`GET /admin/users?search=&role=&page=1&limit=10`

| Query | Mô tả |
|---|---|
| `search` | Tìm theo email, slug, tên hiển thị (không phân biệt hoa thường) |
| `role` | Lọc: `SUPER_ADMIN` / `TRIAL` / `STANDARD` |
| `page`, `limit` | Phân trang (limit tối đa 100) |

```json
{
  "items": [
    {
      "id": 7, "email": "tu@gmail.com", "slug": "tu", "displayName": "Tú",
      "firstName": "", "lastName": "", "avatar": null,
      "role": "TRIAL", "toursCount": 3, "playersCount": 12,
      "createdAt": "...", "updatedAt": "..."
    }
  ],
  "meta": { "totalItems": 1, "itemCount": 1, "itemsPerPage": 10, "totalPages": 1, "currentPage": 1 }
}
```

Mới đăng ký trước. Không bao giờ trả mật khẩu.

### 5.2. Đổi gói của user

`PATCH /admin/users/:id/role`

```json
{ "role": "STANDARD" }
```

| Lỗi | Khi nào |
|---|---|
| `400` | `role` khác `TRIAL` / `STANDARD` (không thể gán `SUPER_ADMIN` qua API) |
| `403` | User đích là super admin: "Không thể thay đổi tài khoản super admin" |
| `404` | Không tìm thấy user |

Response: user sau khi cập nhật (cùng dạng một item ở mục 5.1).

👉 Trên UI nên **ẩn / disable** nút đổi gói ở dòng của super admin.

### 5.3. Xem cấu hình gói

`GET /admin/plans`

```json
[
  { "plan": "TRIAL",    "maxPlayers": 20,   "maxTours": 3,    "maxRunningTours": 1,    "canExportPlayers": false },
  { "plan": "STANDARD", "maxPlayers": null, "maxTours": null, "maxRunningTours": null, "canExportPlayers": true }
]
```

### 5.4. Sửa cấu hình gói

`PUT /admin/plans/TRIAL` (hoặc `/admin/plans/STANDARD`) – **gửi đủ cả 4 trường**:

```json
{ "maxPlayers": 50, "maxTours": 5, "maxRunningTours": 2, "canExportPlayers": true }
```

| Trường | Ràng buộc |
|---|---|
| `maxPlayers`, `maxTours`, `maxRunningTours` | Số nguyên ≥ 0, hoặc `null` = không giới hạn. **Bắt buộc có mặt** |
| `canExportPlayers` | boolean, bắt buộc |

Thiếu trường / số âm / số lẻ → `400`. Có hiệu lực ngay cho mọi user thuộc gói đó.

Gợi ý form: mỗi giới hạn là một ô số + checkbox "Không giới hạn" (tick → gửi `null`).

---

## 6. Thiết lập super admin (cho backend / DevOps)

Không có API nào tạo super admin. Sau khi chạy migration, nâng **một** tài khoản đã đăng ký:

```bash
npm run admin:promote -- tu@gmail.com
```

- Từ chối nếu hệ thống đã có super admin (chỉ được có 1).
- Từ chối nếu email chưa đăng ký.

---

## 7. Checklist cho frontend

- [ ] Lưu `role` từ `GET /users/me`; ẩn/hiện menu Quản trị theo `SUPER_ADMIN`.
- [ ] Gọi `GET /users/me/limits` để hiển thị mức dùng và khoá nút Thêm player / Tạo tour / Start / Xuất Excel.
- [ ] Bắt lỗi `403` có `details.code` = `PLAN_LIMIT` / `PLAN_FEATURE` → hiện thông báo nâng cấp.
- [ ] Gọi lại `/users/me/limits` sau các thao tác làm thay đổi số lượng.
- [ ] Trang quản trị: danh sách user, đổi gói (ẩn với super admin), form cấu hình 2 gói.
