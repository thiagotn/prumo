'use client';

import { useActionState } from 'react';
import { LEAD_LIMITS } from '@/lib/leads';
import { registerInterest, type InterestState } from './actions';
import styles from './interest.module.css';

const INITIAL: InterestState = {};
const EMPTY = { name: '', email: '', phone: '', clinic: '', message: '' };

// Declared here rather than imported from lead-stamp.ts: that module is server-only, and a
// client component should not name it even in a type position.
type Stamp = { issuedAt: string; signature: string };

export function InterestForm({ stamp }: { stamp: Stamp }) {
  const [state, action, pending] = useActionState(registerInterest, INITIAL);
  const values = state.values ?? EMPTY;

  if (state.sent) {
    return (
      <div className={styles.done} role="status">
        <div className="kicker">Recebido</div>
        <h2 className={styles.doneTitle}>Obrigado pelo interesse.</h2>
        <p className={styles.doneText}>
          Vamos responder no e-mail que você deixou. Se preferir falar por telefone, diga isso na
          resposta.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} action={action} noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="issuedAt" value={stamp.issuedAt} />
      <input type="hidden" name="signature" value={stamp.signature} />

      {/* Not a field: it is the trap. A person never sees it, so anything in it is a robot. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor="website">Site</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="name">Seu nome</label>
        <input
          className="input"
          id="name"
          name="name"
          maxLength={LEAD_LIMITS.name}
          autoComplete="name"
          defaultValue={values.name}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LEAD_LIMITS.email}
          autoComplete="email"
          defaultValue={values.email}
          required
        />
      </div>

      <div className={styles.row}>
        <div className="field">
          <label htmlFor="phone">Telefone ou WhatsApp</label>
          <input
            className="input"
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={LEAD_LIMITS.phone}
            autoComplete="tel"
            defaultValue={values.phone}
          />
        </div>

        <div className="field">
          <label htmlFor="clinic">Clínica</label>
          <input
            className="input"
            id="clinic"
            name="clinic"
            maxLength={LEAD_LIMITS.clinic}
            defaultValue={values.clinic}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="message">O que você precisa</label>
        <textarea
          className="input"
          id="message"
          name="message"
          rows={5}
          maxLength={LEAD_LIMITS.message}
          placeholder="Quantas profissionais atendem, o que você usa hoje, o que gostaria de resolver."
          defaultValue={values.message}
        />
      </div>

      <button className="btn btn-primary btn-block touch" type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Quero saber mais'}
      </button>

      <p className={styles.note}>
        Usamos seus dados apenas para responder este contato. Nada é compartilhado com terceiros, e
        você pode pedir a exclusão a qualquer momento.
      </p>
    </form>
  );
}
