import { describe, expect, it } from 'vitest';
import { isUlid, ulid, ulidTime } from './ulid';

describe('ulid', () => {
  it('is 26 characters of Crockford base32', () => {
    const value = ulid();
    expect(value).toHaveLength(26);
    expect(value).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isUlid(value)).toBe(true);
  });

  it('never contains the ambiguous letters I, L, O or U', () => {
    // A key ends up in logs and support conversations; those four are the ones people
    // misread.
    const sample = Array.from({ length: 200 }, () => ulid()).join('');
    expect(sample).not.toMatch(/[ILOU]/);
  });

  it('round-trips the timestamp it encodes', () => {
    const now = 1_790_000_000_000;
    expect(ulidTime(ulid(now))).toBe(now);
  });

  it('sorts lexicographically in the order the values were created', () => {
    const early = ulid(1_700_000_000_000);
    const middle = ulid(1_750_000_000_000);
    const late = ulid(1_790_000_000_000);
    expect([late, early, middle].sort()).toEqual([early, middle, late]);
  });

  it('does not collide within the same millisecond', () => {
    const now = Date.now();
    const values = new Set(Array.from({ length: 5_000 }, () => ulid(now)));
    expect(values.size).toBe(5_000);
  });

  it('rejects a timestamp outside the 48-bit range', () => {
    expect(() => ulid(-1)).toThrow(/outside the 48-bit/);
    expect(() => ulid(281_474_976_710_656)).toThrow(/outside the 48-bit/);
  });

  it('accepts the very edges of the range', () => {
    expect(ulidTime(ulid(0))).toBe(0);
    expect(ulidTime(ulid(281_474_976_710_655))).toBe(281_474_976_710_655);
  });

  it('refuses to read a value that is not a ULID', () => {
    expect(() => ulidTime('not a ulid!')).toThrow(/Not a ULID/);
    expect(isUlid('too-short')).toBe(false);
    expect(isUlid(`${ulid()}X`)).toBe(false);
  });
});
