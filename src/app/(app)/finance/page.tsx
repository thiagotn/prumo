import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Financeiro e caixa' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Cinco KPIs do mês e tabela de lançamentos com cobrado, custos, imposto e taxa, lucro e margem.',
  'Margem abaixo de 28% destacada em accent-700.',
  'Card de parâmetros de precificação e card de reservas (10% recompra, 5% emergência, restante retirada).',
  'A recepção lança entrada, mas não vê custo nem margem.',
];

export default async function FinancePage() {
  const { level } = await requireModule('finance');

  return (
    <PendingModule
      stage={6}
      delivers="Financeiro, caixa e reservas"
      level={level}
      items={ITEMS}
    />
  );
}
