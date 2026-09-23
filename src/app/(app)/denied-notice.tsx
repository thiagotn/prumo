import { MODULES, MODULE_DEFS, type Module } from '@/lib/modules';

/**
 * Notice shown after a permission redirect. The guard sends the user to their first
 * screen with `?denied=<module>`; here we explain what happened, without drama.
 */
export function DeniedNotice({ module }: { module: string | undefined }) {
  if (!module || !MODULES.includes(module as Module)) return null;
  const def = MODULE_DEFS[module as Module];

  return (
    <div
      role="status"
      style={{
        marginBottom: 'var(--space-6)',
        padding: 'var(--space-3)',
        border: '1px solid var(--color-accent-400)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-accent-100)',
        fontSize: 13,
        color: 'var(--color-accent-800)',
      }}
    >
      <strong>{def.title}</strong> não está disponível para o seu perfil nesta clínica. O acesso foi
      registrado no log de auditoria.
    </div>
  );
}
