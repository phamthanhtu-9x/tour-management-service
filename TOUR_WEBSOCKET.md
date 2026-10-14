# Tour WebSocket API – Tài liệu tích hợp Frontend

Tài liệu này mô tả cách frontend kết nối và sử dụng WebSocket để nhận real-time trạng thái của Tour Control.

---

## 1. Tổng quan

| Mục | Giá trị |
|-----|---------|
| **WebSocket URL** | `ws://<host>:3002/tour` (hoặc `wss://` nếu dùng HTTPS) |
| **Namespace** | `/tour` |
| **Auth** | JWT token gửi khi kết nối |
| **Transport** | Socket.IO (WebSocket với fallback polling) |

---

## 2. Kết nối

### 2.1. Cài đặt thư viện Socket.IO client

```bash
npm install socket.io-client
```

### 2.2. Kết nối với JWT auth

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3002/tour', {
  auth: {
    token: 'your-jwt-access-token-here',
  },
  // Tùy chọn: tự động reconnect
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

> **Quan trọng:** Token JWT phải được gửi trong `auth.token` khi tạo kết nối. Nếu token hết hạn hoặc không hợp lệ, server sẽ tự động disconnect và gửi event `tour-error`.

### 2.3. React hook ví dụ

```tsx
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TourState, TourLevelsPayload } from './types';

export function useTourSocket(tourId: number, token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tourState, setTourState] = useState<TourState | null>(null);
  const [tourLevels, setTourLevels] = useState<TourLevelsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io('http://localhost:3002/tour', {
      auth: { token },
    });

    s.on('connect', () => {
      setConnected(true);
      setError(null);
      // Join room của tour → nhận ngay snapshot tour-state + tour-levels
      s.emit('join-tour', { tourId });
    });

    s.on('tour-state', (state: TourState) => {
      setTourState(state);
    });

    s.on('tour-levels', (payload: TourLevelsPayload) => {
      setTourLevels(payload);
    });

    s.on('tour-error', (err: { message: string }) => {
      setError(err.message);
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(s);

    return () => {
      s.emit('leave-tour', { tourId });
      s.disconnect();
    };
  }, [tourId, token]);

  return { tourState, tourLevels, error, connected, socket };
}
```

---

## 3. Events (Client → Server)

### 3.1. `join-tour`

Join vào room của một tour để bắt đầu nhận real-time state.

**Payload gửi đi:**

```json
{
  "tourId": 1
}
```

**Phản hồi:** Server sẽ emit **cả hai** event ngay lập tức:
- `tour-state` – trạng thái clock hiện tại
- `tour-levels` – danh sách level hiện tại

### 3.2. `leave-tour`

Rời khỏi room, ngừng nhận update.

**Payload gửi đi:**

```json
{
  "tourId": 1
}
```

---

## 4. Events (Server → Client)

### 4.1. `tour-state` ⭐ Trạng thái Clock

Server push mỗi khi state tour thay đổi (start, pause, resume, next level, prev level, set level, reset, update entries, update GTD, đổi `regEnd`, đổi levels).

**Payload:**

```typescript
interface TourState {
  /** ID của tour */
  tourId: number;

  /** Level hiện tại (1, 2, 3...) */
  currentLevel: number;

  /** Tour đang pause hay đang chạy */
  isPaused: boolean;

  /** Tour đã được start và chưa bị reset hay chưa */
  isRunning: boolean;

  /**
   * Tổng số giây đã trôi trong level hiện tại.
   * ⚠️ QUAN TRỌNG: Giá trị này được SERVER tính bằng Date.now(),
   * không cần client tự tính.
   */
  elapsedSeconds: number;

  /** Tổng số level của tour */
  totalLevels: number;

  /** Danh sách người chơi */
  entries: PlayerEntry[];

  /** Chuỗi GTD (giải thưởng), ví dụ '10/5/3/3/1/..' */
  gtd: string | null;

  /** Idx của level mà đăng ký (re-entry) kết thúc. null = không giới hạn */
  regEnd: number | null;

  /**
   * Đăng ký còn mở hay không – do SERVER tính:
   * `regEnd === null || currentLevel <= regEnd`
   * (mở cho tới HẾT level regEnd, đóng từ level regEnd + 1).
   * Tự cập nhật khi chuyển level (kể cả auto-advance), không cần client tự tính.
   */
  isRegOpen: boolean;
}

interface PlayerEntry {
  name: string;
  avatar?: string;
  isEliminated: boolean;
  reBuyCount: number;
}
```

**Ví dụ response:**

```json
{
  "tourId": 1,
  "currentLevel": 2,
  "isPaused": false,
  "isRunning": true,
  "elapsedSeconds": 630,
  "totalLevels": 7,
  "entries": [
    { "name": "Nguyễn Văn A", "isEliminated": false, "reBuyCount": 2 },
    { "name": "Trần Thị B", "avatar": "https://...", "isEliminated": true, "reBuyCount": 0 }
  ],
  "gtd": "100/60/40/25/15/10",
  "regEnd": 6,
  "isRegOpen": true
}
```

**Trigger:** Các hành động sau đều broadcast `tour-state`:

| Hành động | REST Endpoint |
|-----------|---------------|
| Start clock | `PATCH /tours/:id/control/start` |
| Pause clock | `PATCH /tours/:id/control/pause` |
| Resume clock | `PATCH /tours/:id/control/resume` |
| Next level | `PATCH /tours/:id/control/next` |
| Previous level | `PATCH /tours/:id/control/prev` |
| Set level | `PATCH /tours/:id/control/set-level` |
| Reset clock | `PATCH /tours/:id/control/reset` |
| Forward 5s (tua tới) | `PATCH /tours/:id/control/forward` |
| Rewind 5s (tua lùi) | `PATCH /tours/:id/control/rewind` |
| Update entries | `PATCH /tours/:id/control/entries` |
| Update GTD | `PATCH /tours/:id/control/gtd` |
| Đổi `regEnd` (kể cả gửi `null` để bỏ giới hạn) | `PATCH /tours/:id` với body chứa `regEnd` |
| Đổi levels (`totalLevels` có thể đổi) | `PATCH /tours/:id` với body chứa `levels` |
| Tự chuyển level khi hết giờ | _(server timer)_ |

> `isRegOpen` thay đổi khi `currentLevel` vượt qua `regEnd` → mọi hành động đổi level ở trên đều tự đẩy `isRegOpen` mới.

### 4.2. `tour-levels` ⭐ Danh sách Level

Server push khi danh sách level của tour thay đổi.
**Cũng được gửi ngay sau khi client `join-tour` thành công.**

**Payload:**

```typescript
interface TourLevelsPayload {
  /** ID của tour */
  tourId: number;

  /** Danh sách level theo thứ tự idx tăng dần */
  levels: TourLevelData[];
}

interface TourLevelData {
  id: number;
  name: string | null;       // Tên level, vd 'Level 1', 'Break'
  type: 'BLIND' | 'BREAK';    // Loại level
  idx: number;                // Thứ tự (1-based)
  duration: number;           // Thời lượng (phút)
  smallBlind: number | null;  // Chỉ có với type=BLIND
  bigBlind: number | null;    // Chỉ có với type=BLIND
  ante: number | null;        // Chỉ có với type=BLIND
}
```

**Ví dụ response:**

```json
{
  "tourId": 1,
  "levels": [
    {
      "id": 10,
      "name": "Level 1",
      "type": "BLIND",
      "idx": 1,
      "duration": 20,
      "smallBlind": 100,
      "bigBlind": 200,
      "ante": 100
    },
    {
      "id": 11,
      "name": "Break",
      "type": "BREAK",
      "idx": 2,
      "duration": 10,
      "smallBlind": null,
      "bigBlind": null,
      "ante": null
    },
    {
      "id": 12,
      "name": "Level 2",
      "type": "BLIND",
      "idx": 3,
      "duration": 20,
      "smallBlind": 200,
      "bigBlind": 400,
      "ante": 200
    }
  ]
}
```

**Trigger:** Broadcast khi:

| Hành động | REST Endpoint |
|-----------|---------------|
| Cập nhật tour có kèm `levels` | `PATCH /tours/:id` với body chứa `levels` |

> **Lưu ý:** Nếu `PATCH /tours/:id` chỉ đổi title/desc/startingStack/regEnd (không gửi `levels`), sẽ **không** broadcast `tour-levels`. Riêng đổi `regEnd` sẽ broadcast `tour-state` (xem 4.1); title/desc/startingStack hiện chưa có real-time.
>
> **Validate `regEnd`:** phải là số nguyên ≥ 1 và không vượt quá số level của tour (tính theo bộ level sau khi cập nhật). Vi phạm → `400 Bad Request`.

### 4.3. `tour-error`

Server gửi khi có lỗi xảy ra.

```json
{
  "message": "Token không hợp lệ hoặc đã hết hạn"
}
```

---

## 5. Luồng hoạt động điển hình

### 5.1. Thiết bị mới đăng nhập (đồng bộ state)

```
1. Frontend kết nối WebSocket với JWT token
2. Server xác thực token → OK
3. Frontend emit 'join-tour' { tourId: 1 }
4. Server kiểm tra quyền → OK
5. Server emit ngay 'tour-state' với state hiện tại
   → { currentLevel: 2, isPaused: false, elapsedSeconds: 630, entries: [...], gtd: '...', regEnd: 6, isRegOpen: true }
6. Server emit ngay 'tour-levels' với danh sách level
   → { tourId: 1, levels: [...] }
7. Frontend hiển thị: Level 2, 10:30 đã trôi, danh sách level đầy đủ
```

### 5.2. Admin thao tác (push real-time)

```
1. Admin nhấn "Pause" → PATCH /tours/1/control/pause
2. Server cập nhật DB, broadcast 'tour-state' tới room "tour:1"
3. TẤT CẢ thiết bị đang xem tour 1 nhận 'tour-state' mới
   → { currentLevel: 2, isPaused: true, elapsedSeconds: 645, ... }
```

### 5.3. Admin sửa levels (push real-time)

```
1. Admin sửa cấu trúc levels → PATCH /tours/1 { ..., levels: [...] }
2. Server cập nhật DB, broadcast 'tour-levels' + 'tour-state' tới room "tour:1"
   (tour-state có totalLevels mới)
3. TẤT CẢ thiết bị đang xem tour 1 nhận:
   - 'tour-levels' → danh sách level mới
   - 'tour-state'  → totalLevels mới
```

---

## 6. Hiển thị đồng hồ đếm ngược (Countdown Timer)

### 6.1. Công thức

```typescript
// elapsedSeconds do server cung cấp, không tự tính từ Date.now()
const elapsed = tourState.elapsedSeconds;

// Lấy duration của level hiện tại (giây) – từ tour-levels
const currentLevel = tourLevels?.levels.find(l => l.idx === tourState.currentLevel);
const durationSeconds = (currentLevel?.duration ?? 0) * 60;

// Thời gian còn lại
const remainingSeconds = Math.max(0, durationSeconds - elapsed);

// Format hiển thị
const minutes = Math.floor(remainingSeconds / 60);
const seconds = remainingSeconds % 60;
const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
```

### 6.2. Ticking clock (client-side)

Vì `tour-state` chỉ được push khi có thay đổi (không push mỗi giây), bạn cần tự tăng `elapsedSeconds` ở client:

```tsx
function TourTimer({ state, levels }: { state: TourState; levels: TourLevelData[] }) {
  const [displayElapsed, setDisplayElapsed] = useState(state.elapsedSeconds);

  useEffect(() => {
    // Reset khi state từ server thay đổi
    setDisplayElapsed(state.elapsedSeconds);
  }, [state.elapsedSeconds, state.currentLevel]);

  useEffect(() => {
    if (state.isPaused) return;

    const interval = setInterval(() => {
      setDisplayElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isPaused, state.elapsedSeconds]);

  const currentLevel = levels.find(l => l.idx === state.currentLevel);
  const durationSeconds = (currentLevel?.duration ?? 0) * 60;
  const remaining = Math.max(0, durationSeconds - displayElapsed);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return <div>{min}:{sec.toString().padStart(2, '0')}</div>;
}
```

---

## 7. REST API (vẫn dùng song song)

Tất cả REST endpoints vẫn hoạt động như cũ.

| Endpoint | Mô tả |
|----------|-------|
| `GET /tours/:id/control` | Lấy trạng thái clock (có `elapsedSeconds`, `totalLevels`, `entries`, `gtd`, `regEnd`, `isRegOpen`) |
| `GET /tours/:id/levels` | Lấy danh sách level |
| `PATCH /tours/:id` | Cập nhật tour (có thể kèm `levels`, `regEnd`) |
| `PATCH /tours/:id/control/start` | Start clock |
| `PATCH /tours/:id/control/pause` | Pause clock |
| `PATCH /tours/:id/control/resume` | Resume clock |
| `PATCH /tours/:id/control/next` | Next level |
| `PATCH /tours/:id/control/prev` | Previous level |
| `PATCH /tours/:id/control/set-level` | Nhảy tới level cụ thể |
| `PATCH /tours/:id/control/reset` | Reset clock |
| `PATCH /tours/:id/control/entries` | Cập nhật danh sách người chơi |
| `PATCH /tours/:id/control/gtd` | Cập nhật GTD |

> **Khuyến nghị:** Dùng REST để lấy dữ liệu ban đầu (nếu muốn có trước khi WebSocket connect), WebSocket để nhận update real-time. Tuy nhiên với `join-tour`, bạn nhận được snapshot đầy đủ ngay nên có thể không cần gọi REST.

---

## 8. Xử lý lỗi & Reconnect

### 8.1. Các trường hợp lỗi

| Lỗi | Event | Xử lý |
|-----|-------|-------|
| Thiếu token | `tour-error` + disconnect | Hiển thị "Vui lòng đăng nhập" |
| Token hết hạn | `tour-error` + disconnect | Refresh token, reconnect |
| Không có quyền truy cập tour | `tour-error` | Hiển thị "Bạn không có quyền xem tour này" |
| Tour không tồn tại | `tour-error` | Hiển thị "Tour không tồn tại" |
| Mất kết nối mạng | `disconnect` | Socket.IO tự reconnect, gửi lại `join-tour` |

### 8.2. Reconnect handler

```typescript
socket.on('connect', () => {
  // Sau khi reconnect, join lại room
  socket.emit('join-tour', { tourId: currentTourId });
});
```

---

## 9. TypeScript types (tham khảo – copy vào frontend)

```typescript
// ===== tour-state =====

export interface TourState {
  tourId: number;
  currentLevel: number;
  isPaused: boolean;
  isRunning: boolean;
  elapsedSeconds: number;
  totalLevels: number;
  entries: PlayerEntry[];
  gtd: string | null;
  regEnd: number | null;
  isRegOpen: boolean;
}

export interface PlayerEntry {
  name: string;
  avatar?: string;
  isEliminated: boolean;
  reBuyCount: number;
}

// ===== tour-levels =====

export interface TourLevelsPayload {
  tourId: number;
  levels: TourLevelData[];
}

export interface TourLevelData {
  id: number;
  name: string | null;
  type: 'BLIND' | 'BREAK';
  idx: number;
  duration: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
}

// ===== Error =====

export interface TourError {
  message: string;
}

// ===== Event map (Socket.IO typed) =====

export interface ClientToServerEvents {
  'join-tour': (data: { tourId: number }) => void;
  'leave-tour': (data: { tourId: number }) => void;
}

export interface ServerToClientEvents {
  'tour-state': (state: TourState) => void;
  'tour-levels': (payload: TourLevelsPayload) => void;
  'tour-error': (error: TourError) => void;
}
```

---

## 10. FAQs

**Q: Có cần poll API `GET /tours/:id/control` hoặc `GET /tours/:id/levels` nữa không?**
A: Không cần nếu đã dùng WebSocket. Khi `join-tour`, server gửi ngay cả `tour-state` và `tour-levels`. Sau đó mọi thay đổi được push tự động.

**Q: elapsedSeconds có chính xác không?**
A: Có. `elapsedSeconds` được server tính bằng `Date.now()` của chính server. Mọi thiết bị nhận cùng một giá trị, không phụ thuộc vào clock của từng thiết bị.

**Q: Nếu nhiều người cùng xem 1 tour thì sao?**
A: Tất cả cùng nhận state qua WebSocket room `tour:<tourId>`. Hệ thống hoạt động như một "màn hình chung".

**Q: WebSocket có ảnh hưởng tới REST API không?**
A: Không. REST API vẫn hoạt động bình thường. WebSocket là kênh bổ sung.

**Q: Khi `tour-state` có `currentLevel` đổi thì `tour-levels` có được gửi lại không?**
A: Không. `tour-levels` chỉ gửi khi cấu trúc levels thực sự thay đổi (thêm/xóa/sửa level). `currentLevel` thay đổi chỉ được phản ánh trong `tour-state`.
