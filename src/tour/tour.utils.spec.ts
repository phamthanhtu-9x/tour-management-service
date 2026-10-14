import { isRegistrationOpen } from './tour.utils';

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
