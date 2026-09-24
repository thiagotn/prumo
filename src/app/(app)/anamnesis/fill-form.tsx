'use client';

// Answering the questionnaire. Each question shows what she answered last time, so the
// practitioner asks "mudou alguma coisa?" instead of starting from zero.
import Link from 'next/link';
import { useActionState } from 'react';
import { answerLabel, type Answers, type Question } from '@/lib/anamnesis';
import { fillAnamnesis, type AnamnesisState } from './actions';
import styles from './anamnesis.module.css';

const INITIAL: AnamnesisState = {};

export type FillFormProps = {
  patientId: string;
  questions: Question[];
  /** What she answered last time, prefilled — the usual case is "nothing changed". */
  previous: Answers;
  encounterId?: string;
  appointmentId?: string;
  cancelHref: string;
};

export function FillForm(props: FillFormProps) {
  const [state, action, pending] = useActionState(fillAnamnesis, INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="patientId" value={props.patientId} />
      {props.encounterId ? <input type="hidden" name="encounterId" value={props.encounterId} /> : null}
      {props.appointmentId ? (
        <input type="hidden" name="appointmentId" value={props.appointmentId} />
      ) : null}

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      {props.questions.map((question) => {
        const before = props.previous[question.id] ?? null;
        const answeredYes = before?.value === true;

        return (
          <div className={styles.question} key={question.id}>
            <span className={styles.questionLabel} id={`label-${question.id}`}>
              {question.label}
            </span>

            {question.type === 'boolean' ? (
              <>
                <div className={styles.choices} role="radiogroup" aria-labelledby={`label-${question.id}`}>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={`q:${question.id}`}
                      value="sim"
                      defaultChecked={before?.value === true}
                    />
                    Sim
                  </label>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={`q:${question.id}`}
                      value="nao"
                      defaultChecked={before?.value === false}
                    />
                    Não
                  </label>
                  {before ? (
                    <span className={styles.previous}>
                      da última vez: {answerLabel(question, before)}
                    </span>
                  ) : null}
                </div>

                {question.detailLabel ? (
                  <div className={`field ${styles.detail}`}>
                    <label htmlFor={`d-${question.id}`}>{question.detailLabel}</label>
                    <input
                      className="input"
                      id={`d-${question.id}`}
                      name={`d:${question.id}`}
                      defaultValue={answeredYes ? (before?.detail ?? '') : ''}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <textarea
                  className="input"
                  name={`q:${question.id}`}
                  rows={3}
                  aria-labelledby={`label-${question.id}`}
                  defaultValue={typeof before?.value === 'string' ? before.value : ''}
                />
                {before && typeof before.value === 'string' ? (
                  <p className={styles.hint}>da última vez: {before.value}</p>
                ) : null}
              </>
            )}
          </div>
        );
      })}

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar anamnese'}
        </button>
        <Link className="btn btn-secondary touch" href={props.cancelHref}>
          Cancelar
        </Link>
      </div>
      <p className={styles.hint}>
        Salvar grava uma versão nova. A anterior continua guardada como foi respondida — nada é
        sobrescrito.
      </p>
    </form>
  );
}
