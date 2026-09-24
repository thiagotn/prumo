'use client';

// One form for registering and for correcting a patient. The counter fills it with the
// patient on the phone, so only the name is required and nothing is lost when the rest
// arrives later.
import Link from 'next/link';
import { useActionState } from 'react';
import { savePatient, type PatientFormState, type PatientValues } from './actions';
import styles from './patients.module.css';

const INITIAL: PatientFormState = {};

export type PatientFormValues = PatientValues;

export function PatientForm({ values: initial }: { values: PatientFormValues }) {
  const [state, action, pending] = useActionState(savePatient, INITIAL);
  // A refused save comes back with what was typed: React clears an uncontrolled form as
  // soon as the action returns, and the counter should not have to type it all again.
  const values = state.values ?? initial;
  const editing = Boolean(values.id);

  return (
    <form action={action} className={styles.form}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.formGrid}>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="name">Nome completo</label>
          <input
            className="input"
            id="name"
            name="name"
            defaultValue={values.name}
            autoComplete="off"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="birthDate">Nascimento</label>
          <input
            className="input"
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={values.birthDate}
          />
        </div>

        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <input
            className="input"
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(11) 98765-0001"
            defaultValue={values.phone}
          />
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="document">CPF</label>
          <input
            className="input"
            id="document"
            name="document"
            inputMode="numeric"
            placeholder="000.000.000-00"
            defaultValue={values.document}
          />
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="clinicalAlert">Alerta clínico</label>
          <input
            className="input"
            id="clinicalAlert"
            name="clinicalAlert"
            placeholder="Alergia a lidocaína · uso de anticoagulante"
            defaultValue={values.clinicalAlert}
          />
          <p className={styles.formHint}>
            Uma linha curta que precisa saltar aos olhos antes de qualquer procedimento. Não é o
            prontuário.
          </p>
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="notes">Observações</label>
          <textarea
            className="input"
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values.notes}
          />
        </div>

        {editing ? (
          <label className={styles.checkbox} htmlFor="active" style={{ gridColumn: '1 / -1' }}>
            <input id="active" name="active" type="checkbox" defaultChecked={values.active} />
            <span>
              Paciente ativa
              <br />
              <span className={styles.formHint}>
                Desmarcar tira a paciente da lista de ativas. Nada é apagado: o histórico continua.
              </span>
            </span>
          </label>
        ) : (
          <input type="hidden" name="active" value="on" />
        )}
      </div>

      <div className={styles.formActions}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar paciente'}
        </button>
        <Link
          className="btn btn-secondary"
          href={values.id ? `/patients?selected=${values.id}` : '/patients'}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
