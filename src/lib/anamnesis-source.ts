// The questionnaire in force, read from the database.
//
// Not in the actions file: everything exported from a "use server" module becomes an
// endpoint, and a function that takes a transaction client has no business being one.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { DEFAULT_QUESTIONS, parseQuestions, type Question } from './anamnesis';
import type { Tx } from './db';

export type Questionnaire = { id: string; version: number; questions: Question[] };

/**
 * The edition in force, creating the first one on demand.
 *
 * A clinic that never opened the screen still has an anamnesis to fill: the default is a
 * starting point, and the doctor's own wording becomes edition 2 when she saves it.
 */
export async function currentQuestionnaire(tx: Tx, tenantId: string): Promise<Questionnaire> {
  const existing = await tx.anamnesisTemplate.findFirst({ where: { tenantId, current: true } });
  if (existing) {
    return {
      id: existing.id,
      version: existing.version,
      questions: parseQuestions(existing.questions),
    };
  }

  // Next version, not version 1: a clinic can have editions on file with none in force
  // (an edition retired, a restore gone half way), and version is unique per clinic.
  const latest = await tx.anamnesisTemplate.findFirst({
    where: { tenantId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const created = await tx.anamnesisTemplate.create({
    data: {
      tenantId,
      questions: DEFAULT_QUESTIONS as unknown as Prisma.InputJsonValue,
      version: (latest?.version ?? 0) + 1,
      current: true,
    },
  });
  return { id: created.id, version: created.version, questions: DEFAULT_QUESTIONS };
}
