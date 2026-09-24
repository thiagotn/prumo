import type { Metadata } from 'next';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { requireSensitiveModule } from '@/lib/auth/guards';
import {
  alertsIn,
  answerLabel,
  changesBetween,
  freshnessLabel,
  isStale,
  parseAnswers,
  parseQuestions,
} from '@/lib/anamnesis';
import { currentQuestionnaire } from '@/lib/anamnesis-source';
import { withTenant } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { FillForm } from './fill-form';
import styles from './anamnesis.module.css';

export const metadata: Metadata = { title: 'Anamnese' };

export default async function AnamnesisPage({
  searchParams,
}: {
  searchParams: Promise<{
    patient?: string;
    appointment?: string;
    encounter?: string;
    fill?: string;
    saved?: string;
  }>;
}) {
  const { patient, appointment, encounter, fill, saved } = await searchParams;

  // Opening an anamnesis is access to the medical record: 2FA settled, and the access
  // written to audit_log.
  const { tenant, session, masked, level } = await requireSensitiveModule(
    'medicalRecord',
    patient ? { kind: 'anamnesis.patient', id: patient } : undefined,
  );
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  if (!patient) {
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        Escolha uma paciente em <Link href="/patients">Pacientes</Link> ou abra a ficha pela{' '}
        <Link href="/schedule">Agenda</Link> para ver ou preencher a anamnese dela.
      </p>
    );
  }

  // A guest practitioner reaches their own patients — 'own' in the matrix. Enforced here
  // and not only in the list: a patient id in the URL is not a permission.
  const ownOnly = level === 'own' && session.role === Role.PRACTITIONER;

  const data = await withTenant(tenant.id, async (tx) => {
    const record = await tx.patient.findFirst({
      where: {
        id: patient,
        ...(ownOnly ? { appointments: { some: { practitionerId: session.userId } } } : {}),
      },
      select: { id: true, name: true, clinicalAlert: true },
    });
    if (!record) return null;

    return {
      patient: record,
      questionnaire: await currentQuestionnaire(tx, tenant.id),
      history: await tx.anamnesis.findMany({
        where: { patientId: patient },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    };
  });
  // Not found, not "forbidden": a practitioner learns nothing about who exists elsewhere.
  if (!data) {
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        Paciente não encontrada nesta clínica{ownOnly ? ' entre as suas' : ''}.
      </p>
    );
  }

  const [latest, beforeThat] = data.history;
  const latestAnswers = latest ? parseAnswers(latest.answers) : {};
  const latestQuestions = latest ? parseQuestions(latest.questionsSnapshot) : [];
  const alerts = latest ? alertsIn(latestQuestions, latestAnswers) : [];

  const filling = fill === '1' || !latest;
  const backHref = appointment ? `/encounter?appointment=${appointment}` : '/patients';

  if (masked) {
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        Sessão assumida pela plataforma: o prontuário está mascarado. Liberar exige autorização
        registrada.
      </p>
    );
  }

  return (
    <div className={styles.layout}>
      <div>
        <div className="kicker">Prontuário</div>
        <h2 className={styles.title}>Anamnese de {data.patient.name}</h2>
        <p className={styles.meta}>
          {latest
            ? `${freshnessLabel(latest.createdAt)} · versão ${data.history.length} · questionário edição ${latest.templateVersion}`
            : 'Ainda não respondida.'}
          {latest && isStale(latest.createdAt) ? ' · vale perguntar de novo' : ''}
        </p>

        {saved ? (
          <p className={styles.saved} role="status">
            Anamnese salva. A anterior continua guardada como foi respondida.
          </p>
        ) : null}

        {alerts.length > 0 && !filling ? (
          <div className={styles.alerts} role="note">
            <strong>
              {alerts.length} resposta{alerts.length === 1 ? '' : 's'} que exige
              {alerts.length === 1 ? '' : 'm'} atenção antes do procedimento:
            </strong>
            <ul>
              {alerts.map((alert) => (
                <li key={alert.id}>
                  {alert.label} {alert.detail ? `— ${alert.detail}` : '— sim'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {filling ? (
          <FillForm
            patientId={data.patient.id}
            questions={data.questionnaire.questions}
            previous={latestAnswers}
            encounterId={encounter}
            appointmentId={appointment}
            cancelHref={backHref}
          />
        ) : (
          <>
            <div className={styles.answers}>
              {latestQuestions.map((question) => {
                const answer = latestAnswers[question.id] ?? null;
                const previous = beforeThat ? parseAnswers(beforeThat.answers)[question.id] : undefined;
                const changed =
                  beforeThat !== undefined &&
                  previous !== undefined &&
                  (previous.value !== answer?.value || (previous.detail ?? '') !== (answer?.detail ?? ''));
                return (
                  <div className={changed ? styles.changed : undefined} key={question.id}>
                    <div className={styles.answerLabel}>{question.label}</div>
                    <div className={styles.answerValue}>{answerLabel(question, answer)}</div>
                    {changed ? (
                      <div className={styles.hint}>
                        antes: {answerLabel(question, previous ?? null)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.actions}>
              <Link
                className="btn btn-primary touch"
                href={`/anamnesis?patient=${data.patient.id}&fill=1${appointment ? `&appointment=${appointment}` : ''}${encounter ? `&encounter=${encounter}` : ''}`}
              >
                Atualizar anamnese
              </Link>
              <Link className="btn btn-secondary touch" href={backHref}>
                Voltar
              </Link>
            </div>
          </>
        )}
      </div>

      <aside aria-label="Histórico e questionário">
        {data.patient.clinicalAlert ? (
          <div className={styles.card}>
            <div className="kicker">Alerta clínico do cadastro</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: 'var(--space-2) 0 0' }}>
              {data.patient.clinicalAlert}
            </p>
            <p className={styles.hint}>
              É a linha curta do cadastro — separada da anamnese de propósito, para saltar aos olhos
              em qualquer tela.
            </p>
          </div>
        ) : null}

        <div className={styles.card}>
          <div className="kicker">Respostas anteriores</div>
          <h2 className={styles.cardTitle}>Histórico</h2>
          {data.history.length === 0 ? (
            <p className={styles.hint}>Nenhuma anamnese respondida ainda.</p>
          ) : (
            <div>
              {data.history.map((entry, index) => {
                const questions = parseQuestions(entry.questionsSnapshot);
                const answers = parseAnswers(entry.answers);
                const previousEntry = data.history[index + 1];
                const changes = previousEntry
                  ? changesBetween(questions, parseAnswers(previousEntry.answers), answers).length
                  : 0;
                return (
                  <div className={styles.historyItem} key={entry.id}>
                    <strong>
                      {index === 0 ? 'Atual' : `Versão ${data.history.length - index}`}
                    </strong>
                    {entry.alertCount > 0 ? (
                      <span className="tag tag-outline" style={{ marginLeft: 6 }}>
                        {entry.alertCount} alerta{entry.alertCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    <br />
                    <span className={styles.historyWhen}>
                      {dateTime(entry.createdAt)}
                      {previousEntry
                        ? ` · ${changes} mudança${changes === 1 ? '' : 's'} desde a anterior`
                        : ' · primeira'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className={styles.hint}>
            Cada resposta é uma versão nova; nada é sobrescrito. O banco recusa alteração de uma
            anamnese já gravada.
          </p>
        </div>

        {session.role === Role.OWNER ? (
          <Link className="btn btn-secondary btn-block touch" href="/anamnesis/questions">
            Editar o questionário
          </Link>
        ) : null}
      </aside>
    </div>
  );
}
