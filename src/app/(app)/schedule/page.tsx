import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Agenda' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Visão Dia: grade de horas de 74px por slot, bloco com borda-esquerda de acento, slots livres tracejados e bloqueio listrado.',
  'Visão Semana: seis colunas de segunda a sábado, com o dia de hoje destacado.',
  'Visão Lista: data, hora, paciente, procedimento, sala, status, valor e forma de pagamento.',
  'Filtro por sala e status Confirmado / Aguardando / Atendido.',
  'No celular: seletor de dias e cards com “WhatsApp” e “Atender”.',
];

export default async function SchedulePage() {
  const { level } = await requireModule('schedule');

  return (
    <PendingModule
      stage={3}
      delivers="Agenda em dia, semana e lista"
      level={level}
      items={ITEMS}
    />
  );
}
