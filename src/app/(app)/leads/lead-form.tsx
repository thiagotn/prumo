'use client';

import { useActionState } from 'react';
import { LEAD_LIMITS } from '@/lib/leads';
import { saveLead, type LeadFormState } from './actions';
import styles from './leads.module.css';

const INITIAL: LeadFormState = {};

/** Situação e nota interna de um pedido de contato. */
export function LeadForm({ id, status, note }: { id: string; status: string; note: string }) {
  const [state, action, pending] = useActionState(saveLead, INITIAL);

  return (
    <form className={styles.form} action={action}>
      <input type="hidden" name="id" value={id} />

      <div className="field">
        <label htmlFor={`status-${id}`}>Situação</label>
        <select className="input" id={`status-${id}`} name="status" defaultValue={status}>
          <option value="NEW">Novo</option>
          <option value="CONTACTED">Respondido</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
      </div>

      <div className={`field ${styles.noteField}`}>
        <label htmlFor={`note-${id}`}>Nota interna</label>
        <input
          className="input"
          id={`note-${id}`}
          name="note"
          maxLength={LEAD_LIMITS.note}
          placeholder="O que ficou combinado"
          defaultValue={note}
        />
      </div>

      <button className="btn btn-secondary touch" type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </button>

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
    </form>
  );
}
