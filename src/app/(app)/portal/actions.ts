'use server';

// What the patient herself can do: confirm the horário she was given, or say she cannot
// come. Nothing else — this is her own record, and the only rows she may touch are her
// own next appointment.
import { AppointmentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { cancelPendingFor } from '@/lib/message-queue';

const schema = z.object({
  appointmentId: z.string().uuid(),
  answer: z.enum(['confirm', 'release']),
});

export async function answerAppointment(formData: FormData): Promise<void> {
  const { tenant, session } = await requireModule('portal');
  if (!tenant || !session.patientId) return;

  const parsed = schema.safeParse({
    appointmentId: formData.get('appointmentId'),
    answer: formData.get('answer'),
  });
  if (!parsed.success) return;
  const { appointmentId, answer } = parsed.data;

  await withTenant(tenant.id, async (tx) => {
    // Scoped to her own record and to a booking still open: the id in the form is not
    // enough on its own.
    const { count } = await tx.appointment.updateMany({
      where: {
        id: appointmentId,
        patientId: session.patientId,
        status: { in: [AppointmentStatus.WAITING, AppointmentStatus.CONFIRMED] },
        startsAt: { gte: new Date() },
      },
      data: {
        status: answer === 'confirm' ? AppointmentStatus.CONFIRMED : AppointmentStatus.CANCELLED,
      },
    });
    if (count === 0) return;
    if (answer === 'release') await cancelPendingFor(tx, appointmentId);
  });

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'message.reply',
    resource: 'portal.appointment',
    resourceId: appointmentId,
    details: { answer },
  });

  revalidatePath('/portal');
  revalidatePath('/schedule');
}
