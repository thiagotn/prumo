import { describe, expect, it } from 'vitest';
import {
  CLASSICAL_BACKGROUND,
  MIN_CONTRAST,
  contrastRatio,
  normalizeHex,
  relativeLuminance,
  validateAccentColor,
} from './color';

describe('normalizeHex', () => {
  it('accepts six digits with and without #', () => {
    expect(normalizeHex('#B68235')).toBe('#b68235');
    expect(normalizeHex('b68235')).toBe('#b68235');
  });

  it('expands the three-digit short form', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
  });

  it('refuses anything that is not hex', () => {
    for (const input of ['', '#12', '#12345', 'rgb(1,2,3)', '#gggggg', 'vermelho']) {
      expect(normalizeHex(input)).toBeNull();
    }
  });
});

describe('contrastRatio', () => {
  it('white against black is 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });

  it('a colour against itself is 1:1', () => {
    expect(contrastRatio('#b68235', '#b68235')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#b68235', CLASSICAL_BACKGROUND)).toBeCloseTo(
      contrastRatio(CLASSICAL_BACKGROUND, '#b68235'),
      6,
    );
  });

  it('luminance grows from black to white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
  });
});

describe('validateAccentColor — minimum 3:1 against the Classical background', () => {
  // The README's three example tenants all have to pass.
  it.each([
    ['Tati', '#b68235'],
    ['Aurora', '#7d5411'],
    ['Vértice', '#444141'],
  ])('%s (%s) is accepted', (_name, hex) => {
    const result = validateAccentColor(hex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('refuses a pale gold that vanishes into the paper', () => {
    const result = validateAccentColor('#facb8d'); // accent-300 from Classical
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.contrast).toBeLessThan(MIN_CONTRAST);
      expect(result.error).toContain('3:1');
    }
  });

  it('refuses white and near-white', () => {
    expect(validateAccentColor('#ffffff').ok).toBe(false);
    expect(validateAccentColor('#f8f4f4').ok).toBe(false);
  });

  it('accepts black — maximum contrast', () => {
    expect(validateAccentColor('#000000').ok).toBe(true);
  });

  it('normalises before saving', () => {
    const result = validateAccentColor('  #B68235 ');
    expect(result.ok && result.hex).toBe('#b68235');
  });

  it('explains what to do when the hex is invalid', () => {
    const result = validateAccentColor('dourado');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('hexadecimal');
  });
});
