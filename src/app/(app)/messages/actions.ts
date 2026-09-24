'use server';

// The wording of the automations. Editing one changes what goes out from now on; what is
// already in the queue was rendered when it was queued and is not rewritten — the patient
// gets the message the clinic meant to send on the day it was queued.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { DEFAULT_BODIES, MESSAGE_KINDS, type MessageKind } from '@/lib/messages';

export type MessageFormState = { error?: string; saved?: string };

const schema = z.object({
  kind: z.enum(MESSAGE_KINDS as [MessageKind, ...MessageKind[]]),
  body: z
    .string()
    .trim()
    .min(10, 'A mensagem está curta demais.')
    .max(1000, 'O WhatsApp corta mensagens muito longas — encurte um pouco.'),
  enabled: z.boolean(),
});

export async function saveMessageTemplate(
  _previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const { tenant, session } = await requireModuleWrite('messages');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const parsed = schema.safeParse({
    kind: formData.get('kind'),
    body: formData.get('body'),
    enabled: formData.get('enabled') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { kind, body, enabled } = parsed.data;

  await withTenant(tenant.id, (tx) =>
    tx.messageTemplate.upsert({
      where: { tenantId_kind: { tenantId: tenant.id, kind } },
      update: { body, enabled },
      create: { tenantId: tenant.id, kind, body, enabled },
    }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'messageTemplate',
    resourceId: kind,
    details: { enabled },
  });

  revalidatePath('/messages');
  return { saved: enabled ? 'Automação salva e ligada.' : 'Automação salva e desligada.' };
}

/** Puts the wording back to what the system ships with. */
export async function resetMessageTemplate(formData: FormData): Promise<void> {
  const { tenant, session } = await requireModuleWrite('messages');
  if (!tenant) return;

  const parsed = z.enum(MESSAGE_KINDS as [MessageKind, ...MessageKind[]]).safeParse(formData.get('kind'));
  if (!parsed.success) return;
  const kind = parsed.data;

  await withTenant(tenant.id, (tx) =>
    tx.messageTemplate.upsert({
      where: { tenantId_kind: { tenantId: tenant.id, kind } },
      update: { body: DEFAULT_BODIES[kind] },
      create: { tenantId: tenant.id, kind, body: DEFAULT_BODIES[kind] },
    }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'messageTemplate.reset',
    resourceId: kind,
  });

  revalidatePath('/messages');
}
