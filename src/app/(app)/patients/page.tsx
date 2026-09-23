import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Pacientes' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Filtros: todas, ativas, retorno vencido, sem termo assinado.',
  'Tabela com nome e tags, nascimento, telefone, último e próximo atendimento, LTV.',
  'Painel lateral da paciente: dados, alerta clínico, termo vigente, antes e depois.',
  'Acesso a prontuário e fotos grava audit_log e exige 2FA.',
];

export default async function PatientsPage() {
  const { level } = await requireModule('patients');

  return (
    <PendingModule
      stage={2}
      delivers="Cadastro de pacientes"
      level={level}
      items={ITEMS}
    />
  );
}
