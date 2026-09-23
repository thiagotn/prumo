import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { longDate } from '@/lib/format';
import styles from './patients.module.css';

export const metadata: Metadata = { title: 'Pacientes' };

/** Product copy, pt-BR. */
const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Ativas' },
  { key: 'alert', label: 'Com alerta clínico' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function age(birthDate: Date | null): string {
  if (!birthDate) return '—';
  const now = new Date();
  let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) years--;
  return `${years} anos`;
}

/** Formats a Brazilian mobile number for reading: (11) 98765-0001. */
function phone(raw: string | null): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

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
  searchParams: Promise<{ filter?: string; selected?: string; q?: string }>;
}) {
  const { tenant, level } = await requireModule('patients');
  const { filter, selected, q } = await searchParams;

  if (!tenant) {
    return <p className="card-body">Esta tela pertence a uma clínica.</p>;
  }

  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filter)
    ? (filter as FilterKey)
    : 'all';
  const search = (q ?? '').trim();

  const where: Prisma.PatientWhereInput = {
    ...(activeFilter === 'active' ? { active: true } : {}),
    ...(activeFilter === 'alert' ? { clinicalAlert: { not: null } } : {}),
    ...(search ? { OR: searchClauses(search) } : {}),
  };

  const { patients, total } = await withTenant(tenant.id, async (tx) => ({
    patients: await tx.patient.findMany({ where, orderBy: { name: 'asc' }, take: 200 }),
    total: await tx.patient.count(),
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
                    <td className="num">
                      {patient.birthDate ? longDate(patient.birthDate) : '—'}
                    </td>
                    <td className="num">{phone(patient.phone)}</td>
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
                {chosen.birthDate ? `${longDate(chosen.birthDate)} · ${age(chosen.birthDate)}` : '—'}
              </dd>

              <dt>Telefone</dt>
              <dd className="num">{phone(chosen.phone)}</dd>

              <dt>E-mail</dt>
              <dd>{chosen.email ?? '—'}</dd>

              <dt>Cadastro</dt>
              <dd className="num">{longDate(chosen.createdAt)}</dd>
            </dl>

            {chosen.notes ? (
              <p className="card-body" style={{ marginTop: 'var(--space-3)' }}>
                {chosen.notes}
              </p>
            ) : null}

            <div className={styles.locked}>
              <strong>Prontuário, anamnese e fotos</strong> entram na etapa 4, junto com a ficha de
              atendimento. Quando entrarem, abrir qualquer um deles exige 2FA e fica registrado no
              log de auditoria.
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
            O histórico de atendimentos, o termo vigente e o antes e depois aparecem aqui conforme as
            etapas 4 e 5 entrarem.
          </p>
        )}
      </aside>
    </div>
  );
}
