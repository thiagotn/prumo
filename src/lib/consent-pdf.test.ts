import { describe, expect, it } from 'vitest';
import { consentHash } from './consent';
import { consentPdfFilename, renderConsentPdf, type ConsentPdfInput } from './consent-pdf';

// A 1x1 PNG, which is all the renderer needs to embed something real.
const SIGNATURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const signedAt = new Date('2026-09-24T17:30:00Z');

function input(overrides: Partial<ConsentPdfInput> = {}): ConsentPdfInput {
  return {
    clinicName: 'Dra. Tati Mayumi',
    clinicUnit: 'Coworking Tatuapé',
    title: 'Termo de consentimento — preenchimento labial',
    body: 'Eu autorizo o procedimento.\n\nDeclaro ter sido informada dos riscos.',
    templateVersion: 2,
    patientName: 'Renata Yamada',
    procedureName: 'Preenchimento labial',
    signerName: 'Renata Yamada',
    signerNote: null,
    signedAt,
    signedIp: '203.0.113.7',
    signature: SIGNATURE,
    hash: consentHash({
      templateVersion: 2,
      title: 'Termo',
      body: 'corpo',
      signerName: 'Renata Yamada',
      signedAt,
      signature: SIGNATURE,
    }),
    channel: 'tela',
    ...overrides,
  };
}

describe('renderConsentPdf', () => {
  it('produces a PDF', async () => {
    const bytes = await renderConsentPdf(input());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('does not throw on the typography a word processor pastes in', async () => {
    // Curly quotes, em dashes and an ellipsis are outside WinAnsi, which is all the
    // standard fonts encode — unfolded, they would throw halfway through the document.
    const bytes = await renderConsentPdf(
      input({
        body: '“Aspas” — travessão… e uma seta → fora do Latin-1.',
        signerName: 'Renata “Rê” Yamada',
      }),
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('runs onto more pages instead of off the bottom of one', async () => {
    const short = await renderConsentPdf(input());
    const long = await renderConsentPdf(
      input({ body: Array.from({ length: 120 }, (_, i) => `Cláusula ${i + 1}.`).join('\n\n') }),
    );
    expect(long.byteLength).toBeGreaterThan(short.byteLength);
  });

  it('wraps a word longer than the column instead of letting it run off', async () => {
    const bytes = await renderConsentPdf(input({ body: 'a'.repeat(400) }));
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe('consentPdfFilename', () => {
  it('carries the date and no patient name', () => {
    expect(consentPdfFilename('0b6d1f2e-1111-2222-3333-444455556666', signedAt)).toBe(
      'termo-2026-09-24-0b6d1f2e.pdf',
    );
  });
});
