'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { issueConsent, type ConsentFormState } from './actions';
import styles from './consents.module.css';

const INITIAL: ConsentFormState = {};

export type IssueFormProps = {
  templates: Array<{ id: string; title: string; version: number }>;
  patients: Array<{ id: string; name: string }>;
  defaults: { templateId: string; patientId: string; appointmentId: string };
};

export function IssueForm(props: IssueFormProps) {
  const [state, action, pending] = useActionState(issueConsent, INITIAL);
  const [templateId, setTemplateId] = useState(
    props.defaults.templateId || (props.templates[0]?.id ?? ''),
  );
  const patientId = state.values?.patientId || props.defaults.patientId;

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="appointmentId" value={props.defaults.appointmentId} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="templateId">Termo</label>
        <select
          className="input"
          id="templateId"
          name="templateId"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          required
        >
          <option value="">Escolha o termo</option>
          {props.templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title} (edição {template.version})
            </option>
          ))}
        </select>
        <p className={styles.formHint}>
          O texto é copiado para o termo da paciente agora. Editar o modelo depois não muda o que
          ela assinou.
          {props.defaults.appointmentId ? null : (
            <>
              {' '}
              Emitido fora de um atendimento, o campo do procedimento sai como uma linha em branco,
              para preencher à mão.
            </>
          )}
        </p>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-3)' }}>
        <label htmlFor="patientId">Paciente</label>
        <select className="input" id="patientId" name="patientId" defaultValue={patientId} required>
          <option value="">Escolha a paciente</option>
          {props.patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formActions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Emitindo…' : 'Emitir termo'}
        </button>
        <Link className="btn btn-secondary touch" href="/consents">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
