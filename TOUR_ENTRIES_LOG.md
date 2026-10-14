# Entries: Thêm / Xoá / Rebuy + Log & Undo – Tài liệu tích hợp Frontend

Tài liệu này mô tả cách frontend thao tác danh sách người chơi (entries) của một tour, hiển thị **log thao tác** real-time và **hoàn tác (undo)** – hoàn tác thao tác gần nhất hoặc **hoàn tác từng log riêng lẻ**.

> Đọc kèm [`TOUR_WEBSOCKET.md`](./TOUR_WEBSOCKET.md) cho phần kết nối Socket.IO, `join-tour` và event `tour-state`.

---

## 1. Tóm tắt nhanh

| Việc cần làm | Gọi | Kết quả real-time |
|---|---|---|
| Thêm người chơi | `POST /tours/:id/control/entries` | `tour-state` + `tour-log` (`created`) |
| Xoá người chơi | `DELETE /tours/:id/control/entries/:entryId` | `tour-state` + `tour-log` (`created`) |
| Rebuy (+1 `reBuyCount`) | `POST /tours/:id/control/entries/:entryId/rebuy` | `tour-state` + `tour-log` (`created`) |
| Hoàn tác thao tác **gần nhất** | `POST /tours/:id/control/entries/undo` | `tour-state` + `tour-log` (`undone`) |
| Hoàn tác **một log cụ thể** | `POST /tours/:id/control/entries/logs/:logId/undo` | `tour-state` + `tour-log` (`undone`) |
| Lấy toàn bộ log | `GET /tours/:id/control/entries/logs` | – |
| Reset clock | `PATCH /tours/:id/control/reset` | entries & log bị xoá → `tour-state` + `tour-log` (`reset`) |

Quy tắc vàng:

1. **Mỗi entry có `id` (uuid) do server sinh.** Dùng `entry.id` để xoá/rebuy. Không tự sinh id ở client.
2. **Nguồn sự thật là WebSocket.** Sau khi gọi API, *không cần* tự cập nhật state cục bộ – server đẩy `tour-state` (entries mới) và `tour-log` tới **mọi thiết bị** đang xem tour, kể cả thiết bị vừa gọi API.
3. **Hoàn tác = làm thao tác ngược trên danh sách hiện tại**, không phải quay ngược thời gian: hoàn tác một log cũ **không** làm mất các thao tác khác xảy ra sau nó.
4. **Server cho biết log nào hoàn tác được:** mọi event `tour-log` đều kèm `undoableLogIds`. Chỉ bật nút "Hoàn tác" trên dòng log có `id` nằm trong danh sách này. Không cần tự tính luật.
5. **Không có redo.** Reset clock xoá sạch log – sau reset không hoàn tác được nữa.

---

## 2. Quy ước chung của REST API

- Base URL: `http://<host>:3002`
- Header: `Authorization: Bearer <accessToken>`
- Mọi response thành công được bọc:
  ```json
  { "statusCode": 200, "message": "Success", "data": { ... } }
  ```
  → dữ liệu thật nằm trong `data`.
- Response lỗi:
  ```json
  {
    "statusCode": 409,
    "timestamp": "2026-10-15T00:10:00.000Z",
    "message": "Cần hoàn tác các thao tác phía sau trên \"An\" trước",
    "details": { "blockingLogIds": [4, 5] }
  }
  ```

---

## 3. Kiểu dữ liệu (copy vào frontend)

```typescript
// ===== Entry =====
export interface PlayerEntry {
  /** uuid do server sinh – dùng cho xoá / rebuy */
  id: string;
  /** Id player trong bảng players (không có nếu là khách vãng lai) */
  playerId?: number;
  name: string;
  avatar?: string;
  isEliminated: boolean;
  reBuyCount: number;
  /** Số chip của từng lần add-on, ví dụ [10000, 10000] */
  addOn: number[];
}

// ===== Log =====
export type EntryLogAction = 'ADD' | 'REMOVE' | 'REBUY' | 'BULK_UPDATE';

export interface EntryLogItem {
  id: number;                 // tăng dần theo thời gian
  action: EntryLogAction;
  entryId: string | null;     // null với BULK_UPDATE
  entryName: string | null;   // tên entry tại thời điểm thao tác
  createdAt: string;          // ISO date
  undoneAt: string | null;    // khác null = đã được hoàn tác
}

/** Trạng thái hoàn tác – có trong mọi event `tour-log`, response undo và GET logs */
export interface UndoState {
  /** Còn thao tác chưa hoàn tác (dùng cho nút "Hoàn tác gần nhất") */
  canUndo: boolean;
  /** Id các log hiện có thể hoàn tác riêng lẻ (mới nhất trước) */
  undoableLogIds: number[];
}

// ===== Event `tour-log` (WebSocket) =====
export type TourLogEvent =
  | ({ tourId: number; type: 'snapshot'; logs: EntryLogItem[] } & UndoState)
  | ({ tourId: number; type: 'created';  log: EntryLogItem }    & UndoState)
  | ({ tourId: number; type: 'undone';   log: EntryLogItem }    & UndoState)
  | ({ tourId: number; type: 'reset' }                          & UndoState); // reset: canUndo=false, undoableLogIds=[]
```

| `action` | Ý nghĩa | Gợi ý hiển thị | Hoàn tác sẽ… |
|---|---|---|---|
| `ADD` | Thêm entry | "Đã thêm **{entryName}**" | Xoá entry đó |
| `REMOVE` | Xoá entry | "Đã xoá **{entryName}**" | Thêm lại entry (cùng `id`, cùng dữ liệu) vào gần vị trí cũ |
| `REBUY` | Rebuy (+1) | "**{entryName}** rebuy" | Giảm `reBuyCount` của entry đi 1 |
| `BULK_UPDATE` | Cập nhật cả danh sách qua `PATCH` | "Cập nhật danh sách người chơi" | Khôi phục toàn bộ danh sách như trước lần cập nhật |

Log có `undoneAt != null` nên hiển thị mờ / gạch ngang kèm nhãn "Đã hoàn tác".

---

## 4. REST API chi tiết

### 4.1. Thêm entry

`POST /tours/:id/control/entries` → `201`

Body (mọi field trừ `name` đều tuỳ chọn):

```json
{
  "name": "Nguyễn Văn A",
  "playerId": 5,
  "avatar": "https://example.com/a.png",
  "isEliminated": false,
  "reBuyCount": 0,
  "addOn": [10000]
}
```

| Field | Ràng buộc |
|---|---|
| `name` | string, bắt buộc, không rỗng |
| `playerId` | số nguyên ≥ 1, phải là player **của bạn** (nếu không → `400`) |
| `avatar` | string |
| `isEliminated` | boolean, mặc định `false` |
| `reBuyCount` | số nguyên ≥ 0, mặc định `0` |
| `addOn` | mảng số nguyên ≥ 1, mặc định `[]` |

Response `data`:

```json
{
  "entry":   { "id": "6f1c2a9e-...", "playerId": 5, "name": "Nguyễn Văn A", "isEliminated": false, "reBuyCount": 0, "addOn": [10000] },
  "entries": [ /* toàn bộ entries sau khi thêm */ ],
  "log":     { "id": 12, "action": "ADD", "entryId": "6f1c2a9e-...", "entryName": "Nguyễn Văn A", "createdAt": "...", "undoneAt": null }
}
```

Entry mới được thêm vào **cuối** danh sách.

### 4.2. Xoá entry

`DELETE /tours/:id/control/entries/:entryId` → `200`

Response `data`: `{ "entries": [...], "log": { "action": "REMOVE", ... } }`

| Lỗi | Khi nào |
|---|---|
| `400` | `entryId` không phải uuid |
| `404` | Không tìm thấy entry (có thể đã bị thiết bị khác xoá) |

### 4.3. Rebuy

`POST /tours/:id/control/entries/:entryId/rebuy` → `200` (không cần body)

Tăng `reBuyCount` của entry thêm **1**.

Response `data`: `{ "entry": { ...reBuyCount mới }, "entries": [...], "log": { "action": "REBUY", ... } }`

Lỗi giống mục 4.2.

### 4.4. Hoàn tác

Có 2 API, cùng cơ chế, cùng dạng response:

| API | Hoàn tác |
|---|---|
| `POST /tours/:id/control/entries/undo` | Thao tác **gần nhất chưa được hoàn tác** (nút "Hoàn tác" chung / Ctrl+Z) |
| `POST /tours/:id/control/entries/logs/:logId/undo` | **Đúng log `logId`** (nút "Hoàn tác" trên từng dòng log) |

Không cần body. Response `200`, `data`:

```json
{
  "entries": [ /* entries sau khi hoàn tác */ ],
  "log": { "id": 12, "action": "ADD", "entryName": "Nguyễn Văn A", "undoneAt": "2026-10-15T00:10:00.000Z", ... },
  "canUndo": true,
  "undoableLogIds": [15, 14, 11]
}
```

#### Khi nào một log hoàn tác được?

Một log **bị chặn** nếu phía sau nó còn log **chưa hoàn tác** phụ thuộc vào nó:

| Log muốn hoàn tác | Bị chặn bởi log phía sau (chưa hoàn tác) |
|---|---|
| `ADD` / `REMOVE` / `REBUY` của entry X | Bất kỳ thao tác nào khác trên **cùng entry X**, *trừ* REBUY sau REBUY (rebuy độc lập, không chặn nhau) |
| `ADD` / `REMOVE` / `REBUY` | Bất kỳ `BULK_UPDATE` nào |
| `BULK_UPDATE` | Bất kỳ log nào (chỉ hoàn tác được khi nó là log mới nhất chưa hoàn tác) |

Thao tác trên **entry khác** không chặn. Ví dụ:

```
#1 ADD An   #2 ADD Bình   #3 REBUY An   #4 REBUY An   #5 REMOVE Bình
undoableLogIds = [5, 4, 3]
- #1 (thêm An) bị chặn bởi #3, #4  → phải hoàn tác 2 lần rebuy trước
- #2 (thêm Bình) bị chặn bởi #5     → phải hoàn tác việc xoá Bình trước
- #3 hoàn tác được dù còn #4 (rebuy sau rebuy không chặn)
```

👉 Frontend **không cần tự tính** bảng trên – chỉ cần dùng `undoableLogIds` từ server.

#### Lỗi

| Lỗi | Khi nào | Frontend nên |
|---|---|---|
| `400` "Không còn thao tác nào để hoàn tác" | `/entries/undo` khi không còn log chưa hoàn tác | Disable nút chung theo `canUndo` |
| `400` "Thao tác này đã được hoàn tác" | `logId` đã hoàn tác (vd thiết bị khác vừa làm) | Bỏ qua, UI sẽ tự cập nhật qua `tour-log` |
| `404` "Không tìm thấy log" | `logId` không tồn tại / không thuộc tour (vd vừa reset) | Tải lại log |
| `409` + `details.blockingLogIds` | Log đang bị chặn (xem bảng trên) | Thông báo `message`; có thể highlight các log trong `blockingLogIds` |
| `409` (không có `blockingLogIds`) | Không áp dụng được trên trạng thái hiện tại (rất hiếm) | Thông báo và tải lại `GET /tours/:id/control` + `GET .../entries/logs` |

### 4.5. Lấy log

`GET /tours/:id/control/entries/logs` → `200`

```json
{
  "logs": [ /* EntryLogItem[], mới nhất trước */ ],
  "canUndo": true,
  "undoableLogIds": [15, 14, 11]
}
```

Thường **không cần gọi** nếu đã dùng WebSocket (đã có `snapshot` khi `join-tour`). Dùng khi cần tải lại sau lỗi hoặc khi không dùng socket.

### 4.6. `PATCH /tours/:id/control/entries` (cũ – vẫn hoạt động)

Ghi đè toàn bộ danh sách. Vẫn được hỗ trợ để tương thích, nhưng:

- Được ghi **một** log `BULK_UPDATE` – log này chặn hoàn tác mọi log trước nó cho tới khi chính nó được hoàn tác.
- **Phải gửi kèm `id`** của các entry đang có để giữ nguyên id; entry không có `id` được coi là entry mới và nhận id mới.
- Hai entry trùng `id` → `400`.

👉 Với thêm/xoá/rebuy, **hãy dùng API ở mục 4.1–4.3** để có log rõ ràng và hoàn tác từng thao tác được. Chỉ dùng `PATCH` cho các chỉnh sửa khác (đổi tên, `isEliminated`, `addOn`, sắp xếp lại…).

---

## 5. WebSocket – event `tour-log`

Server → Client, gửi trong room của tour (cùng room với `tour-state`). **Mọi** event đều kèm `canUndo` và `undoableLogIds` mới nhất.

| `type` | Khi nào | Frontend xử lý |
|---|---|---|
| `snapshot` | Ngay sau `join-tour` (và sau reconnect + join lại) | **Thay toàn bộ** danh sách log bằng `logs` |
| `created` | Có thao tác mới (thêm/xoá/rebuy/PATCH) | **Thêm `log` vào đầu** danh sách |
| `undone` | Vừa hoàn tác một log | **Thay** log có cùng `log.id` (giờ có `undoneAt`) |
| `reset` | Reset clock | **Xoá sạch** danh sách log |

Với mọi `type`: cập nhật `canUndo` và `undoableLogIds` từ event.

Thứ tự event sau mỗi thao tác: `tour-state` (entries mới) → `tour-log`.

### 5.1. Reducer mẫu

```typescript
interface LogState extends UndoState {
  logs: EntryLogItem[];   // mới nhất trước
}

export const initialLogState: LogState = { logs: [], canUndo: false, undoableLogIds: [] };

export function logReducer(state: LogState, ev: TourLogEvent): LogState {
  const undo = { canUndo: ev.canUndo, undoableLogIds: ev.undoableLogIds };
  switch (ev.type) {
    case 'snapshot':
      return { logs: ev.logs, ...undo };
    case 'created':
      return { logs: [ev.log, ...state.logs], ...undo };
    case 'undone':
      return { logs: state.logs.map((l) => (l.id === ev.log.id ? ev.log : l)), ...undo };
    case 'reset':
      return { logs: [], ...undo };
  }
}
```

### 5.2. React hook mẫu

```tsx
import { useEffect, useReducer } from 'react';
import type { Socket } from 'socket.io-client';

export function useTourLog(socket: Socket | null, tourId: number) {
  const [state, dispatch] = useReducer(logReducer, initialLogState);

  useEffect(() => {
    if (!socket) return;
    const onLog = (ev: TourLogEvent) => {
      if (ev.tourId === tourId) dispatch(ev);
    };
    socket.on('tour-log', onLog);
    return () => {
      socket.off('tour-log', onLog);
    };
  }, [socket, tourId]);

  return state; // { logs, canUndo, undoableLogIds }
}
```

> Đăng ký listener `tour-log` **trước** khi emit `join-tour` để không lỡ event `snapshot`.

### 5.3. Gọi API

```typescript
const api = (path: string, init?: RequestInit) =>
  fetch(`${BASE_URL}/tours/${tourId}/control/entries${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).then(async (res) => {
    const body = await res.json();
    if (!res.ok) {
      throw Object.assign(new Error(body.message), { status: res.status, details: body.details });
    }
    return body.data;
  });

export const addEntry    = (dto: { name: string; playerId?: number; avatar?: string; addOn?: number[] }) =>
  api('', { method: 'POST', body: JSON.stringify(dto) });
export const removeEntry = (entryId: string) => api(`/${entryId}`, { method: 'DELETE' });
export const rebuyEntry  = (entryId: string) => api(`/${entryId}/rebuy`, { method: 'POST' });
export const undoLatest  = () => api('/undo', { method: 'POST' });
export const undoLog     = (logId: number) => api(`/logs/${logId}/undo`, { method: 'POST' });
export const getLogs     = () => api('/logs');
```

### 5.4. UI mẫu: danh sách log có nút hoàn tác từng dòng

```tsx
function EntryLogList({ logs, undoableLogIds, canUndo }: LogState) {
  const [highlight, setHighlight] = useState<number[]>([]);

  const handleError = async (e: any) => {
    if (e.status === 409 && e.details?.blockingLogIds) {
      setHighlight(e.details.blockingLogIds);         // tô sáng các log đang chặn
      toast(e.message);                                // "Cần hoàn tác các thao tác phía sau trên "An" trước"
    } else if (e.status === 409 || e.status === 404) {
      toast('Dữ liệu đã thay đổi, đang tải lại…');
      await reloadControlAndLogs();
    } else {
      toast(e.message);
    }
  };

  return (
    <>
      <button disabled={!canUndo} onClick={() => undoLatest().catch(handleError)}>
        Hoàn tác gần nhất
      </button>

      <ul>
        {logs.map((log) => (
          <li
            key={log.id}
            className={[log.undoneAt && 'undone', highlight.includes(log.id) && 'blocking']
              .filter(Boolean)
              .join(' ')}
          >
            {describe(log)}
            {log.undoneAt ? (
              <span>Đã hoàn tác</span>
            ) : (
              <button
                disabled={!undoableLogIds.includes(log.id)}
                title={undoableLogIds.includes(log.id) ? '' : 'Cần hoàn tác các thao tác phía sau trước'}
                onClick={() => undoLog(log.id).catch(handleError)}
              >
                Hoàn tác
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

const describe = (l: EntryLogItem) =>
  ({
    ADD: `Đã thêm ${l.entryName}`,
    REMOVE: `Đã xoá ${l.entryName}`,
    REBUY: `${l.entryName} rebuy`,
    BULK_UPDATE: 'Cập nhật danh sách người chơi',
  })[l.action];
```

---

## 6. Luồng điển hình

```
Thiết bị A                         Server                          Thiết bị B
    | POST /entries {name:"An"}      |                                 |
    |------------------------------->| lưu entry + log #1 ADD (1 transaction)
    |<---- 201 {entry, entries, log} |                                 |
    |<====== tour-state =============|====== tour-state ==============>|
    |<== tour-log {created, #1} =====|=== tour-log {created, #1} =====>|
    |                                |                                 |
    |                                |   POST /entries/logs/1/undo     |
    |                                |<--------------------------------|
    |                                | xoá An (thao tác ngược), đánh dấu #1
    |<====== tour-state =============|====== tour-state ==============>|
    |<== tour-log {undone, #1} ======|=== tour-log {undone, #1} ======>|
```

---

## 7. Lưu ý & Edge cases

- **Nhiều thiết bị thao tác cùng lúc:** server khoá dòng dữ liệu trong transaction nên không mất thao tác (vd 2 thiết bị cùng bấm rebuy → `reBuyCount` tăng 2). Trạng thái `undoableLogIds` luôn được đẩy lại sau mỗi thao tác.
- **Hoàn tác dùng chung cho cả tour**, không theo từng thiết bị/người: thiết bị B có thể hoàn tác thao tác vừa làm trên thiết bị A.
- **Hoàn tác một log cũ không làm mất thao tác khác:** ví dụ hoàn tác "thêm Cường" chỉ xoá Cường, các rebuy của An sau đó vẫn giữ nguyên.
- **Entry bị xoá rồi hoàn tác** quay lại với **cùng `id`** và cùng dữ liệu lúc bị xoá, đặt ngay sau entry đứng trước nó (nếu entry đó còn), nếu không thì đặt đầu danh sách.
- **"Hoàn tác gần nhất"** luôn hoàn tác log mới nhất chưa hoàn tác (log mới nhất không bao giờ bị chặn).
- **Log đã hoàn tác không thể hoàn tác lại** (không có redo) nhưng vẫn hiển thị trong lịch sử.
- **Lỗi (400/404/409)** không tạo log và không thay đổi dữ liệu.
- **Dữ liệu cũ:** các entry tạo trước khi có tính năng này đã được gán `id` tự động khi chạy migration.
