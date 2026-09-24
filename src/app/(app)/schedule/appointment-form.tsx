'use client';

// Booking a slot. The choices are ordered the way the front desk says them out loud:
// who, when, how long, where, what.
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createAppointment, type AppointmentFormState } from './actions';
import styles from './schedule.module.css';

const INITIAL: AppointmentFormState = {};

export type PatientOption = { id: string; name: string; clinicalAlert: string | null };
export type ProcedureOption = {
  id: string;
  name: string;
  durationMinutes: number;
  products: Array<{ id: string; brand: string }>;
};
export type RoomOption = { id: string; name: string };
export type PractitionerOption = { id: string; name: string };

export type AppointmentFormProps = {
  patients: PatientOption[];
  procedures: ProcedureOption[];
  rooms: RoomOption[];
  practitioners: PractitionerOption[];
  defaults: { day: string; time: string; patientId: string; roomId: string };
  /** Time options, `HH:MM`, from the clinic's opening to its last bookable half hour. */
  times: string[];
};

const DURATIONS = [30, 45, 60, 90, 120, 180];

export function AppointmentForm(props: AppointmentFormProps) {
  const [state, action, pending] = useActionState(createAppointment, INITIAL);
  const [patientId, setPatientId] = useState(props.defaults.patientId);
  const [procedureId, setProcedureId] = useState(props.procedures[0]?.id ?? '');
  const [duration, setDuration] = useState(props.procedures[0]?.durationMinutes ?? 60);

  // A refused booking comes back with what was chosen: React clears an uncontrolled form
  // as soon as the action returns, and a clash only needs the hour changed.
  const sent = state.values;
  const day = sent?.day || props.defaults.day;
  const time = sent?.time || props.defaults.time;
  const roomId = sent?.roomId || props.defaults.roomId;
  const status = sent?.status || 'WAITING';
  const notes = sent?.notes ?? '';

  const patient = props.patients.find((p) => p.id === patientId);
  const procedure = props.procedures.find((p) => p.id === procedureId);

  // Choosing the procedure sets the chair time — the front desk overrides it when this
  // particular patient is known to take longer.
  const chooseProcedure = (id: string) => {
    setProcedureId(id);
    const chosen = props.procedures.find((p) => p.id === id);
    if (chosen) setDuration(chosen.durationMinutes);
  };

  return (
    <form action={action} className={styles.form}>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.formGrid}>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="patientId">Paciente</label>
          <select
            className="input"
            id="patientId"
            name="patientId"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            required
          >
            <option value="">Escolha a paciente</option>
            {props.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {props.patients.length === 0 ? (
            <p className={styles.formHint}>
              Nenhuma paciente cadastrada ainda. <Link href="/patients/new">Cadastre a primeira</Link>.
            </p>
          ) : null}
        </div>

        {patient?.clinicalAlert ? (
          <p className={styles.alert} role="note" style={{ gridColumn: '1 / -1' }}>
            <strong>Alerta clínico:</strong> {patient.clinicalAlert}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="day">Dia</label>
          <input
            className="input"
            id="day"
            name="day"
            type="date"
            defaultValue={day}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="time">Horário</label>
          <select className="input" id="time" name="time" defaultValue={time} required>
            {props.times.map((t) => (
              <option key={t} value={t}>
                {t.replace(':', 'h')}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="procedureId">Procedimento</label>
          <select
            className="input"
            id="procedureId"
            name="procedureId"
            value={procedureId}
            onChange={(e) => chooseProcedure(e.target.value)}
          >
            <option value="">A definir</option>
            {props.procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="durationMinutes">Duração</label>
          <select
            className="input"
            id="durationMinutes"
            name="durationMinutes"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[...new Set([...DURATIONS, duration])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes >= 60
                    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60) : ''}`
                    : `${minutes} min`}
                </option>
              ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="roomId">Sala</label>
          <select
            className="input"
            id="roomId"
            name="roomId"
            defaultValue={roomId}
            required
          >
            {props.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className={styles.formHint}>
            Uma sala atende uma paciente por vez — o sistema recusa dois agendamentos no mesmo
            horário.
          </p>
        </div>

        <div className="field">
          <label htmlFor="productId">Produto previsto</label>
          <select className="input" id="productId" name="productId" defaultValue="">
            <option value="">A definir na ficha</option>
            {(procedure?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.brand}
              </option>
            ))}
          </select>
        </div>

        {props.practitioners.length > 1 ? (
          <div className="field">
            <label htmlFor="practitionerId">Profissional</label>
            <select className="input" id="practitionerId" name="practitionerId" defaultValue="">
              <option value="">A definir</option>
              {props.practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="status">Situação</label>
          <select className="input" id="status" name="status" defaultValue={status}>
            <option value="WAITING">Aguardando</option>
            <option value="CONFIRMED">Confirmado</option>
          </select>
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="notes">Observações</label>
          <input
            className="input"
            id="notes"
            name="notes"
            placeholder="Retorno · primeira aplicação · veio por indicação"
            defaultValue={notes}
          />
        </div>
      </div>

      <div className={styles.formActions}>
        <button className="btn btn-primary" type="submit" disabled={pending || props.patients.length === 0}>
          {pending ? 'Agendando…' : 'Agendar'}
        </button>
        <Link className="btn btn-secondary" href={`/schedule?day=${day}`}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
