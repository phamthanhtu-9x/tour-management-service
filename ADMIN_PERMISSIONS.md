# Phân quyền, Giới hạn theo gói & Thời hạn sử dụng – Tài liệu tích hợp Frontend

Tài liệu mô tả hệ thống vai trò (role) của user, giới hạn tính năng theo gói, **thời hạn sử dụng của từng tài khoản**, và các API quản trị dành cho super admin.

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
| `durationDays` | Thời hạn mặc định (ngày) gán cho user **mới đăng ký** gói này | 14 | vô thời hạn |
| `downgradeDays` | *(chỉ STANDARD)* Hết hạn → tự hạ xuống TRIAL thêm N ngày | – | 5 |

> `null` = không giới hạn.

Quy tắc:

- Giới hạn chỉ **chặn tạo thêm**. Nếu user bị hạ gói khi đang vượt giới hạn, dữ liệu cũ vẫn giữ nguyên.
- Đổi gói / đổi cấu hình **có hiệu lực ngay**, không cần đăng nhập lại.
- `maxRunningTours`: chỉ tính khi **Start** clock. Resume sau khi tạm dừng không bị chặn; start lại chính tour đang chạy cũng không bị chặn.

---

### Thời hạn sử dụng

- Mỗi user có **hạn riêng** (`planExpiresAt`), **không gắn với role**: 2 tài khoản cùng TRIAL có thể 1 cái hết hạn sau 14 ngày, 1 cái vô thời hạn.
  - Role quyết định **được dùng những gì**; thời hạn quyết định **dùng được đến khi nào**.
- Đăng ký mới: TRIAL + hạn = hôm nay + `durationDays` của gói TRIAL (mặc định 14 ngày).
- Tài khoản tạo trước khi có tính năng: **vô thời hạn**. Super admin: **không bao giờ hết hạn**.
- **STANDARD hết hạn → tự hạ xuống TRIAL thêm 5 ngày** (`downgradeDays`, super admin chỉnh được):
  - 5 ngày **tính từ lúc STANDARD hết hạn**, không phải từ lúc đăng nhập lại. Vd hết hạn 31/12 → dùng TRIAL đến 05/01; đăng nhập lại ngày 10/01 thì đã bị khoá.
  - Trong 5 ngày này áp dụng **giới hạn của gói TRIAL** (dữ liệu vượt giới hạn giữ nguyên, chỉ không tạo thêm).
  - `role` của tài khoản đổi thật thành `TRIAL`, `planExpiresAt` = hạn cũ + 5 ngày.
  - `downgradeDays = null` → STANDARD hết hạn bị khoá ngay (không có 5 ngày TRIAL).
  ```
  STANDARD ──(hết hạn 31/12)──► TRIAL đến 05/01 ──(hết hạn 05/01)──► khoá đăng nhập
  ```
- **TRIAL hết hạn → khoá đăng nhập hoàn toàn**:
  - Không đăng nhập được.
  - Token đang dùng bị chặn **ngay** ở mọi API (không chờ token hết hạn).
  - Không kết nối được WebSocket.
  - Dữ liệu **không bị xoá**; gia hạn xong là dùng lại được ngay.
- Kiểm tra theo thời gian thực (không có job định kỳ) → chính xác tới từng giây.

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
  durationDays: number | null;     // thời hạn mặc định cho user mới; null = vô thời hạn
  downgradeDays: number | null;    // chỉ STANDARD: hết hạn → TRIAL thêm N ngày; null = khoá ngay
}

export interface PlanUsage {
  players: number;
  tours: number;
  runningTours: number;
}

export interface MyLimits {
  role: Role;
  planExpiresAt: string | null;    // ISO date; null = vô thời hạn
  daysLeft: number | null;         // số ngày còn lại (làm tròn lên); null = vô thời hạn
  limits: PlanLimits;
  usage: PlanUsage;
}

/** details của lỗi 403 khi vượt giới hạn / thiếu tính năng */
export type PlanErrorDetails =
  | { code: 'PLAN_LIMIT'; limit: 'maxPlayers' | 'maxTours' | 'maxRunningTours'; max: number; current: number; role: Role }
  | { code: 'PLAN_FEATURE'; feature: 'canExportPlayers'; role: Role }
  | { code: 'ACCOUNT_EXPIRED'; expiredAt: string };
```

---

## 3. API cho mọi user

### 3.1. `GET /users/me` – có thêm `role`, `planExpiresAt`

```json
{ "id": 7, "email": "tu@gmail.com", "slug": "tu", "displayName": "Tú", "role": "TRIAL", "planExpiresAt": "2026-11-01T03:15:00.000Z", "...": "..." }
```

Dùng `role` để:

- Hiện menu **Quản trị** chỉ khi `role === 'SUPER_ADMIN'`.
- Hiện nhãn gói: `TRIAL` → "Dùng thử", `STANDARD` → "Tiêu chuẩn".

> `PATCH /users/me` **không** đổi được `role` (trường này bị bỏ qua). Super admin vẫn tự sửa hồ sơ (tên, avatar, slug…) bình thường.

### 3.2. `GET /users/me/limits` – giới hạn & mức đang dùng

```json
{
  "role": "TRIAL",
  "planExpiresAt": "2026-11-01T03:15:00.000Z",
  "daysLeft": 14,
  "limits": { "maxPlayers": 20, "maxTours": 3, "maxRunningTours": 1, "canExportPlayers": false, "durationDays": 14 },
  "usage":  { "players": 12, "tours": 3, "runningTours": 1 }
}
```

Khi STANDARD vừa hết hạn và bị hạ xuống TRIAL, response sẽ trả `role: "TRIAL"` với `daysLeft` ≤ 5 → hiện banner để user liên hệ gia hạn. Nên gọi lại `/users/me/limits` khi app được mở lại / quay lại tab, vì role có thể đổi giữa chừng.

Banner thời hạn gợi ý:

```typescript
function expiryBanner({ daysLeft }: MyLimits): string | null {
  if (daysLeft === null) return null;                 // vô thời hạn
  if (daysLeft <= 3) return `Tài khoản còn ${daysLeft} ngày sử dụng. Liên hệ quản trị viên để gia hạn.`;
  return null;
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

## 4. Tài khoản hết hạn (403 `ACCOUNT_EXPIRED`)

Áp dụng cho **đăng nhập** (`POST /auth/login`) và **mọi API cần token**:

```json
{
  "statusCode": 403,
  "timestamp": "2026-11-01T04:00:00.000Z",
  "message": "Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn",
  "details": { "code": "ACCOUNT_EXPIRED", "expiredAt": "2026-11-01T03:15:00.000Z" }
}
```

- Ở trang đăng nhập: lỗi này chỉ xuất hiện khi **đúng mật khẩu** (sai mật khẩu vẫn báo "Incorrect password").
- **WebSocket**: server gửi `tour-error` rồi ngắt kết nối:
  ```json
  { "message": "Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn", "code": "ACCOUNT_EXPIRED" }
  ```
  → **không reconnect** khi nhận `code: 'ACCOUNT_EXPIRED'`.

Xử lý gợi ý (axios interceptor): xoá token, chuyển về màn hình "Tài khoản đã hết hạn" (khác màn hình đăng nhập lỗi, để user biết cần liên hệ gia hạn):

```typescript
axios.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 403 && error.response.data?.details?.code === 'ACCOUNT_EXPIRED') {
    clearToken();
    router.replace('/account-expired');
  }
  return Promise.reject(error);
});
```

> Không nhầm với `401` (token sai / hết hạn token) – `ACCOUNT_EXPIRED` là **403**, refresh token cũng không giúp được.

---

## 5. Lỗi khi vượt giới hạn (403)

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

## 6. API quản trị – chỉ `SUPER_ADMIN`

Mọi API `/admin/*` cần token của super admin. User khác → `403 "Bạn không có quyền thực hiện thao tác này"`.

### 6.1. Danh sách user

`GET /admin/users?search=&role=&status=&expiringInDays=&page=1&limit=10`

| Query | Mô tả |
|---|---|
| `search` | Tìm theo email, slug, tên hiển thị (không phân biệt hoa thường) |
| `role` | Lọc: `SUPER_ADMIN` / `TRIAL` / `STANDARD` |
| `status` | `active` (còn dùng được) / `expired` (đã hết hạn) |
| `expiringInDays` | Chỉ lấy user **còn hạn** và sẽ hết hạn trong N ngày tới (1–365). Vd tab "Sắp hết hạn": `expiringInDays=7` |
| `page`, `limit` | Phân trang (limit tối đa 100) |

```json
{
  "items": [
    {
      "id": 7, "email": "tu@gmail.com", "slug": "tu", "displayName": "Tú",
      "firstName": "", "lastName": "", "avatar": null,
      "role": "TRIAL", "planExpiresAt": "2026-11-01T03:15:00.000Z", "isExpired": false, "daysLeft": 14,
      "toursCount": 3, "playersCount": 12,
      "createdAt": "...", "updatedAt": "..."
    }
  ],
  "meta": { "totalItems": 1, "itemCount": 1, "itemsPerPage": 10, "totalPages": 1, "currentPage": 1 }
}
```

Mới đăng ký trước. Không bao giờ trả mật khẩu.

`daysLeft` / `planExpiresAt` = `null` → vô thời hạn.

### 6.2. Đổi gói và/hoặc thời hạn ⭐

`PATCH /admin/users/:id/subscription` – mọi trường **tuỳ chọn và độc lập**, gửi trường nào đổi trường đó:

| Trường | Ý nghĩa |
|---|---|
| `role` | `TRIAL` / `STANDARD`. Đổi role **không** tự đổi thời hạn |
| `expiresAt` | Ngày hết hạn `YYYY-MM-DD` (hết hạn lúc **23:59:59 giờ Việt Nam** của ngày đó), hoặc `null` = vô thời hạn |
| `extendDays` | Gia hạn thêm N ngày (1–3650), **cộng dồn**: còn hạn → cộng từ hạn cũ; đã hết hạn → cộng từ bây giờ |

```json
{ "extendDays": 30 }                              // còn 5 ngày → thành 35 ngày
{ "expiresAt": "2026-12-31" }                     // hết hạn cuối ngày 31/12 (giờ VN)
{ "expiresAt": null }                             // vô thời hạn
{ "role": "STANDARD" }                            // nâng gói, giữ nguyên hạn
{ "role": "STANDARD", "expiresAt": "2027-06-30" } // nâng gói + đặt hạn
{ "expiresAt": "2020-01-01" }                     // đặt ngày quá khứ = khoá tài khoản ngay
```

| Lỗi | Khi nào |
|---|---|
| `400` | Không gửi trường nào; gửi **cả** `expiresAt` và `extendDays`; `extendDays` với tài khoản đang vô thời hạn; ngày sai định dạng/không tồn tại; `role` = `SUPER_ADMIN` |
| `403` | User đích là super admin |
| `404` | Không tìm thấy user |

Response: user sau khi cập nhật (cùng dạng một item ở mục 6.1). Gia hạn tài khoản đã hết hạn → **mở khoá ngay**.

> User STANDARD đã bị **hạ xuống TRIAL** (đang trong 5 ngày hoặc đã khoá): muốn khôi phục STANDARD phải gửi kèm `role`, vd `{ "role": "STANDARD", "extendDays": 30 }` (gia hạn tính tiếp từ hạn hiện tại nếu còn, hoặc từ hôm nay nếu đã hết).

Gợi ý UI: nút nhanh "+7 ngày", "+30 ngày" (dùng `extendDays`), ô chọn ngày (dùng `expiresAt`), checkbox "Vô thời hạn" (gửi `expiresAt: null`).

### 6.3. Chỉ đổi gói (API cũ – vẫn dùng được)

`PATCH /admin/users/:id/role`

```json
{ "role": "STANDARD" }
```

| Lỗi | Khi nào |
|---|---|
| `400` | `role` khác `TRIAL` / `STANDARD` (không thể gán `SUPER_ADMIN` qua API) |
| `403` | User đích là super admin: "Không thể thay đổi tài khoản super admin" |
| `404` | Không tìm thấy user |

Tương đương `PATCH …/subscription` với chỉ `{ "role": … }`. Nên dùng `…/subscription` cho code mới.

👉 Trên UI nên **ẩn / disable** nút đổi gói / gia hạn ở dòng của super admin.

### 6.4. Xem cấu hình gói

`GET /admin/plans`

```json
[
  { "plan": "TRIAL",    "maxPlayers": 20,   "maxTours": 3,    "maxRunningTours": 1,    "canExportPlayers": false, "durationDays": 14, "downgradeDays": null },
  { "plan": "STANDARD", "maxPlayers": null, "maxTours": null, "maxRunningTours": null, "canExportPlayers": true,  "durationDays": null, "downgradeDays": 5 }
]
```

### 6.5. Sửa cấu hình gói

`PUT /admin/plans/TRIAL` (hoặc `/admin/plans/STANDARD`) – **gửi đủ cả 5 trường**:

```json
{ "maxPlayers": 50, "maxTours": 5, "maxRunningTours": 2, "canExportPlayers": true, "durationDays": 14 }
```

STANDARD có thêm `downgradeDays` (tuỳ chọn):

```json
{ "maxPlayers": null, "maxTours": null, "maxRunningTours": null, "canExportPlayers": true, "durationDays": null, "downgradeDays": 5 }
```

| Trường | Ràng buộc |
|---|---|
| `maxPlayers`, `maxTours`, `maxRunningTours` | Số nguyên ≥ 0, hoặc `null` = không giới hạn. **Bắt buộc có mặt** |
| `canExportPlayers` | boolean, bắt buộc |
| `durationDays` | Số nguyên ≥ 1, hoặc `null` = vô thời hạn. **Chỉ áp dụng cho user đăng ký MỚI**, không đổi hạn của user đã có |
| `downgradeDays` | *Tuỳ chọn, chỉ có tác dụng với STANDARD* (gửi cho TRIAL sẽ bị bỏ qua). Số nguyên 1–365, hoặc `null` = khoá ngay khi hết hạn. Bỏ trống = giữ nguyên |

Thiếu trường / số âm / số lẻ → `400`. Có hiệu lực ngay cho mọi user thuộc gói đó.

Gợi ý form: mỗi giới hạn là một ô số + checkbox "Không giới hạn" (tick → gửi `null`).

---

## 7. Thiết lập super admin (cho backend / DevOps)

Không có API nào tạo super admin. Sau khi chạy migration, nâng **một** tài khoản đã đăng ký:

```bash
npm run admin:promote -- tu@gmail.com
```

- Từ chối nếu hệ thống đã có super admin (chỉ được có 1).
- Từ chối nếu email chưa đăng ký.

---

## 8. Checklist cho frontend

- [ ] Lưu `role` từ `GET /users/me`; ẩn/hiện menu Quản trị theo `SUPER_ADMIN`.
- [ ] Gọi `GET /users/me/limits` để hiển thị mức dùng và khoá nút Thêm player / Tạo tour / Start / Xuất Excel.
- [ ] Bắt lỗi `403` có `details.code` = `PLAN_LIMIT` / `PLAN_FEATURE` → hiện thông báo nâng cấp.
- [ ] Gọi lại `/users/me/limits` sau các thao tác làm thay đổi số lượng.
- [ ] Bắt `403` `ACCOUNT_EXPIRED` (đăng nhập, mọi API, WebSocket `tour-error`) → xoá token, màn hình "Tài khoản đã hết hạn", không reconnect socket.
- [ ] Hiện banner khi `daysLeft` ≤ 3 (STANDARD vừa bị hạ xuống TRIAL sẽ có `role: "TRIAL"`, `daysLeft` ≤ 5).
- [ ] Trang quản trị: danh sách user (cột hạn sử dụng, lọc `status` / `expiringInDays`), đổi gói + gia hạn (ẩn với super admin), form cấu hình 2 gói (có `durationDays`).
