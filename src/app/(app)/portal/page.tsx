import type { Metadata } from 'next';
import { AppointmentStatus } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currency, longDate } from '@/lib/format';
import { templatesFor } from '@/lib/message-queue';
import { renderMessage } from '@/lib/messages';
import { slotLabel, STATUS_LABELS, STATUS_TAG } from '@/lib/schedule';
import { answerAppointment } from './actions';
import styles from './portal.module.css';

export const metadata: Metadata = { title: 'Minha área' };

export default async function PortalPage() {
  const { tenant, session } = await requireModule('portal');
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const patientId = session.patientId;
  if (!patientId) {
    // A staff login can reach this screen if the flag is on; it has no record behind it.
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        Este acesso não está ligado a um cadastro de paciente. Se você é da equipe, use as telas da
        clínica; se é paciente, fale com a recepção para ligarem o seu acesso ao seu cadastro.
      </p>
    );
  }

  const now = new Date();
  const data = await withTenant(tenant.id, async (tx) => ({
    next: await tx.appointment.findFirst({
      where: {
        patientId,
        isBlock: false,
        startsAt: { gte: now },
        status: { in: [AppointmentStatus.WAITING, AppointmentStatus.CONFIRMED] },
      },
      orderBy: { startsAt: 'asc' },
      include: { procedure: { select: { name: true } }, room: { select: { name: true } } },
    }),
    past: await tx.appointment.findMany({
      where: { patientId, status: AppointmentStatus.ATTENDED },
      orderBy: { startsAt: 'desc' },
      take: 5,
      include: {
        procedure: { select: { name: true } },
        encounter: { include: { payment: { select: { charged: true } } } },
      },
    }),
    consents: await tx.consent.findMany({
      where: { patientId, status: 'SIGNED' },
      orderBy: { signedAt: 'desc' },
      select: { id: true, titleSnapshot: true, signedAt: true },
    }),
    templates: await templatesFor(tx, tenant.id),
  }));

  const firstName = session.name.split(/\s+/)[0] ?? session.name;
  // The preparation the clinic wrote, filled in for her own appointment.
  const prep = data.next
    ? renderMessage(data.templates.PREP_48H.body, {
        paciente: firstName,
        clinica: tenant.name,
        data: longDate(data.next.startsAt),
        hora: slotLabel(data.next.startsAt, data.next.endsAt).split('–')[0] ?? '',
        procedimento: data.next.procedure?.name ?? '',
        sala: data.next.room?.name ?? '',
      })
    : null;

  return (
    <div className={styles.page}>
      <div className="kicker">{tenant.name}</div>
      <h2 className={styles.hello}>Olá, {firstName}.</h2>

      <section className={`${styles.card} ${styles.next}`} aria-label="Próximo horário">
        <div className="kicker">Seu próximo horário</div>
        {data.next ? (
          <>
            <p className={styles.when}>
              {longDate(data.next.startsAt)}, às{' '}
              {slotLabel(data.next.startsAt, data.next.endsAt).split('–')[0]}
            </p>
            <p className={styles.where}>
              {data.next.procedure?.name ?? 'Procedimento a definir'}
              {data.next.room ? ` · ${data.next.room.name}` : ''} ·{' '}
              <span className={`tag ${STATUS_TAG[data.next.status]}`}>
                {STATUS_LABELS[data.next.status]}
              </span>
            </p>

            <div className={styles.actions}>
              {data.next.status !== AppointmentStatus.CONFIRMED ? (
                <form action={answerAppointment}>
                  <input type="hidden" name="appointmentId" value={data.next.id} />
                  <input type="hidden" name="answer" value="confirm" />
                  <button className="btn btn-primary touch" type="submit">
                    Confirmar presença
                  </button>
                </form>
              ) : null}
              <form action={answerAppointment}>
                <input type="hidden" name="appointmentId" value={data.next.id} />
                <input type="hidden" name="answer" value="release" />
                <button className="btn btn-secondary touch" type="submit">
                  Preciso reagendar
                </button>
              </form>
            </div>
            <p className={styles.note}>
              Ao pedir para reagendar, o horário é devolvido à clínica e a recepção entra em contato
              para marcar outro. Você não perde o seu histórico.
            </p>
          </>
        ) : (
          <p className={styles.where} style={{ marginTop: 'var(--space-2)' }}>
            Você não tem horário marcado. Fale com a recepção para agendar.
          </p>
        )}
      </section>

      {prep ? (
        <section className={styles.card} aria-label="Orientações de preparo">
          <div className="kicker">Antes do procedimento</div>
          <p className={styles.prep}>{prep}</p>
        </section>
      ) : null}

      <section className={styles.card} aria-label="Documentos">
        <div className="kicker">Documentos</div>
        {data.consents.length === 0 ? (
          <p className={styles.note}>
            Nenhum termo assinado ainda. Quando você assinar um, ele fica disponível aqui para
            baixar.
          </p>
        ) : (
          <ul className={styles.list}>
            {data.consents.map((consent) => (
              <li className={styles.item} key={consent.id}>
                <span>{consent.titleSnapshot}</span>
                <span className={styles.itemMeta}>
                  {consent.signedAt ? longDate(consent.signedAt) : ''}
                  <br />
                  <a href={`/portal/consents/${consent.id}/pdf`}>Baixar PDF</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-label="Atendimentos anteriores">
        <div className="kicker">Seus atendimentos</div>
        {data.past.length === 0 ? (
          <p className={styles.note}>Ainda não há atendimentos registrados.</p>
        ) : (
          <ul className={styles.list}>
            {data.past.map((appointment) => (
              <li className={styles.item} key={appointment.id}>
                <span>
                  {appointment.procedure?.name ?? 'Atendimento'}
                  <br />
                  <span className={styles.note}>{longDate(appointment.startsAt)}</span>
                </span>
                <span className={styles.itemMeta}>
                  {appointment.encounter?.payment
                    ? currency(Number(appointment.encounter.payment.charged))
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>
          O prontuário e as fotos ficam com a clínica: são dados de saúde e não saem daqui. Para uma
          cópia, fale com a recepção.
        </p>
      </section>
    </div>
  );
}
