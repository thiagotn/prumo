'use client';

// The signing link, shown once. Asking again mints another and retires this one — only
// the HMAC is stored, so there is nothing to read back.
import { useActionState, useState } from 'react';
import { createSigningLink, type LinkState } from './actions';
import styles from './consents.module.css';

const INITIAL: LinkState = {};

export function LinkBox({ consentId, hasLink }: { consentId: string; hasLink: boolean }) {
  const [state, action, pending] = useActionState(createSigningLink, INITIAL);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
    } catch {
      // Clipboard permission denied, or an insecure origin: the link is on screen to be
      // selected by hand, so this is not worth an error message.
      setCopied(false);
    }
  };

  return (
    <div className={styles.linkBox}>
      <strong>Assinatura por link</strong>
      <br />
      {hasLink
        ? 'Já existe um link em circulação. Gerar outro invalida o anterior — é assim que se cancela um link enviado por engano.'
        : 'Gere o link e envie para a paciente. Ele vale por três dias.'}

      {state.error ? (
        <p className="form-error" role="alert" style={{ marginTop: 'var(--space-2)' }}>
          {state.error}
        </p>
      ) : null}

      {state.link ? (
        <>
          <code className={styles.linkValue}>{state.link}</code>
          <button className="btn btn-secondary touch" type="button" onClick={copy} style={{ fontSize: 12 }}>
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
          <p className={styles.formHint}>
            Este link aparece uma vez só. Se fechar a tela sem copiar, gere outro.
          </p>
        </>
      ) : (
        <form action={action} style={{ marginTop: 'var(--space-2)' }}>
          <input type="hidden" name="consentId" value={consentId} />
          <button className="btn btn-secondary touch" type="submit" disabled={pending} style={{ fontSize: 12 }}>
            {pending ? 'Gerando…' : hasLink ? 'Gerar novo link' : 'Gerar link de assinatura'}
          </button>
        </form>
      )}
    </div>
  );
}
