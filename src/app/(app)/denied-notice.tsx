import { MODULES, MODULE_DEFS, type Module } from '@/lib/modules';

/** The sober notice both variants share: accent stroke, no alarm red. */
const NOTICE_STYLE: React.CSSProperties = {
  marginBottom: 'var(--space-6)',
  padding: 'var(--space-3)',
  border: '1px solid var(--color-accent-400)',
  borderLeft: '3px solid var(--color-accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-accent-100)',
  fontSize: 13,
  color: 'var(--color-accent-800)',
};

/**
 * Notice shown after a permission redirect. The guard sends the user to their first
 * screen with `?denied=<module>`; here we explain what happened, without drama.
 */
export function DeniedNotice({ module }: { module: string | undefined }) {
  if (!module || !MODULES.includes(module as Module)) return null;
  const def = MODULE_DEFS[module as Module];

  return (
    <div role="status" style={NOTICE_STYLE}>
      <strong>{def.title}</strong> não está disponível para o seu perfil nesta clínica. O acesso foi
      registrado no log de auditoria.
    </div>
  );
}

/**
 * Notice after a denied CHANGE (`?denied=write`). Different from the one above on
 * purpose: the person can open this screen — what their profile does not do is write
 * to it.
 */
export function WriteDeniedNotice({
  denied,
  what,
  code = 'write',
  by = 'da recepção ou da doutora',
}: {
  denied: string | undefined;
  /** What was refused, as the sentence's subject: "Cadastrar e corrigir pacientes". */
  what: string;
  /** Which refusal this notice answers: `write` from requireModuleWrite, `owner` from requireOwnerOf. */
  code?: 'write' | 'owner';
  /** Whose job it is, as the sentence's predicate. */
  by?: string;
}) {
  if (denied !== code) return null;

  return (
    <div role="status" style={NOTICE_STYLE}>
      <strong>{what}</strong> é {by}. Seu perfil abre esta tela para consulta. A tentativa ficou
      registrada no log de auditoria.
    </div>
  );
}
