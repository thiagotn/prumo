'use client';

// Writing an edition of a term. Saving never overwrites: it publishes a new edition and
// the previous one stays behind whatever was signed under it.
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { CONSENT_PLACEHOLDERS } from '@/lib/consent';
import { saveTemplate, type ConsentFormState } from './actions';
import styles from './consents.module.css';

const INITIAL: ConsentFormState = {};

export type TemplateFormProps = {
  procedures: Array<{ id: string; name: string }>;
  values: { slug: string; title: string; body: string; procedureId: string };
  /** The edition this one will become. 1 when the term is new. */
  nextVersion: number;
};

export function TemplateForm(props: TemplateFormProps) {
  const [state, action, pending] = useActionState(saveTemplate, INITIAL);
  const values = { ...props.values, ...state.values };
  const [body, setBody] = useState(values.body);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="slug" value={values.slug} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="title">Título do termo</label>
        <input
          className="input"
          id="title"
          name="title"
          defaultValue={values.title}
          placeholder="Termo de consentimento — preenchimento labial"
          required
        />
      </div>

      <div className="field" style={{ marginTop: 'var(--space-3)' }}>
        <label htmlFor="procedureId">Procedimento (opcional)</label>
        <select
          className="input"
          id="procedureId"
          name="procedureId"
          defaultValue={values.procedureId}
        >
          <option value="">Qualquer procedimento</option>
          {props.procedures.map((procedure) => (
            <option key={procedure.id} value={procedure.id}>
              {procedure.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-3)' }}>
        <label htmlFor="body">Texto</label>
        <textarea
          className="input"
          id="body"
          name="body"
          rows={16}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
        <p className={styles.formHint}>
          Uma linha em branco separa parágrafos. Estes campos são preenchidos na hora de emitir:{' '}
          {Object.entries(CONSENT_PLACEHOLDERS).map(([key, label], index, all) => (
            <span key={key}>
              <code>{`{{${key}}}`}</code> ({label.toLowerCase()})
              {index < all.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
      </div>

      <div className={styles.formActions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending
            ? 'Publicando…'
            : props.nextVersion === 1
              ? 'Publicar termo'
              : `Publicar edição ${props.nextVersion}`}
        </button>
        <Link className="btn btn-secondary touch" href="/consents">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
