// Sends what is due in the outbox. Run by a CronJob every ten minutes (docs/operacao.md).
//
// Deliberately a script and not a route: it is operations, it runs with the cluster's
// credentials, and it must not be reachable from the internet. It is idempotent — jobs
// move out of PENDING as they go — so a run that overlaps the previous one is safe.
//
// Usage:
//   npx tsx --tsconfig tsconfig.scripts.json scripts/dispatch-messages.ts [--limit 100] [--dry-run]
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { audit } from '../src/lib/audit';
import { prisma, withPlatformScope, withTenant } from '../src/lib/db';
import { enqueueBirthdays } from '../src/lib/message-queue';
import { sendText, whatsappConfigured } from '../src/lib/whatsapp';

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '200' },
    'dry-run': { type: 'boolean', default: false },
  },
});

/** After this many tries the message is not going to make it. */
const MAX_ATTEMPTS = 5;

async function main() {
  const limit = Number(values.limit) || 200;
  const dryRun = values['dry-run'] === true;

  if (!whatsappConfigured() && !dryRun) {
    console.log(
      'WhatsApp não configurado (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN). ' +
        'A fila continua parada, sem perder nada — configure o canal para ela andar.',
    );
    return;
  }

  const tenants = await withPlatformScope((tx) =>
    tx.tenant.findMany({ where: { active: true }, select: { id: true, name: true } }),
  );

  const now = new Date();
  for (const tenant of tenants) {
    // Birthdays are the one automation with nothing to hang off: nobody books a birthday,
    // so the queue is filled here, once a day, and the dedupe key keeps it to once.
    const birthdays = await withTenant(tenant.id, (tx) =>
      enqueueBirthdays(tx, { tenantId: tenant.id, clinicName: tenant.name, now }, now),
    );

    const due = await withTenant(tenant.id, (tx) =>
      tx.messageJob.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'asc' },
        take: limit,
      }),
    );

    let sent = 0;
    let failed = 0;

    for (const job of due) {
      if (dryRun) {
        console.log(`[dry-run] ${tenant.name} · ${job.kind} → ${job.phone}: ${job.body.slice(0, 60)}…`);
        continue;
      }

      const result = await sendText(job.phone, job.body);
      await withTenant(tenant.id, (tx) =>
        tx.messageJob.update({
          where: { id: job.id },
          data: result.ok
            ? {
                status: 'SENT',
                sentAt: new Date(),
                providerMessageId: result.providerMessageId,
                attempts: job.attempts + 1,
                error: null,
              }
            : {
                // Retryable failures stay in the queue until the attempts run out.
                status:
                  result.retryable && job.attempts + 1 < MAX_ATTEMPTS ? 'PENDING' : 'FAILED',
                attempts: job.attempts + 1,
                error: result.error.slice(0, 500),
              },
        }),
      );
      if (result.ok) sent++;
      else failed++;
    }

    if (birthdays > 0 || sent > 0 || failed > 0) {
      console.log(
        `${tenant.name}: ${birthdays} aniversário(s) na fila, ${sent} enviada(s), ${failed} falha(s)`,
      );
      if (!dryRun) {
        await audit({
          tenantId: tenant.id,
          action: 'message.sent',
          resource: 'message.dispatch',
          details: { queuedBirthdays: birthdays, sent, failed },
        });
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
