import { describe, expect, it } from 'vitest';
import {
  alertsIn,
  answerLabel,
  changesBetween,
  DEFAULT_QUESTIONS,
  freshnessLabel,
  isEmpty,
  isStale,
  normalizeAnswers,
  parseAnswers,
  parseQuestions,
  type Question,
} from './anamnesis';

const questions: Question[] = [
  { id: 'gestante', label: 'Está grávida?', type: 'boolean', alert: true },
  { id: 'alergia', label: 'Tem alergia?', type: 'boolean', detailLabel: 'A quê?', alert: true },
  { id: 'procedimentos', label: 'Já fez antes?', type: 'boolean' },
  { id: 'observacoes', label: 'Observações', type: 'text' },
];

describe('the default questionnaire', () => {
  it('asks what has to be asked before injecting', () => {
    const ids = DEFAULT_QUESTIONS.map((q) => q.id);
    for (const expected of ['gestante', 'alergia', 'anticoagulante', 'isotretinoina']) {
      expect(ids).toContain(expected);
    }
  });

  it('marks as alert the answers that change what the practitioner does', () => {
    const alerts = DEFAULT_QUESTIONS.filter((q) => q.alert).map((q) => q.id);
    expect(alerts).toContain('gestante');
    expect(alerts).toContain('anticoagulante');
    // An aesthetic history is context, not an alarm.
    expect(alerts).not.toContain('procedimentos');
    expect(alerts).not.toContain('observacoes');
  });

  it('has an id per question, with no repeats', () => {
    const ids = DEFAULT_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('normalizeAnswers', () => {
  it('keeps only what the questionnaire asked', () => {
    const clean = normalizeAnswers(questions, {
      gestante: { value: false },
      inventada: { value: true },
    });
    expect(Object.keys(clean)).toEqual(['gestante']);
  });

  it('keeps the detail of a "sim" and drops it from a "não"', () => {
    // A detail kept on a "não" would read as a contradiction in the record.
    const clean = normalizeAnswers(questions, {
      alergia: { value: true, detail: '  dipirona  ' },
      gestante: { value: false, detail: 'sobra de antes' },
    });
    expect(clean.alergia).toEqual({ value: true, detail: 'dipirona' });
    expect(clean.gestante).toEqual({ value: false });
  });

  it('refuses a text where a yes/no was asked, and the reverse', () => {
    const clean = normalizeAnswers(questions, {
      gestante: { value: 'talvez' },
      observacoes: { value: true },
    });
    expect(clean).toEqual({});
  });

  it('drops an empty text instead of storing a blank answer', () => {
    expect(normalizeAnswers(questions, { observacoes: { value: '   ' } })).toEqual({});
    expect(isEmpty(normalizeAnswers(questions, {}))).toBe(true);
  });
});

describe('alertsIn', () => {
  it('lists the yes answers that matter, with their detail', () => {
    const alerts = alertsIn(questions, {
      gestante: { value: true },
      alergia: { value: true, detail: 'lidocaína' },
      procedimentos: { value: true },
    });
    expect(alerts.map((a) => a.id)).toEqual(['gestante', 'alergia']);
    expect(alerts[1]!.detail).toBe('lidocaína');
  });

  it('is empty when every answer is a no', () => {
    expect(alertsIn(questions, { gestante: { value: false }, alergia: { value: false } })).toEqual([]);
  });
});

describe('changesBetween', () => {
  it('shows what moved since the last time', () => {
    const changes = changesBetween(
      questions,
      { gestante: { value: false }, alergia: { value: false } },
      { gestante: { value: true }, alergia: { value: false } },
    );
    expect(changes.map((c) => c.id)).toEqual(['gestante']);
    expect(changes[0]!.before).toEqual({ value: false });
    expect(changes[0]!.after).toEqual({ value: true });
  });

  it('notices a detail that changed even with the same yes', () => {
    const changes = changesBetween(
      questions,
      { alergia: { value: true, detail: 'dipirona' } },
      { alergia: { value: true, detail: 'dipirona e lidocaína' } },
    );
    expect(changes).toHaveLength(1);
  });

  it('notices a question that was answered now and was not before', () => {
    const changes = changesBetween(questions, {}, { gestante: { value: false } });
    expect(changes[0]!.before).toBeNull();
  });

  it('is empty between two identical fillings', () => {
    const answers = { gestante: { value: false }, observacoes: { value: 'nada' } };
    expect(changesBetween(questions, answers, answers)).toEqual([]);
  });
});

describe('parseQuestions and parseAnswers', () => {
  it('reads back what was stored', () => {
    expect(parseQuestions(JSON.parse(JSON.stringify(questions)))).toHaveLength(4);
    expect(parseAnswers({ gestante: { value: true, detail: 'x' } })).toEqual({
      gestante: { value: true, detail: 'x' },
    });
  });

  it('survives a column holding something it should not', () => {
    expect(parseQuestions(null)).toEqual([]);
    expect(parseQuestions('nope')).toEqual([]);
    expect(parseQuestions([{ id: 'x' }])).toEqual([]);
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers([1, 2])).toEqual({});
    expect(parseAnswers({ a: { value: { deep: true } } })).toEqual({});
  });
});

describe('answerLabel', () => {
  it('reads a yes with its detail, and a plain no', () => {
    expect(answerLabel(questions[1], { value: true, detail: 'dipirona' })).toBe('Sim — dipirona');
    expect(answerLabel(questions[0], { value: false })).toBe('Não');
    expect(answerLabel(questions[3], { value: 'nada a relatar' })).toBe('nada a relatar');
    expect(answerLabel(questions[0], null)).toBe('sem resposta');
  });
});

describe('freshness', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('says how old the anamnesis is in the words the clinic uses', () => {
    expect(freshnessLabel(new Date('2026-09-24T09:00:00Z'), now)).toBe('preenchida hoje');
    expect(freshnessLabel(new Date('2026-09-23T09:00:00Z'), now)).toBe('preenchida ontem');
    expect(freshnessLabel(new Date('2026-09-10T12:00:00Z'), now)).toBe('preenchida há 14 dias');
    expect(freshnessLabel(new Date('2026-06-24T12:00:00Z'), now)).toBe('preenchida há 3 meses');
    expect(freshnessLabel(new Date('2025-06-24T12:00:00Z'), now)).toBe('preenchida há 1 ano');
  });

  it('nudges when it is older than six months', () => {
    expect(isStale(new Date('2026-09-01T12:00:00Z'), now)).toBe(false);
    expect(isStale(new Date('2025-09-01T12:00:00Z'), now)).toBe(true);
  });
});
