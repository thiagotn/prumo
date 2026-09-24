// WhatsApp automations: what each one says, when it is due, and what an answer means.
//
// Free of database and network, so the rules can be tested directly. The wording lives in
// the tenant's own row — what is here is the default the clinic starts from, and the
// arithmetic of when a message is due.
import { CLINIC_TIME_ZONE, instantAt } from './schedule';

export type MessageKind =
  | 'REMINDER_24H'
  | 'PREP_48H'
  | 'FOLLOW_UP_1D'
  | 'RETURN_14D'
  | 'NO_SHOW_POLICY'
  | 'BIRTHDAY';

/** The automations, in the order the screen lists them. */
export const MESSAGE_KINDS: MessageKind[] = [
  'REMINDER_24H',
  'PREP_48H',
  'FOLLOW_UP_1D',
  'RETURN_14D',
  'NO_SHOW_POLICY',
  'BIRTHDAY',
];

/** Product copy, pt-BR. */
export const MESSAGE_LABELS: Record<MessageKind, string> = {
  REMINDER_24H: 'Lembrete 24h antes',
  PREP_48H: 'Preparo 48h antes',
  FOLLOW_UP_1D: 'Pós-procedimento no dia seguinte',
  RETURN_14D: 'Retorno em 14 dias',
  NO_SHOW_POLICY: 'Política de falta',
  BIRTHDAY: 'Aniversário',
};

export const MESSAGE_NOTES: Record<MessageKind, string> = {
  REMINDER_24H: 'Sai no dia anterior, às 10h, para o horário do dia seguinte.',
  PREP_48H: 'Sai dois dias antes, às 10h, com o que evitar antes do procedimento.',
  FOLLOW_UP_1D: 'Sai no dia seguinte ao atendimento, às 10h.',
  RETURN_14D: 'Sai 14 dias depois do atendimento, às 10h.',
  NO_SHOW_POLICY: 'Sai quando o horário é marcado como falta.',
  BIRTHDAY: 'Sai no dia do aniversário, às 9h.',
};

/** The hour of the clinic's day when the queue goes out. */
export const SEND_HOUR = 10;
export const BIRTHDAY_SEND_HOUR = 9;

/**
 * What the clinic starts with. Deliberately plain: a reminder that reads like a person
 * wrote it gets answered, and one that reads like a system gets ignored.
 */
export const DEFAULT_BODIES: Record<MessageKind, string> = {
  REMINDER_24H:
    'Olá, {{paciente}}. Confirmando seu horário amanhã, {{data}}, às {{hora}}, na {{clinica}} ({{sala}}). {{procedimento}}.\n\nResponda 1 para confirmar ou 2 para reagendar.',
  PREP_48H:
    'Olá, {{paciente}}. Seu procedimento na {{clinica}} é {{data}}, às {{hora}}. Nas 48 horas antes, evite bebida alcoólica, anti-inflamatórios e exposição solar intensa. Qualquer dúvida, é só responder por aqui.',
  FOLLOW_UP_1D:
    'Olá, {{paciente}}. Como você está hoje, um dia depois do procedimento? Inchaço e pequenos hematomas são esperados nos primeiros dias. Se algo estiver te preocupando, me conte por aqui.',
  RETURN_14D:
    'Olá, {{paciente}}. Faz duas semanas do seu procedimento na {{clinica}} — é o momento de avaliarmos o resultado. Quer que eu reserve um horário para o seu retorno?',
  NO_SHOW_POLICY:
    'Olá, {{paciente}}. Sentimos sua falta no horário de {{data}}, às {{hora}}. O horário reservado não pôde ser oferecido a outra paciente; se precisar remarcar, é só responder por aqui.',
  BIRTHDAY:
    'Feliz aniversário, {{paciente}}! Que o seu ano seja leve. Um beijo de toda a equipe da {{clinica}}.',
};

/** What the clinic can drop into the wording. Product copy, pt-BR. */
export const MESSAGE_PLACEHOLDERS = {
  paciente: 'Nome da paciente',
  clinica: 'Nome da clínica',
  data: 'Data do horário',
  hora: 'Hora do horário',
  procedimento: 'Procedimento marcado',
  sala: 'Sala ou unidade',
} as const;

export type MessageVariables = Partial<Record<keyof typeof MESSAGE_PLACEHOLDERS, string>>;

/**
 * Fills the wording. A field with nothing to put in it disappears along with the space
 * before it — a WhatsApp message with "{{sala}}" in it is worse than one without the room.
 */
export function renderMessage(body: string, variables: MessageVariables): string {
  return body
    .replace(/\s?\(?\{\{\s*([a-zç]+)\s*\}\}\)?/gi, (whole, name: string) => {
      const key = name.toLowerCase() as keyof typeof MESSAGE_PLACEHOLDERS;
      if (!(key in MESSAGE_PLACEHOLDERS)) return whole;
      const value = variables[key];
      if (value === undefined || value === '') return '';
      // Keep whatever punctuation the clinic wrote around the field.
      return whole.replace(/\{\{\s*[a-zç]+\s*\}\}/i, value);
    })
    .replace(/ {2,}/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    // A dropped field at the start of a line leaves its punctuation orphaned: ". Até lá!"
    .replace(/^[\s.,;:]+/gm, '')
    .trim();
}

/**
 * The instant a message is due, in the clinic's timezone.
 *
 * Reminders go out at a civilised hour of the clinic's day, not at the exact hour the
 * appointment minus 24 — nobody wants a message at 06:40.
 */
export function dueAt(
  kind: MessageKind,
  reference: Date,
  timeZone = CLINIC_TIME_ZONE,
): Date {
  const day = (offset: number) => {
    const shifted = new Date(reference.getTime() + offset * 86_400_000);
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(shifted)
      .slice(0, 10);
    return key;
  };

  switch (kind) {
    case 'REMINDER_24H':
      return instantAt(day(-1), SEND_HOUR, timeZone);
    case 'PREP_48H':
      return instantAt(day(-2), SEND_HOUR, timeZone);
    case 'FOLLOW_UP_1D':
      return instantAt(day(1), SEND_HOUR, timeZone);
    case 'RETURN_14D':
      return instantAt(day(14), SEND_HOUR, timeZone);
    case 'BIRTHDAY':
      return instantAt(day(0), BIRTHDAY_SEND_HOUR, timeZone);
    case 'NO_SHOW_POLICY':
      // The one that is not scheduled: it goes out as soon as the front desk marks the
      // absence, while the patient still remembers the appointment.
      return reference;
  }
}

/** What makes a queued message unique, so the same reason never reaches a patient twice. */
export function dedupeKey(
  kind: MessageKind,
  subject: { appointmentId?: string; patientId?: string; year?: number },
): string {
  if (kind === 'BIRTHDAY') return `birthday:${subject.patientId}:${subject.year}`;
  return `${kind.toLowerCase()}:${subject.appointmentId}`;
}

/**
 * A Brazilian number in E.164, which is what the API expects.
 *
 * Mobile numbers gained a ninth digit years ago, but old records still carry eight. The
 * ninth is added rather than the number refused: the clinic's list is full of numbers
 * typed before the change.
 */
export function toE164(raw: string, countryCode = '55'): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith(countryCode) && digits.length >= 12) digits = digits.slice(countryCode.length);
  if (digits.length < 10 || digits.length > 11) return null;

  const area = digits.slice(0, 2);
  let number = digits.slice(2);
  // An eight-digit number starting with 6-9 is a mobile that predates the ninth digit.
  if (number.length === 8 && /^[6-9]/.test(number)) number = `9${number}`;
  return `+${countryCode}${area}${number}`;
}

export type Reply = 'confirm' | 'release' | null;

/**
 * What the patient's answer means.
 *
 * Only a bare "1" or "2" is an instruction. "2 pessoas vão" is a sentence, not a command,
 * and acting on it would cancel an appointment nobody cancelled.
 */
export function parseReply(text: string): Reply {
  const clean = text.trim().replace(/[.!]$/, '');
  if (clean === '1') return 'confirm';
  if (clean === '2') return 'release';
  return null;
}

/** Product copy, pt-BR. */
export const REPLY_LABELS: Record<Exclude<Reply, null>, string> = {
  confirm: 'Confirmou o horário',
  release: 'Pediu para reagendar',
};
