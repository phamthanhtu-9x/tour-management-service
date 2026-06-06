import { LevelType } from '../generated/prisma/enums';

/**
 * Cấu trúc level mặc định cho mỗi tour mới.
 * Mỗi BLIND level kéo dài 20 phút, BREAK kéo dài 10 phút.
 * Đơn vị blind/ante là số chip.
 */
export const DEFAULT_TOUR_LEVELS = [
  {
    name: 'Level 1',
    type: LevelType.BLIND,
    idx: 1,
    duration: 20,
    smallBlind: 100,
    bigBlind: 100,
    ante: 100,
  },
  {
    name: 'Level 2',
    type: LevelType.BLIND,
    idx: 2,
    duration: 20,
    smallBlind: 100,
    bigBlind: 200,
    ante: 200,
  },
  {
    name: 'Level 3',
    type: LevelType.BLIND,
    idx: 3,
    duration: 20,
    smallBlind: 200,
    bigBlind: 400,
    ante: 400,
  },
  {
    name: 'Level 4',
    type: LevelType.BLIND,
    idx: 4,
    duration: 20,
    smallBlind: 300,
    bigBlind: 600,
    ante: 600,
  },
  {
    name: 'Level 5',
    type: LevelType.BLIND,
    idx: 5,
    duration: 20,
    smallBlind: 400,
    bigBlind: 800,
    ante: 800,
  },
  {
    name: 'Break',
    type: LevelType.BREAK,
    idx: 6,
    duration: 10,
  },
  {
    name: 'Level 6',
    type: LevelType.BLIND,
    idx: 7,
    duration: 20,
    smallBlind: 500,
    bigBlind: 1000,
    ante: 1000,
  },
];
