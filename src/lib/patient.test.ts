import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  birthDateInputValue,
  formatBirthDate,
  formatCpf,
  formatPhone,
  isValidCpf,
  normalizePhone,
  parseBirthDate,
} from './patient';

describe('normalizePhone', () => {
  it('keeps the digits of a mobile and of a landline', () => {
    expect(normalizePhone('(11) 98765-0001')).toEqual({ ok: true, digits: '11987650001' });
    expect(normalizePhone('11 3456-7890')).toEqual({ ok: true, digits: '1134567890' });
  });

  it('refuses a number without an area code, and one too long', () => {
    expect(normalizePhone('98765-0001').ok).toBe(false);
    expect(normalizePhone('11987650001234').ok).toBe(false);
  });
});

describe('formatPhone', () => {
  it('formats mobile and landline as the clinic reads them', () => {
    expect(formatPhone('11987650001')).toBe('(11) 98765-0001');
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890');
  });

  it('leaves an unexpected number alone instead of mangling it', () => {
    expect(formatPhone('+5511987650001')).toBe('+5511987650001');
    expect(formatPhone(null)).toBe('—');
  });
});

describe('isValidCpf', () => {
  it('accepts valid numbers, formatted or not', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.444.777-30')).toBe(false);
  });

  it('rejects repeated digits, which pass the arithmetic but are not CPFs', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('formats for reading', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(formatCpf(null)).toBe('—');
  });
});

describe('parseBirthDate', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('parses the date input into UTC midnight', () => {
    const parsed = parseBirthDate('1988-03-14', now);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.date?.toISOString()).toBe('1988-03-14T00:00:00.000Z');
  });

  it('treats an empty field as "not informed"', () => {
    expect(parseBirthDate('', now)).toEqual({ ok: true, date: null });
  });

  it('refuses a day that does not exist', () => {
    // Date.UTC would roll this into 2 March; the parser has to catch it.
    expect(parseBirthDate('1988-02-31', now).ok).toBe(false);
    expect(parseBirthDate('14/03/1988', now).ok).toBe(false);
  });

  it('refuses a date in the future and an implausible year', () => {
    expect(parseBirthDate('2027-01-01', now).ok).toBe(false);
    expect(parseBirthDate('1850-01-01', now).ok).toBe(false);
  });

  it('round-trips through the input value', () => {
    const parsed = parseBirthDate('1975-01-09', now);
    expect(parsed.ok && birthDateInputValue(parsed.date)).toBe('1975-01-09');
  });
});

describe('formatBirthDate', () => {
  it('reads in the stored day, not the server day', () => {
    // The clinic is at UTC-3: formatted in local time, UTC midnight would read as the
    // day before. This is the regression that test guards.
    const date = new Date('1988-03-14T00:00:00Z');
    expect(formatBirthDate(date)).toBe('14 de março de 1988');
  });

  it('has a dash for a patient booked without one', () => {
    expect(formatBirthDate(null)).toBe('—');
  });
});

describe('ageLabel', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('counts completed years', () => {
    expect(ageLabel(new Date('1988-03-14T00:00:00Z'), now)).toBe('38 anos');
  });

  it('does not count a birthday that has not arrived yet', () => {
    expect(ageLabel(new Date('1988-09-25T00:00:00Z'), now)).toBe('37 anos');
    expect(ageLabel(new Date('1988-09-24T00:00:00Z'), now)).toBe('38 anos');
  });

  it('singular for the first year', () => {
    expect(ageLabel(new Date('2025-09-01T00:00:00Z'), now)).toBe('1 ano');
  });
});
