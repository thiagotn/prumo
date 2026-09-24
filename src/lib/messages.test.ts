import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BODIES,
  dedupeKey,
  dueAt,
  MESSAGE_KINDS,
  parseReply,
  renderMessage,
  toE164,
} from './messages';

describe('renderMessage', () => {
  it('fills the fields the clinic wrote', () => {
    expect(
      renderMessage('Olá, {{paciente}}. Amanhã às {{hora}} na {{clinica}}.', {
        paciente: 'Renata',
        hora: '14h',
        clinica: 'Dra. Tati Mayumi',
      }),
    ).toBe('Olá, Renata. Amanhã às 14h na Dra. Tati Mayumi.');
  });

  it('drops a field with nothing to put in it, and the punctuation around it', () => {
    // A WhatsApp message with "{{sala}}" in it is worse than one without the room.
    expect(renderMessage('Amanhã às {{hora}} ({{sala}}).', { hora: '14h' })).toBe('Amanhã às 14h.');
    // And a field that opened the sentence does not leave its full stop behind.
    expect(renderMessage('{{procedimento}}. Até lá!', {})).toBe('Até lá!');
  });

  it('leaves a name that is not a field alone, so the typo gets noticed', () => {
    expect(renderMessage('{{medico}} atende', {})).toBe('{{medico}} atende');
  });

  it('never leaves double spaces behind', () => {
    expect(renderMessage('Olá, {{paciente}} {{sala}} tudo bem?', { paciente: 'Ana' })).toBe(
      'Olá, Ana tudo bem?',
    );
  });

  it('renders every default wording without leftovers, given the full set', () => {
    const variables = {
      paciente: 'Renata Yamada',
      clinica: 'Dra. Tati Mayumi',
      data: '25/09',
      hora: '14h',
      procedimento: 'Preenchimento labial',
      sala: 'Coworking Tatuapé',
    };
    for (const kind of MESSAGE_KINDS) {
      const rendered = renderMessage(DEFAULT_BODIES[kind], variables);
      expect(rendered, kind).not.toContain('{{');
      expect(rendered.length, kind).toBeGreaterThan(20);
    }
  });
});

describe('dueAt', () => {
  // 25 September 2026, 14:00 in São Paulo.
  const appointment = new Date('2026-09-25T17:00:00Z');

  it('sends the reminder the day before, at a civilised hour', () => {
    // 10:00 in São Paulo is 13:00 UTC.
    expect(dueAt('REMINDER_24H', appointment).toISOString()).toBe('2026-09-24T13:00:00.000Z');
  });

  it('sends the preparation two days before', () => {
    expect(dueAt('PREP_48H', appointment).toISOString()).toBe('2026-09-23T13:00:00.000Z');
  });

  it('follows up the next day and asks for a return two weeks later', () => {
    expect(dueAt('FOLLOW_UP_1D', appointment).toISOString()).toBe('2026-09-26T13:00:00.000Z');
    expect(dueAt('RETURN_14D', appointment).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  it('greets on the day itself, an hour earlier', () => {
    expect(dueAt('BIRTHDAY', appointment).toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  it('sends the no-show note straight away', () => {
    expect(dueAt('NO_SHOW_POLICY', appointment)).toEqual(appointment);
  });

  it('counts days in the clinic day, not the UTC day', () => {
    // 22:00 on the 25th in São Paulo is already the 26th in UTC; the reminder still goes
    // out on the 24th.
    const lateEvening = new Date('2026-09-26T01:00:00Z');
    expect(dueAt('REMINDER_24H', lateEvening).toISOString()).toBe('2026-09-24T13:00:00.000Z');
  });
});

describe('dedupeKey', () => {
  it('is one per appointment and reason', () => {
    expect(dedupeKey('REMINDER_24H', { appointmentId: 'abc' })).toBe('reminder_24h:abc');
    expect(dedupeKey('PREP_48H', { appointmentId: 'abc' })).not.toBe(
      dedupeKey('REMINDER_24H', { appointmentId: 'abc' }),
    );
  });

  it('is one per patient and year for a birthday', () => {
    expect(dedupeKey('BIRTHDAY', { patientId: 'p1', year: 2026 })).toBe('birthday:p1:2026');
    expect(dedupeKey('BIRTHDAY', { patientId: 'p1', year: 2027 })).not.toBe(
      dedupeKey('BIRTHDAY', { patientId: 'p1', year: 2026 }),
    );
  });
});

describe('toE164', () => {
  it('formats a mobile with the country code', () => {
    expect(toE164('(11) 98765-0001')).toBe('+5511987650001');
    expect(toE164('11987650001')).toBe('+5511987650001');
  });

  it('accepts a number that already carries the country code', () => {
    expect(toE164('+55 11 98765-0001')).toBe('+5511987650001');
    expect(toE164('5511987650001')).toBe('+5511987650001');
  });

  it('adds the ninth digit to an old mobile number', () => {
    // The clinic's list is full of numbers typed before the change.
    expect(toE164('11 8765-0001')).toBe('+5511987650001');
  });

  it('leaves a landline alone', () => {
    expect(toE164('11 3456-7890')).toBe('+551134567890');
  });

  it('refuses what is not a phone number', () => {
    expect(toE164('98765-0001')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('11987650001234')).toBeNull();
  });
});

describe('parseReply', () => {
  it('reads the two instructions', () => {
    expect(parseReply('1')).toBe('confirm');
    expect(parseReply(' 2 ')).toBe('release');
    expect(parseReply('1.')).toBe('confirm');
  });

  it('treats a sentence as a message, not as a command', () => {
    // "2 pessoas vão" must not cancel an appointment nobody cancelled.
    expect(parseReply('2 pessoas vão')).toBeNull();
    expect(parseReply('confirmo')).toBeNull();
    expect(parseReply('')).toBeNull();
    expect(parseReply('12')).toBeNull();
  });
});
