'use server';

// What the platform does with a contact request after reading it.
//
// Everything here is behind requireSuperadmin() and withPlatformScope(): those are the
// only credentials the RLS policy on `interest_leads` accepts for reading or changing a
// row. The public form that writes them opens no scope at all.
import { LeadStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireSuperadmin } from '@/lib/auth/guards';
import { withPlatformScope } from '@/lib/db';
import { LEAD_LIMITS, sanitizeMessage } from '@/lib/leads';

export type LeadFormState = { error?: string; saved?: string };

const schema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(LeadStatus),
  note: z.string().trim().max(LEAD_LIMITS.note, 'A nota ficou longa demais.').default(''),
});

export async function saveLead(
  _previous: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { session } = await requireSuperadmin('leads');

  const parsed = schema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const input = parsed.data;

  const handled = input.status !== LeadStatus.NEW;

  const changed = await withPlatformScope((tx) =>
    tx.interestLead.updateMany({
      where: { id: input.id },
      data: {
        status: input.status,
        note: sanitizeMessage(input.note) || null,
        // The CHECK on the table wants both or neither: a request marked as handled says
        // who handled it, and one put back to NEW forgets.
        handledByUserId: handled ? session.userId : null,
        handledAt: handled ? new Date() : null,
      },
    }),
  );
  if (changed.count === 0) return { error: 'Este pedido de contato não existe mais.' };

  await audit({
    tenantId: null,
    userId: session.userId,
    action: 'lead.update',
    resource: 'interestLead',
    resourceId: input.id,
    // Never the e-mail or the message: the log is proof of the change, not a second copy
    // of somebody's contact details.
    details: { status: input.status },
  });

  revalidatePath('/leads');
  return { saved: 'Atualizado.' };
}
