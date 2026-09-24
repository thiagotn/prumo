// The anamnesis: the questions the clinic asks before injecting anything, and what an
// answer means.
//
// Free of database and React so the rules can be tested directly. Two ideas carry the
// weight. The questions are copied into each filling, because an answer is meaningless
// next to a question that was edited afterwards. And an answer flagged as an alert is
// what the practitioner must not miss — allergy, anticoagulant, pregnancy.

export type QuestionType = 'boolean' | 'text';

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  /** For a boolean: what to ask when the answer is yes. */
  detailLabel?: string;
  /** A "sim" here is the line that has to reach the practitioner. */
  alert?: boolean;
};

export type Answer = { value: boolean | string; detail?: string };
export type Answers = Record<string, Answer>;

/**
 * What a clinic that injects starts with. Written to be edited: every clinic has its own
 * questions, and this is a starting point, not a protocol.
 */
export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'gestante',
    label: 'Está grávida, amamentando ou planejando engravidar?',
    type: 'boolean',
    alert: true,
  },
  {
    id: 'alergia',
    label: 'Tem alergia a algum medicamento, anestésico ou cosmético?',
    type: 'boolean',
    detailLabel: 'A quê?',
    alert: true,
  },
  {
    id: 'anticoagulante',
    label: 'Usa anticoagulante ou antiagregante (AAS, varfarina, clopidogrel)?',
    type: 'boolean',
    detailLabel: 'Qual e desde quando?',
    alert: true,
  },
  {
    id: 'autoimune',
    label: 'Tem doença autoimune ou neuromuscular diagnosticada?',
    type: 'boolean',
    detailLabel: 'Qual?',
    alert: true,
  },
  {
    id: 'isotretinoina',
    label: 'Usou isotretinoína (Roacutan) nos últimos seis meses?',
    type: 'boolean',
    alert: true,
  },
  {
    id: 'herpes',
    label: 'Tem histórico de herpes labial?',
    type: 'boolean',
    alert: true,
  },
  {
    id: 'queloide',
    label: 'Tem histórico de cicatriz hipertrófica ou queloide?',
    type: 'boolean',
    detailLabel: 'Onde?',
    alert: true,
  },
  {
    id: 'medicamento',
    label: 'Faz uso contínuo de algum medicamento?',
    type: 'boolean',
    detailLabel: 'Quais?',
    alert: true,
  },
  {
    id: 'procedimentos',
    label: 'Já fez preenchimento, toxina botulínica ou bioestimulador?',
    type: 'boolean',
    detailLabel: 'O quê, quando e onde?',
  },
  {
    id: 'condicao',
    label: 'Tem alguma condição de saúde em acompanhamento?',
    type: 'text',
  },
  {
    id: 'observacoes',
    label: 'Observações',
    type: 'text',
  },
];

/** Reads a stored questions snapshot back, refusing anything that is not one. */
export function parseQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Question =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Question).id === 'string' &&
      typeof (item as Question).label === 'string' &&
      ((item as Question).type === 'boolean' || (item as Question).type === 'text'),
  );
}

export function parseAnswers(value: unknown): Answers {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const answers: Answers = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const answer = raw as Answer;
    if (typeof answer.value !== 'boolean' && typeof answer.value !== 'string') continue;
    answers[id] = {
      value: answer.value,
      ...(typeof answer.detail === 'string' && answer.detail ? { detail: answer.detail } : {}),
    };
  }
  return answers;
}

/**
 * Keeps only what the questions asked for, and normalises it.
 *
 * A form can send anything; what is stored has to correspond to the questionnaire, or the
 * record stops being readable next to it.
 */
export function normalizeAnswers(questions: Question[], answers: Answers): Answers {
  const clean: Answers = {};
  for (const question of questions) {
    const given = answers[question.id];
    if (!given) continue;

    if (question.type === 'boolean') {
      if (typeof given.value !== 'boolean') continue;
      clean[question.id] = {
        value: given.value,
        // The detail belongs to a "sim": kept on a "não" it would read as a contradiction.
        ...(given.value && given.detail?.trim()
          ? { detail: given.detail.trim().slice(0, 500) }
          : {}),
      };
      continue;
    }

    // A boolean where a text was asked is a malformed submission, not an answer of
    // "true": storing it would invent something the patient never wrote.
    if (typeof given.value !== 'string') continue;
    const text = given.value.trim();
    if (text) clean[question.id] = { value: text.slice(0, 2000) };
  }
  return clean;
}

export type Alert = { id: string; label: string; detail?: string };

/** The answers the practitioner has to see before touching anyone. */
export function alertsIn(questions: Question[], answers: Answers): Alert[] {
  return questions
    .filter((question) => question.alert && answers[question.id]?.value === true)
    .map((question) => ({
      id: question.id,
      label: question.label,
      ...(answers[question.id]?.detail ? { detail: answers[question.id]!.detail } : {}),
    }));
}

/** True when nothing was answered — an empty form is not an anamnesis. */
export function isEmpty(answers: Answers): boolean {
  return Object.keys(answers).length === 0;
}

export type Change = {
  id: string;
  label: string;
  before: Answer | null;
  after: Answer | null;
};

/**
 * What changed between two fillings, so the ficha can show the answer beside the previous
 * one instead of asking the practitioner to remember it.
 */
export function changesBetween(
  questions: Question[],
  previous: Answers,
  current: Answers,
): Change[] {
  const changes: Change[] = [];
  const ids = new Set([...questions.map((q) => q.id), ...Object.keys(previous), ...Object.keys(current)]);

  for (const id of ids) {
    const before = previous[id] ?? null;
    const after = current[id] ?? null;
    if (before?.value === after?.value && (before?.detail ?? '') === (after?.detail ?? '')) continue;
    changes.push({
      id,
      label: questions.find((q) => q.id === id)?.label ?? id,
      before,
      after,
    });
  }
  return changes;
}

/** Product copy, pt-BR. */
export function answerLabel(question: Question | undefined, answer: Answer | null): string {
  if (!answer) return 'sem resposta';
  if (typeof answer.value === 'boolean') {
    const base = answer.value ? 'Sim' : 'Não';
    return answer.detail ? `${base} — ${answer.detail}` : base;
  }
  return String(answer.value);
}

/** How old an anamnesis is, in the words the clinic uses. */
export function freshnessLabel(filledAt: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - filledAt.getTime()) / 86_400_000);
  if (days <= 0) return 'preenchida hoje';
  if (days === 1) return 'preenchida ontem';
  if (days < 30) return `preenchida há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'preenchida há 1 mês';
  if (months < 12) return `preenchida há ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'preenchida há 1 ano' : `preenchida há ${years} anos`;
}

/** Above this, the ficha suggests asking again. Not a rule, a nudge. */
export const STALE_AFTER_DAYS = 180;

export function isStale(filledAt: Date, now = new Date()): boolean {
  return now.getTime() - filledAt.getTime() > STALE_AFTER_DAYS * 86_400_000;
}
