import type { AccessLevel } from '@/lib/rbac';

/** Product copy, pt-BR. */
const LEVEL_LABELS: Record<AccessLevel, string> = {
  full: 'acesso total',
  partial: 'acesso parcial',
  own: 'somente os próprios registros',
  none: 'sem acesso',
};

/**
 * A sober placeholder for a module still to be built. It does not fake a screen: it says
 * which stage delivers it, what already holds (permission, tenant, audit) and the current
 * role's access level — which is precisely what stage 1 proves.
 */
export function PendingModule({
  stage,
  delivers,
  level,
  items,
}: {
  stage: number;
  delivers: string;
  level: AccessLevel;
  items: string[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        maxWidth: '62em',
      }}
    >
      <div className="card">
        <div className="card-kicker">Etapa {stage} da implementação</div>
        <div className="card-title">{delivers}</div>
        <p className="card-body">
          A casca, a resolução de tenant por hostname, o perfil de acesso e a trilha de auditoria já
          valem nesta tela. O conteúdo do módulo entra na etapa {stage}.
        </p>
        <div className="card-meta">
          Seu perfil aqui: <strong>{LEVEL_LABELS[level]}</strong>
        </div>
      </div>

      <div>
        <div className="kicker">O que esta tela vai ter</div>
        <ul
          style={{
            margin: 'var(--space-3) 0 0',
            paddingLeft: '1.2em',
            fontSize: 13,
            lineHeight: 1.9,
            color: 'var(--color-neutral-700)',
          }}
        >
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
