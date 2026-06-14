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
import { TourState } from './types';

export function useTourSocket(tourId: number, token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tourState, setTourState] = useState<TourState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io('http://localhost:3002/tour', {
      auth: { token },
    });

    s.on('connect', () => {
      setConnected(true);
      setError(null);
      // Join room của tour
      s.emit('join-tour', { tourId });
    });

    s.on('tour-state', (state: TourState) => {
      setTourState(state);
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

  return { tourState, error, connected, socket };
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

**Phản hồi:** Server sẽ emit `tour-state` ngay lập tức với state hiện tại của tour.

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

### 4.1. `tour-state` ⭐ Quan trọng nhất

Server push mỗi khi state tour thay đổi (start, pause, resume, next level, prev level, reset, update entries).

**Payload:**

```typescript
interface TourState {
  /** ID của tour */
  tourId: number;

  /** Level hiện tại (1, 2, 3...) */
  currentLevel: number;

  /** Tour đang pause hay đang chạy */
  isPaused: boolean;

  /**
   * Tổng số giây đã trôi trong level hiện tại.
   * ⚠️ QUAN TRỌNG: Giá trị này được SERVER tính toán,
   * không cần client tự tính.
   */
  elapsedSeconds: number;

  /** Tổng số level của tour */
  totalLevels: number;

  /** Danh sách người chơi */
  entries: PlayerEntry[];
}

interface PlayerEntry {
  name: string;
  avatar?: string;
  isEliminated: boolean;
}
```

**Ví dụ response:**

```json
{
  "tourId": 1,
  "currentLevel": 2,
  "isPaused": false,
  "elapsedSeconds": 630,
  "totalLevels": 7,
  "entries": [
    { "name": "Nguyễn Văn A", "isEliminated": false },
    { "name": "Trần Thị B", "avatar": "https://...", "isEliminated": true }
  ]
}
```

### 4.2. `tour-error`

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
   → VD: { currentLevel: 2, isPaused: false, elapsedSeconds: 630 }
6. Frontend hiển thị: Level 2, 10:30 đã trôi
```

### 5.2. Admin thao tác (push real-time)

```
1. Admin nhấn "Pause" → PATCH /tours/1/control/pause
2. Server cập nhật DB, broadcast 'tour-state' tới room "tour:1"
3. TẤT CẢ thiết bị đang xem tour 1 nhận 'tour-state' mới
   → VD: { currentLevel: 2, isPaused: true, elapsedSeconds: 645 }
```

---

## 6. Hiển thị đồng hồ đếm ngược (Countdown Timer)

### 6.1. Công thức

```typescript
// elapsedSeconds do server cung cấp, không tự tính từ Date.now()
const elapsed = tourState.elapsedSeconds;

// Lấy duration của level hiện tại (giây) – lấy từ API levels hoặc từ tourState mở rộng
const durationSeconds = currentLevelDuration * 60; // duration lưu bằng phút

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
function TourTimer({ state }: { state: TourState }) {
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

  const duration = currentLevelDuration * 60;
  const remaining = Math.max(0, duration - displayElapsed);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return <div>{min}:{sec.toString().padStart(2, '0')}</div>;
}
```

---

## 7. REST API (vẫn dùng song song)

Tất cả REST endpoints vẫn hoạt động như cũ. API `GET /tours/:id/control` nay **đã trả về thêm `elapsedSeconds`**:

```json
{
  "id": 1,
  "currentLevel": 2,
  "isPaused": false,
  "pausedAtSecond": 0,
  "levelStartedAt": "2026-06-14T03:30:00.000Z",
  "elapsedSeconds": 630,
  "totalLevels": 7,
  "entries": [...]
}
```

> **Khuyến nghị:** Dùng REST để lấy dữ liệu ban đầu, WebSocket để nhận update real-time.

---

## 8. Xử lý lỗi & Reconnect

### 8.1. Các trường hợp lỗi

| Lỗi | Event | Xử lý |
|-----|-------|-------|
| Thiếu token | `tour-error` + disconnect | Hiển thị "Vui lòng đăng nhập" |
| Token hết hạn | `tour-error` + disconnect | Refresh token, reconnect |
| Không có quyền truy cập tour | `tour-error` | Hiển thị "Bạn không có quyền xem tour này" |
| Mất kết nối mạng | `disconnect` | Socket.IO tự reconnect, gửi lại `join-tour` |
| Tour không tồn tại | `tour-error` | Hiển thị "Tour không tồn tại" |

### 8.2. Reconnect handler

```typescript
socket.on('connect', () => {
  // Sau khi reconnect, join lại room
  socket.emit('join-tour', { tourId: currentTourId });
});
```

---

## 9. TypeScript types (tham khảo)

```typescript
// Có thể copy file này vào frontend
export interface TourState {
  tourId: number;
  currentLevel: number;
  isPaused: boolean;
  elapsedSeconds: number;
  totalLevels: number;
  entries: PlayerEntry[];
}

export interface PlayerEntry {
  name: string;
  avatar?: string;
  isEliminated: boolean;
}

export interface TourError {
  message: string;
}

// Event map
export interface ClientToServerEvents {
  'join-tour': (data: { tourId: number }) => void;
  'leave-tour': (data: { tourId: number }) => void;
}

export interface ServerToClientEvents {
  'tour-state': (state: TourState) => void;
  'tour-error': (error: TourError) => void;
}
```

---

## 10. FAQs

**Q: Có cần poll API `GET /tours/:id/control` nữa không?**
A: Không cần nếu đã dùng WebSocket. WebSocket sẽ push state mới mỗi khi có thay đổi. Tuy nhiên, bạn có thể gọi REST API khi load trang lần đầu để có dữ liệu nhanh (không đợi WebSocket connect), sau đó chuyển sang WebSocket để nhận update.

**Q: elapsedSeconds có chính xác không?**
A: Có. `elapsedSeconds` được server tính bằng `Date.now()` của chính server. Mọi thiết bị nhận cùng một giá trị, không phụ thuộc vào clock của từng thiết bị.

**Q: Nếu nhiều người cùng xem 1 tour thì sao?**
A: Tất cả cùng nhận state qua WebSocket room `tour:<tourId>`. Hệ thống hoạt động như một "màn hình chung".

**Q: WebSocket có ảnh hưởng tới REST API không?**
A: Không. REST API vẫn hoạt động bình thường. WebSocket là kênh bổ sung.
