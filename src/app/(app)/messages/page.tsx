import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageStatus } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { templatesFor } from '@/lib/message-queue';
import {
  MESSAGE_KINDS,
  MESSAGE_LABELS,
  MESSAGE_NOTES,
  REPLY_LABELS,
  type MessageKind,
} from '@/lib/messages';
import { canWrite } from '@/lib/rbac';
import { whatsappConfigured } from '@/lib/whatsapp';
import { WriteDeniedNotice } from '../denied-notice';
import { resetMessageTemplate } from './actions';
import { AutomationForm } from './automation-form';
import styles from './messages.module.css';

export const metadata: Metadata = { title: 'Mensagens e lembretes' };

/** How far back the counters look. */
const WINDOW_DAYS = 30;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { tenant, session } = await requireModule('messages');
  const { denied } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const mayWrite = canWrite(session.role, 'messages');
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const { templates, counts, queue, replies } = await withTenant(tenant.id, async (tx) => ({
    templates: await templatesFor(tx, tenant.id),
    counts: await tx.messageJob.groupBy({
      by: ['kind', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    queue: await tx.messageJob.findMany({
      where: { status: MessageStatus.PENDING },
      orderBy: { scheduledFor: 'asc' },
      take: 8,
      include: { patient: { select: { name: true } } },
    }),
    replies: await tx.messageReply.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 8,
    }),
  }));

  const metricsFor = (kind: MessageKind) => {
    const rows = counts.filter((row) => row.kind === kind);
    const of = (status: MessageStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;
    return { sent: of('SENT'), pending: of('PENDING'), failed: of('FAILED') };
  };

  const channelOn = whatsappConfigured();

  return (
    <div>
      <WriteDeniedNotice denied={denied} what="Editar as automações" />

      <div className={`${styles.channel} ${channelOn ? '' : styles.channelOff}`} role="status">
        {channelOn ? (
          <>
            <strong>Canal conectado.</strong> As mensagens saem no horário de cada automação.
          </>
        ) : (
          <>
            <strong>WhatsApp ainda não conectado.</strong> As automações continuam enchendo a fila e
            nada se perde — assim que o canal for configurado, o que estiver na hora sai. Quem
            conecta é quem cuida da infraestrutura.
          </>
        )}
      </div>

      <div className={styles.columns}>
        <div>
          {MESSAGE_KINDS.map((kind) => {
            const metrics = metricsFor(kind);
            return (
              <section className={styles.automation} key={kind}>
                <div className={styles.automationHead}>
                  <h2 className={styles.automationTitle}>{MESSAGE_LABELS[kind]}</h2>
                  <span className={`tag ${templates[kind].enabled ? 'tag-accent' : 'tag-neutral'}`}>
                    {templates[kind].enabled ? 'Ligada' : 'Desligada'}
                  </span>
                  <span className={styles.metrics}>
                    <span>{metrics.sent} enviadas</span>
                    <span>{metrics.pending} na fila</span>
                    {metrics.failed > 0 ? <span>{metrics.failed} com falha</span> : null}
                  </span>
                </div>
                <p className={styles.automationNote}>{MESSAGE_NOTES[kind]}</p>

                <AutomationForm
                  kind={kind}
                  body={templates[kind].body}
                  enabled={templates[kind].enabled}
                  canWrite={mayWrite}
                  clinicName={tenant.name}
                />

                {mayWrite ? (
                  <form action={resetMessageTemplate}>
                    <input type="hidden" name="kind" value={kind} />
                    <button className="btn btn-ghost" type="submit" style={{ fontSize: 11 }}>
                      Restaurar texto padrão
                    </button>
                  </form>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside aria-label="Fila e respostas">
          <div className={styles.card}>
            <div className="kicker">Próximas a sair</div>
            <h2 className={styles.cardTitle}>Fila</h2>
            {queue.length === 0 ? (
              <p className={styles.hint}>
                Nada na fila. As mensagens entram quando um horário é marcado ou um atendimento é
                fechado.
              </p>
            ) : (
              <div>
                {queue.map((job) => (
                  <div className={styles.queueItem} key={job.id}>
                    <strong>{job.patient.name}</strong> · {MESSAGE_LABELS[job.kind as MessageKind]}
                    <br />
                    <span className={styles.queueWhen}>{dateTime(job.scheduledFor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className="kicker">O que elas respondem</div>
            <h2 className={styles.cardTitle}>Respostas</h2>
            {replies.length === 0 ? (
              <p className={styles.hint}>
                Nenhuma resposta ainda. <strong>1</strong> confirma o horário e <strong>2</strong>{' '}
                devolve o horário para a clínica remarcar.
              </p>
            ) : (
              <div>
                {replies.map((reply) => (
                  <div className={styles.queueItem} key={reply.id}>
                    “{reply.text.slice(0, 80)}”
                    <br />
                    <span className={styles.queueWhen}>
                      {dateTime(reply.receivedAt)}
                      {reply.action
                        ? ` · ${REPLY_LABELS[reply.action as 'confirm' | 'release']}`
                        : ' · sem ação automática'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className={styles.hint}>
            Os horários e as faltas são marcados na <Link href="/schedule">Agenda</Link>, na visão
            Lista. É de lá que saem o lembrete, a confirmação e a política de falta.
          </p>
        </aside>
      </div>
    </div>
  );
}
