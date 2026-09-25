import { describe, expect, it } from 'vitest';
import type { Tx } from './db';
import { enqueueBirthdays, enqueueForAppointment } from './message-queue';

/**
 * Um `tx` de mentira com o mínimo que a fila toca: os textos da clínica, a busca de
 * duplicata e a criação do job. Sem banco — o que está em teste aqui é a decisão de
 * enfileirar ou não, não o SQL (esse tem `tests/rls.test.ts`, contra o Postgres de verdade).
 */
function fakeTx() {
  const created: Array<{ kind: string; phone: string; body: string }> = [];
  const tx = {
    messageTemplate: { findMany: async () => [] },
    messageJob: {
      findFirst: async () => null,
      create: async ({ data }: { data: { kind: string; phone: string; body: string } }) => {
        created.push(data);
        return data;
      },
    },
    $queryRaw: async () => {
      throw new Error('a fila não deveria ter varrido as pacientes');
    },
  };
  return { tx: tx as unknown as Tx, created };
}

const emDezDias = new Date(Date.now() + 10 * 86_400_000);

const appointment = {
  id: 'appointment-1',
  startsAt: emDezDias,
  endsAt: new Date(emDezDias.getTime() + 3_600_000),
  patientId: 'patient-1',
  patient: { name: 'Renata Alves', phone: '11987650001', active: true },
  procedure: { name: 'Toxina botulínica' },
  room: { name: 'Sala 1' },
};

describe('a fila respeita a clínica que não usa comunicação automática', () => {
  it('não enfileira nada com a flag desligada', async () => {
    const { tx, created } = fakeTx();
    const queued = await enqueueForAppointment(
      tx,
      { tenantId: 'tenant-1', clinicName: 'Clínica sem WhatsApp', automation: false },
      appointment,
    );

    expect(queued).toBe(0);
    // O ponto: nada fica guardado esperando. Uma fila que enche para nunca sair é o que
    // vira disparo em massa no dia em que alguém liga o canal.
    expect(created).toHaveLength(0);
  });

  it('enfileira o preparo e o lembrete com a flag ligada', async () => {
    const { tx, created } = fakeTx();
    const queued = await enqueueForAppointment(
      tx,
      { tenantId: 'tenant-1', clinicName: 'Dra. Tati Mayumi', automation: true },
      appointment,
    );

    expect(queued).toBe(2);
    expect(created.map((job) => job.kind)).toEqual(['PREP_48H', 'REMINDER_24H']);
    expect(created[0]!.phone).toBe('+5511987650001');
    expect(created[0]!.body).toContain('Renata');
  });

  it('nem procura aniversariante quando a clínica não usa o módulo', async () => {
    const { tx, created } = fakeTx();
    // O $queryRaw do stub explode se for chamado: com a flag desligada, a varredura das
    // pacientes não deve nem acontecer.
    const queued = await enqueueBirthdays(
      tx,
      { tenantId: 'tenant-1', clinicName: 'Clínica sem WhatsApp', automation: false },
      new Date(),
    );

    expect(queued).toBe(0);
    expect(created).toHaveLength(0);
  });
});
