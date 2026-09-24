'use client';

// Writing an edition of the questionnaire. Saving publishes the next edition; what was
// already answered stays attached to the questions that were asked at the time.
import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { Question } from '@/lib/anamnesis';
import { saveQuestionnaire, type AnamnesisState } from '../actions';
import styles from '../anamnesis.module.css';

const INITIAL: AnamnesisState = {};

/** A blank row, so the doctor can add a question without leaving the screen. */
const EMPTY: Question = { id: '', label: '', type: 'boolean' };

export function QuestionsForm({
  questions,
  nextVersion,
}: {
  questions: Question[];
  nextVersion: number;
}) {
  const [state, action, pending] = useActionState(saveQuestionnaire, INITIAL);
  const [rows, setRows] = useState<Question[]>([...questions, EMPTY]);

  return (
    <form action={action}>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      {rows.map((question, index) => (
        <div className={styles.question} key={`${question.id || 'nova'}-${index}`}>
          <input type="hidden" name="id" value={question.id} />

          <div className="field">
            <label htmlFor={`label-${index}`}>Pergunta {index + 1}</label>
            <input
              className="input"
              id={`label-${index}`}
              name="label"
              defaultValue={question.label}
              placeholder="Deixe em branco para remover esta pergunta"
            />
          </div>

          <div className={styles.choices} style={{ marginTop: 'var(--space-2)' }}>
            <label className={styles.choice}>
              <input
                type="radio"
                name={`type-${index}`}
                value="boolean"
                defaultChecked={question.type === 'boolean'}
                onChange={() =>
                  setRows((current) =>
                    current.map((row, i) => (i === index ? { ...row, type: 'boolean' } : row)),
                  )
                }
              />
              Sim ou não
            </label>
            <label className={styles.choice}>
              <input
                type="radio"
                name={`type-${index}`}
                value="text"
                defaultChecked={question.type === 'text'}
                onChange={() =>
                  setRows((current) =>
                    current.map((row, i) => (i === index ? { ...row, type: 'text' } : row)),
                  )
                }
              />
              Texto livre
            </label>
            <label className={styles.choice}>
              <input type="checkbox" name="alert" defaultChecked={question.alert === true} />
              Um “sim” aqui é alerta
            </label>
          </div>

          {/* The action reads type and detail positionally, so every row sends both. */}
          <input type="hidden" name="type" value={rows[index]?.type ?? question.type} />

          {(rows[index]?.type ?? question.type) === 'boolean' ? (
            <div className={`field ${styles.detail}`}>
              <label htmlFor={`detail-${index}`}>Pergunta de detalhe, quando a resposta for sim</label>
              <input
                className="input"
                id={`detail-${index}`}
                name="detailLabel"
                defaultValue={question.detailLabel ?? ''}
                placeholder="A quê? Qual? Desde quando?"
              />
            </div>
          ) : (
            <input type="hidden" name="detailLabel" value="" />
          )}
        </div>
      ))}

      <div className={styles.actions}>
        <button
          className="btn btn-secondary touch"
          type="button"
          onClick={() => setRows((current) => [...current, EMPTY])}
        >
          Mais uma pergunta
        </button>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Publicando…' : `Publicar edição ${nextVersion}`}
        </button>
        <Link className="btn btn-ghost touch" href="/patients">
          Cancelar
        </Link>
      </div>
      <p className={styles.hint}>
        Uma pergunta com o texto em branco sai do questionário. O que já foi respondido continua
        com as perguntas de quando foi respondido.
      </p>
    </form>
  );
}
