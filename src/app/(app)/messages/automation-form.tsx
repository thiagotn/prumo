'use client';

// One automation: the wording on the left, what the patient will see on the right.
import { useActionState, useState } from 'react';
import { renderMessage, type MessageKind } from '@/lib/messages';
import { saveMessageTemplate, type MessageFormState } from './actions';
import styles from './messages.module.css';

const INITIAL: MessageFormState = {};

/** A plausible appointment, so the preview reads like a real message. */
const SAMPLE = {
  paciente: 'Renata',
  data: '25/09',
  hora: '14h',
  procedimento: 'Preenchimento labial 1ml',
  sala: 'Coworking Tatuapé',
};

export function AutomationForm({
  kind,
  body,
  enabled,
  canWrite,
  clinicName,
}: {
  kind: MessageKind;
  body: string;
  enabled: boolean;
  canWrite: boolean;
  clinicName: string;
}) {
  const [state, action, pending] = useActionState(saveMessageTemplate, INITIAL);
  const [text, setText] = useState(body);

  // When the server sends a different wording — "Restaurar texto padrão" — the editor
  // follows it. Adjusting state during render rather than remounting on a key: a remount
  // would also throw away the "salva" message the save just produced.
  const [serverBody, setServerBody] = useState(body);
  if (body !== serverBody) {
    setServerBody(body);
    setText(body);
  }

  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className={styles.saved} role="status">
          {state.saved}
        </p>
      ) : null}

      <div className={styles.grid}>
        <div className="field">
          <label htmlFor={`body-${kind}`}>Texto</label>
          <textarea
            className="input"
            id={`body-${kind}`}
            name="body"
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={!canWrite}
            required
          />
          <p className={styles.hint}>
            Campos: <code>{'{{paciente}}'}</code>, <code>{'{{clinica}}'}</code>,{' '}
            <code>{'{{data}}'}</code>, <code>{'{{hora}}'}</code>, <code>{'{{procedimento}}'}</code>,{' '}
            <code>{'{{sala}}'}</code>. Um campo sem valor some do texto, junto com o espaço.
          </p>
        </div>

        <div>
          <div className="kicker">Como ela chega</div>
          <div className={styles.bubbleWrap} style={{ marginTop: 'var(--space-2)' }}>
            <div className={styles.bubble}>
              {renderMessage(text, { ...SAMPLE, clinica: clinicName })}
            </div>
          </div>
        </div>
      </div>

      {canWrite ? (
        <div className={styles.actions}>
          <label className={styles.checkbox} htmlFor={`enabled-${kind}`}>
            <input id={`enabled-${kind}`} name="enabled" type="checkbox" defaultChecked={enabled} />
            Automação ligada
          </label>
          <button className="btn btn-primary touch" type="submit" disabled={pending} style={{ fontSize: 12 }}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
