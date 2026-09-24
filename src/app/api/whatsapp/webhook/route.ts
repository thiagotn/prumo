// What the patient answers.
//
// One webhook per clinic, on the clinic's own hostname — the tenant is resolved the same
// way every other request resolves it. The signature is checked before anything is read:
// without it, whoever finds this URL could confirm and cancel appointments.
import { AppointmentStatus } from '@prisma/client';
import { audit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { parseReply, REPLY_LABELS } from '@/lib/messages';
import { currentTenant } from '@/lib/tenant';
import { parseInbound, verifyWebhookSignature, whatsappConfig } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/** Meta's subscription handshake: echo the challenge when the token matches. */
export async function GET(request: Request) {
  const config = whatsappConfig();
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (!config?.verifyToken || mode !== 'subscribe' || token !== config.verifyToken) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(challenge ?? '', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(request: Request) {
  const tenant = await currentTenant();
  if (!tenant || !tenant.active) return new Response('Not found', { status: 404 });

  // The raw body, byte for byte: re-serialising the JSON would change a character
  // somewhere and the signature would never match again.
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get('x-hub-signature-256'))) {
    await audit({
      tenantId: tenant.id,
      action: 'access.denied',
      resource: 'whatsapp.webhook',
      details: { reason: 'bad_signature' },
    });
    return new Response('Forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const inbound = parseInbound(payload);
  let handled = 0;

  for (const message of inbound) {
    const action = parseReply(message.text);
    // The last digits, so the stored number matches whether or not it carries the
    // country code or the ninth digit.
    const tail = message.from.replace(/\D/g, '').slice(-8);

    const result = await withTenant(tenant.id, async (tx) => {
      if (message.providerMessageId) {
        const seen = await tx.messageReply.findUnique({
          where: { providerMessageId: message.providerMessageId },
          select: { id: true },
        });
        // Meta retries a webhook it did not get an answer to; acting twice would cancel
        // an appointment the patient only cancelled once.
        if (seen) return 'duplicate' as const;
      }

      const patient = tail
        ? await tx.patient.findFirst({
            where: { phone: { endsWith: tail }, active: true },
            select: { id: true },
          })
        : null;

      // The next booking still open: what a "1" or a "2" is about.
      const appointment = patient
        ? await tx.appointment.findFirst({
            where: {
              patientId: patient.id,
              startsAt: { gte: new Date() },
              status: { in: [AppointmentStatus.WAITING, AppointmentStatus.CONFIRMED] },
            },
            orderBy: { startsAt: 'asc' },
            select: { id: true },
          })
        : null;

      if (action && appointment) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: action === 'confirm' ? AppointmentStatus.CONFIRMED : AppointmentStatus.CANCELLED,
          },
        });
        if (action === 'release') {
          await tx.messageJob.updateMany({
            where: { appointmentId: appointment.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
        }
      }

      await tx.messageReply.create({
        data: {
          tenantId: tenant.id,
          patientId: patient?.id ?? null,
          appointmentId: appointment?.id ?? null,
          phone: message.from,
          text: message.text.slice(0, 1000),
          action: action && appointment ? action : null,
          providerMessageId: message.providerMessageId,
        },
      });
      return action && appointment ? ('acted' as const) : ('recorded' as const);
    });

    if (result === 'acted') {
      handled++;
      await audit({
        tenantId: tenant.id,
        action: 'message.reply',
        resource: 'appointment',
        details: { action: action ? REPLY_LABELS[action] : null },
      });
    }
  }

  // Always 200 once the signature checks out: a non-2xx makes Meta retry the whole batch,
  // including the messages already recorded.
  return new Response(JSON.stringify({ received: inbound.length, handled }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
