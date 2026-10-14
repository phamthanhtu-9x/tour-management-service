import {
  applyInverse,
  computeUndoableIds,
  findBlockingLogIds,
  isRegistrationOpen,
  normalizeEntries,
} from './tour.utils';

describe('isRegistrationOpen', () => {
  it('luôn mở khi regEnd = null', () => {
    expect(isRegistrationOpen(null, 1)).toBe(true);
    expect(isRegistrationOpen(null, 99)).toBe(true);
  });

  it('mở trước và trong level regEnd', () => {
    expect(isRegistrationOpen(6, 1)).toBe(true);
    expect(isRegistrationOpen(6, 6)).toBe(true);
  });

  it('đóng sau khi hết level regEnd', () => {
    expect(isRegistrationOpen(6, 7)).toBe(false);
  });
});

describe('normalizeEntries', () => {
  it('bù mặc định cho entry cũ thiếu trường', () => {
    expect(normalizeEntries([{ name: 'A' }])).toEqual([
      { name: 'A', isEliminated: false, reBuyCount: 0, addOn: [] },
    ]);
  });

  it('giữ nguyên giá trị đã có (kể cả playerId, avatar)', () => {
    const entry = {
      playerId: 5,
      name: 'A',
      avatar: 'x',
      isEliminated: true,
      reBuyCount: 2,
      addOn: [10000, 5000],
    };
    expect(normalizeEntries([entry])).toEqual([entry]);
  });

  it('trả mảng rỗng khi dữ liệu không phải mảng', () => {
    expect(normalizeEntries(null)).toEqual([]);
    expect(normalizeEntries({})).toEqual([]);
  });
});

describe('findBlockingLogIds / computeUndoableIds', () => {
  const logs = [
    { id: 1, action: 'ADD', entryId: 'a' },
    { id: 2, action: 'ADD', entryId: 'b' },
    { id: 3, action: 'REBUY', entryId: 'a' },
    { id: 4, action: 'REBUY', entryId: 'a' },
  ];

  it('chặn khi phía sau có thao tác trên cùng entry', () => {
    expect(findBlockingLogIds(logs[0], logs)).toEqual([3, 4]);
  });

  it('REBUY sau REBUY không chặn nhau', () => {
    expect(findBlockingLogIds(logs[2], logs)).toEqual([]);
  });

  it('BULK_UPDATE phía sau chặn mọi log trước nó', () => {
    const withBulk = [...logs, { id: 5, action: 'BULK_UPDATE', entryId: null }];
    expect(findBlockingLogIds(logs[1], withBulk)).toEqual([5]);
    expect(computeUndoableIds(withBulk)).toEqual([5]);
  });

  it('computeUndoableIds trả các log undo được, mới nhất trước', () => {
    expect(computeUndoableIds(logs)).toEqual([4, 3, 2]);
  });
});

describe('applyInverse', () => {
  const e = (id: string, reBuyCount = 0) => ({
    id,
    name: id.toUpperCase(),
    isEliminated: false,
    reBuyCount,
    addOn: [],
  });

  it('ADD → xoá entry', () => {
    const next = applyInverse(
      { action: 'ADD', entryId: 'b', entryName: 'B', before: [], after: [] },
      [e('a'), e('b')],
    );
    expect(next.map((x) => x.id)).toEqual(['a']);
  });

  it('REMOVE → chèn lại ngay sau entry đứng trước còn tồn tại', () => {
    const next = applyInverse(
      {
        action: 'REMOVE',
        entryId: 'b',
        entryName: 'B',
        before: [e('a'), e('b'), e('c')],
        after: [],
      },
      [e('a'), e('c'), e('d')],
    );
    expect(next.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('REBUY → giảm reBuyCount; về 0 thì 409', () => {
    const target = {
      action: 'REBUY',
      entryId: 'a',
      entryName: 'A',
      before: [],
      after: [],
    };
    expect(applyInverse(target, [e('a', 2)])[0].reBuyCount).toBe(1);
    expect(() => applyInverse(target, [e('a', 0)])).toThrow();
  });
});
