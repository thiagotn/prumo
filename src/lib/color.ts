// The accent colour comes from the tenant and replaces --color-accent at runtime.
// Before saving, contrast against the Classical background (#f3f2f2) must be >= 3:1
// (docs/design.md) — below that the primary button's border disappears into the paper.
export const CLASSICAL_BACKGROUND = '#f3f2f2';

/** Minimum required contrast: WCAG 2.1 AA for user interface components (1.4.11). */
export const MIN_CONTRAST = 3;

export function normalizeHex(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const short = /^#?([0-9a-f]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1]!.split('') as [string, string, string];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const long = /^#?([0-9a-f]{6})$/.exec(raw);
  return long ? `#${long[1]}` : null;
}

function rgbChannels(hex: string): [number, number, number] {
  const normal = normalizeHex(hex);
  if (!normal) throw new Error(`Invalid hex colour: ${hex}`);
  return [
    parseInt(normal.slice(1, 3), 16),
    parseInt(normal.slice(3, 5), 16),
    parseInt(normal.slice(5, 7), 16),
  ];
}

/** Relative luminance (WCAG 2.1 definition). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbChannels(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(colorA: string, colorB: string): number {
  const a = relativeLuminance(colorA);
  const b = relativeLuminance(colorB);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

export type ColorValidation =
  | { ok: true; hex: string; contrast: number }
  | { ok: false; error: string; contrast?: number };

/** Validates a tenant's accent colour before saving. Error copy is pt-BR (user-facing). */
export function validateAccentColor(
  input: string,
  background = CLASSICAL_BACKGROUND,
): ColorValidation {
  const hex = normalizeHex(input);
  if (!hex) {
    return { ok: false, error: 'Informe a cor em hexadecimal, como #b68235.' };
  }
  const contrast = contrastRatio(hex, background);
  if (contrast < MIN_CONTRAST) {
    return {
      ok: false,
      contrast,
      error: `Contraste de ${contrast.toFixed(2)}:1 contra o fundo ${background}. O mínimo é ${MIN_CONTRAST}:1 — escolha um tom mais escuro.`,
    };
  }
  return { ok: true, hex, contrast };
}
