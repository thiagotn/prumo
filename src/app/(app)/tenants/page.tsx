import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Clínicas na plataforma' };

/** Product copy, pt-BR. */
const ITEMS = [
  'KPIs: clínicas ativas, MRR, atendimentos e churn.',
  'Tabela de clínicas com plano, usuários, módulos e situação de cobrança.',
  '“Entrar como”: abre a instância com faixa de sessão assumida, em log, e prontuário mascarado salvo autorização.',
];

export default async function TenantsPage() {
  const { level } = await requireModule('tenants');

  return (
    <PendingModule
      stage={8}
      delivers="Painel da revenda"
      level={level}
      items={ITEMS}
    />
  );
}
