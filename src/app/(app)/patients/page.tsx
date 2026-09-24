import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma, Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { longDate } from '@/lib/format';
import { ageLabel, formatBirthDate, formatCpf, formatPhone } from '@/lib/patient';
import { canAccess, canWrite } from '@/lib/rbac';
import { WriteDeniedNotice } from '../denied-notice';
import styles from './patients.module.css';

export const metadata: Metadata = { title: 'Pacientes' };

/** Product copy, pt-BR. */
const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Ativas' },
  { key: 'alert', label: 'Com alerta clínico' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/**
 * Search clauses for a term. The phone clause is only added when the term actually has
 * digits: `contains: ''` matches every row that has a phone at all, which silently turns
 * a search by name into "list everything".
 */
function searchClauses(search: string): Prisma.PatientWhereInput[] {
  const clauses: Prisma.PatientWhereInput[] = [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ];
  const digits = search.replace(/\D/g, '');
  if (digits.length >= 3) clauses.push({ phone: { contains: digits } });
  return clauses;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    selected?: string;
    q?: string;
    denied?: string;
    saved?: string;
  }>;
}) {
  const { tenant, session, level } = await requireModule('patients');
  const { filter, selected, q, denied, saved } = await searchParams;

  if (!tenant) {
    return <p className="card-body">Esta tela pertence a uma clínica.</p>;
  }

  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filter)
    ? (filter as FilterKey)
    : 'all';
  const search = (q ?? '').trim();
  const mayWrite = canWrite(session.role, 'patients');

  // A guest practitioner reaches only their own patients — the matrix says 'own', and
  // this is where that is enforced, not by hiding anything.
  const ownOnly = level === 'own' && session.role === Role.PRACTITIONER;

  const where: Prisma.PatientWhereInput = {
    ...(activeFilter === 'active' ? { active: true } : {}),
    ...(activeFilter === 'alert' ? { clinicalAlert: { not: null } } : {}),
    ...(search ? { OR: searchClauses(search) } : {}),
    ...(ownOnly ? { appointments: { some: { practitionerId: session.userId } } } : {}),
  };

  const { patients, total, consent } = await withTenant(tenant.id, async (tx) => ({
    patients: await tx.patient.findMany({ where, orderBy: { name: 'asc' }, take: 200 }),
    total: await tx.patient.count({
      where: ownOnly ? { appointments: { some: { practitionerId: session.userId } } } : {},
    }),
    // The term in force for the patient on the panel: the most recent one she signed.
    consent: selected
      ? await tx.consent.findFirst({
          where: { patientId: selected, status: 'SIGNED' },
          orderBy: { signedAt: 'desc' },
          select: { id: true, titleSnapshot: true, signedAt: true },
        })
      : null,
  }));

  const chosen = selected ? patients.find((p) => p.id === selected) : undefined;

  const href = (next: Partial<{ filter: string; selected: string; q: string }>) => {
    const sp = new URLSearchParams();
    const merged = { filter: activeFilter, q: search, selected: selected ?? '', ...next };
    if (merged.filter && merged.filter !== 'all') sp.set('filter', merged.filter);
    if (merged.q) sp.set('q', merged.q);
    if (merged.selected) sp.set('selected', merged.selected);
    const query = sp.toString();
    return query ? `/patients?${query}` : '/patients';
  };

  return (
    <div className={styles.layout}>
      <div>
        <WriteDeniedNotice denied={denied} what="Cadastrar e corrigir pacientes" />
        {saved ? (
          <p className={styles.saved} role="status">
            Cadastro salvo.
          </p>
        ) : null}

        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ filter: f.key, selected: '' })}
              className={`btn ${f.key === activeFilter ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12 }}
            >
              {f.label}
            </Link>
          ))}
          <form action="/patients" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {activeFilter !== 'all' ? <input type="hidden" name="filter" value={activeFilter} /> : null}
            <input
              className="input"
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome, telefone ou e-mail"
              style={{ minWidth: 240 }}
              aria-label="Buscar paciente"
            />
            <button className="btn btn-secondary" type="submit" style={{ fontSize: 12 }}>
              Buscar
            </button>
          </form>
          <span className={styles.count}>
            {patients.length} de {total} paciente{total === 1 ? '' : 's'}
          </span>
          {mayWrite ? (
            <Link className="btn btn-primary touch" href="/patients/new" style={{ fontSize: 12 }}>
              Nova paciente
            </Link>
          ) : null}
        </div>

        <div className={styles.tableWrap}>
          {patients.length === 0 ? (
            <p className={styles.empty}>
              {search || activeFilter !== 'all'
                ? 'Nenhuma paciente com esses filtros.'
                : 'Nenhuma paciente cadastrada ainda.'}
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Nascimento</th>
                  <th>Telefone</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr
                    key={patient.id}
                    className={`${styles.row} ${patient.id === selected ? styles.rowSelected : ''}`}
                  >
                    <td>
                      <Link className={styles.name} href={href({ selected: patient.id })}>
                        {patient.name}
                        {patient.clinicalAlert ? (
                          <span className="tag tag-outline" title={patient.clinicalAlert}>
                            alerta
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="num">{formatBirthDate(patient.birthDate)}</td>
                    <td className="num">{formatPhone(patient.phone)}</td>
                    <td>
                      <span className={`tag ${patient.active ? 'tag-neutral' : 'tag-outline'}`}>
                        {patient.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside className={styles.panel} aria-label="Detalhes da paciente">
        {chosen ? (
          <>
            <div className="kicker">Paciente</div>
            <h2 className={styles.panelName}>{chosen.name}</h2>

            {chosen.clinicalAlert ? (
              <p className={styles.alert} role="note">
                <strong>Alerta clínico:</strong> {chosen.clinicalAlert}
              </p>
            ) : null}

            <dl className={styles.definitions}>
              <dt>Nascimento</dt>
              <dd className="num">
                {chosen.birthDate
                  ? `${formatBirthDate(chosen.birthDate)} · ${ageLabel(chosen.birthDate)}`
                  : '—'}
              </dd>

              <dt>Telefone</dt>
              <dd className="num">{formatPhone(chosen.phone)}</dd>

              <dt>E-mail</dt>
              <dd>{chosen.email ?? '—'}</dd>

              <dt>CPF</dt>
              <dd className="num">{formatCpf(chosen.document)}</dd>

              <dt>Cadastro</dt>
              <dd className="num">{longDate(chosen.createdAt)}</dd>
            </dl>

            {chosen.notes ? (
              <p className="card-body" style={{ marginTop: 'var(--space-3)' }}>
                {chosen.notes}
              </p>
            ) : null}

            <div className={styles.locked} style={{ borderStyle: 'solid' }}>
              <strong>Termo vigente</strong>
              <br />
              {consent ? (
                <>
                  <Link href={`/consents/${consent.id}`}>{consent.titleSnapshot}</Link>
                  {consent.signedAt ? ` · assinado em ${longDate(consent.signedAt)}` : ''}
                </>
              ) : (
                <>
                  Nenhum termo assinado.{' '}
                  {mayWrite ? (
                    <Link href={`/consents/new?patient=${chosen.id}`}>Emitir um</Link>
                  ) : null}
                </>
              )}
            </div>

            {mayWrite ? (
              <div className={styles.formActions}>
                <Link
                  className="btn btn-secondary touch"
                  href={`/patients/${chosen.id}/edit`}
                  style={{ fontSize: 12 }}
                >
                  Editar cadastro
                </Link>
                <Link
                  className="btn btn-primary touch"
                  href={`/schedule/new?patient=${chosen.id}`}
                  style={{ fontSize: 12 }}
                >
                  Agendar
                </Link>
              </div>
            ) : null}

            {canAccess(session.role, 'medicalRecord') ? (
              <Link
                className="btn btn-secondary btn-block touch"
                href={`/anamnesis?patient=${chosen.id}`}
                style={{ fontSize: 12, marginTop: 'var(--space-3)' }}
              >
                Ver anamnese
              </Link>
            ) : null}

            <div className={styles.locked}>
              <strong>Prontuário, anamnese e fotos</strong> exigem 2FA e cada acesso fica registrado
              no log de auditoria. A ficha do dia abre pela agenda.
              {level === 'own' ? (
                <>
                  <br />
                  <br />
                  Seu perfil alcança apenas as próprias pacientes.
                </>
              ) : null}
            </div>
          </>
        ) : (
          <p className={styles.panelEmpty}>
            Escolha uma paciente na lista para ver os dados dela.
            <br />
            <br />
            O antes e depois aparece aqui conforme as fotos do atendimento forem entrando.
          </p>
        )}
      </aside>
    </div>
  );
}
