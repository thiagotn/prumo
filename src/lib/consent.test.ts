import { describe, expect, it } from 'vitest';
import {
  CONSENT_BLANK,
  consentDateLabel,
  consentHash,
  decodeSignaturePng,
  fillConsentBody,
  formatHash,
  linkExpiresAt,
  MAX_SIGNATURE_BYTES,
  paragraphs,
  placeholdersIn,
  slugifyTitle,
} from './consent';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const pngDataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;

describe('fillConsentBody', () => {
  it('fills the placeholders the clinic wrote', () => {
    const body = 'Eu, {{paciente}}, autorizo o {{procedimento}} na {{clinica}} em {{data}}.';
    expect(
      fillConsentBody(body, {
        paciente: 'Renata Yamada',
        procedimento: 'Preenchimento labial',
        clinica: 'Dra. Tati Mayumi',
        data: '24 de setembro de 2026',
      }),
    ).toBe(
      'Eu, Renata Yamada, autorizo o Preenchimento labial na Dra. Tati Mayumi em 24 de setembro de 2026.',
    );
  });

  it('tolerates spacing and case inside the braces', () => {
    expect(fillConsentBody('{{ Paciente }}', { paciente: 'Carla' })).toBe('Carla');
  });

  it('leaves a name that is not a field visible, so the typo gets fixed', () => {
    // A term that silently loses a clause is worse than one with a visible typo.
    expect(fillConsentBody('{{medico}} atende', {})).toBe('{{medico}} atende');
  });

  it('turns a field with nothing to fill into a blank line, as a printed term does', () => {
    // Issued outside an appointment there is no procedure to name, and the patient should
    // see a line to complete rather than the braces of a template.
    expect(fillConsentBody('Autorizo o {{procedimento}}.', {})).toBe(
      `Autorizo o ${CONSENT_BLANK}.`,
    );
    expect(fillConsentBody('{{procedimento}}', { procedimento: '' })).toBe(CONSENT_BLANK);
  });

  it('lists what a wording uses, without repeating', () => {
    expect(placeholdersIn('{{paciente}} e {{paciente}} e {{data}}')).toEqual(['paciente', 'data']);
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and joins wrapped lines', () => {
    expect(paragraphs('Primeiro\nparágrafo.\n\n\nSegundo.')).toEqual([
      'Primeiro parágrafo.',
      'Segundo.',
    ]);
  });

  it('drops empty trailing space', () => {
    expect(paragraphs('Único.\n\n   \n')).toEqual(['Único.']);
  });
});

describe('slugifyTitle', () => {
  it('folds accents and spaces into a readable slug', () => {
    expect(slugifyTitle('Termo de Consentimento — Preenchimento Labial')).toBe(
      'termo-de-consentimento-preenchimento-labial',
    );
    expect(slugifyTitle('Toxina botulínica')).toBe('toxina-botulinica');
  });

  it('never starts or ends with a dash', () => {
    expect(slugifyTitle('  ...Anestesia!  ')).toBe('anestesia');
  });
});

describe('consentHash', () => {
  const base = {
    templateVersion: 2,
    title: 'Termo de consentimento',
    body: 'Eu autorizo o procedimento.',
    signerName: 'Renata Yamada',
    signedAt: new Date('2026-09-24T17:30:00Z'),
    signature: PNG,
  };

  it('is stable for the same record', () => {
    expect(consentHash(base)).toBe(consentHash({ ...base }));
    expect(consentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any part of the signed record changes', () => {
    const original = consentHash(base);
    expect(consentHash({ ...base, templateVersion: 3 })).not.toBe(original);
    expect(consentHash({ ...base, title: 'Termo de consentimento ' })).not.toBe(original);
    expect(consentHash({ ...base, body: `${base.body} ` })).not.toBe(original);
    expect(consentHash({ ...base, signerName: 'Renata Yamadaa' })).not.toBe(original);
    expect(consentHash({ ...base, signedAt: new Date('2026-09-24T17:30:01Z') })).not.toBe(original);
    expect(consentHash({ ...base, signature: Buffer.concat([PNG, Buffer.from([1])]) })).not.toBe(
      original,
    );
  });

  it('does not confuse a character moved from one field to the next', () => {
    // The length prefix is what stops "abc"+"d" hashing like "ab"+"cd".
    const a = consentHash({ ...base, title: 'ab', body: 'cd' });
    const b = consentHash({ ...base, title: 'abc', body: 'd' });
    expect(a).not.toBe(b);
  });

  it('prints in groups, so it can be read out loud', () => {
    expect(formatHash('0123456789abcdef0123456789abcdef')).toBe(
      '01234567 89abcdef 01234567 89abcdef',
    );
  });
});

describe('decodeSignaturePng', () => {
  it('accepts what the signature pad produces', () => {
    const decoded = decodeSignaturePng(pngDataUrl(PNG));
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && decoded.bytes.equals(PNG)).toBe(true);
  });

  it('refuses an empty pad', () => {
    expect(decodeSignaturePng('').ok).toBe(false);
    expect(decodeSignaturePng('data:image/png;base64,').ok).toBe(false);
  });

  it('refuses something that only claims to be a PNG', () => {
    // The data URL prefix is a claim; the magic bytes are the evidence.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(decodeSignaturePng(pngDataUrl(jpeg)).ok).toBe(false);
    expect(decodeSignaturePng('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok).toBe(false);
    expect(decodeSignaturePng('javascript:alert(1)').ok).toBe(false);
  });

  it('refuses a drawing that is really an upload', () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_SIGNATURE_BYTES)]);
    expect(decodeSignaturePng(pngDataUrl(huge)).ok).toBe(false);
  });
});

describe('consentDateLabel', () => {
  it('reads in the clinic day, not the server day', () => {
    // 2026-09-25T01:00Z is still 22:00 on the 24th in São Paulo, and the term is dated
    // the day the patient signed it there.
    expect(consentDateLabel(new Date('2026-09-25T01:00:00Z'))).toBe('24 de setembro de 2026');
  });
});

describe('linkExpiresAt', () => {
  it('gives the patient a long weekend, not forever', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(linkExpiresAt(now).toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });
});
