import { describe, expect, it } from 'vitest';
import {
  FORM_TTL_MS,
  LEAD_LIMITS,
  MIN_FILL_MS,
  looksAutomated,
  normalizeLeadEmail,
  sanitizeLine,
  sanitizeMessage,
} from './leads';

const NOW = new Date('2026-09-28T12:00:00Z').getTime();
const check = (over: Partial<Parameters<typeof looksAutomated>[0]> = {}) =>
  looksAutomated({ honeypot: '', issuedAt: NOW - 10_000, now: NOW, ...over });

describe('looksAutomated', () => {
  it('lets a person through', () => {
    expect(check()).toBe(false);
  });

  it('catches the honeypot', () => {
    expect(check({ honeypot: 'https://spam.example' })).toBe(true);
    // Whitespace is not an answer: a person never touches the field at all.
    expect(check({ honeypot: '   ' })).toBe(false);
  });

  it('refuses a form filled faster than a person can type', () => {
    expect(check({ issuedAt: NOW - (MIN_FILL_MS - 1) })).toBe(true);
    expect(check({ issuedAt: NOW - MIN_FILL_MS })).toBe(false);
  });

  it('refuses a form older than its life, and one from the future', () => {
    expect(check({ issuedAt: NOW - (FORM_TTL_MS + 1) })).toBe(true);
    expect(check({ issuedAt: NOW + 60_000 })).toBe(true);
  });

  it('refuses a submission whose timestamp did not survive the signature', () => {
    expect(check({ issuedAt: null })).toBe(true);
  });
});

describe('normalizeLeadEmail', () => {
  it('lowercases and trims, so the same address is one address', () => {
    expect(normalizeLeadEmail('  Helena@Clinica.COM.BR ')).toBe('helena@clinica.com.br');
  });
});

describe('sanitizing what a stranger typed', () => {
  it('collapses a line and drops control characters', () => {
    expect(sanitizeLine('  Dra.\u0000  Helena \t Prado \n Moema ')).toBe('Dra. Helena Prado Moema');
  });

  it('keeps the paragraphs of a message', () => {
    expect(sanitizeMessage('Oi,   \n\n\n\nquero uma demo.\u0007\n')).toBe('Oi,\n\nquero uma demo.');
  });

  it('leaves ordinary accented text alone', () => {
    expect(sanitizeLine('Harmonização facial — Tatuapé')).toBe('Harmonização facial — Tatuapé');
  });
});

describe('LEAD_LIMITS', () => {
  it('caps the day above the hour, or the hourly cap would be unreachable', () => {
    expect(LEAD_LIMITS.perIpPerDay).toBeGreaterThan(LEAD_LIMITS.perIpPerHour);
  });
});
