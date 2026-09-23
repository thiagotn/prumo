import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Relatórios' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Barras de seis meses: faturamento em contorno, lucro preenchido.',
  'Mix por linha de procedimento.',
  'Guia de margem com as faixas da aba “Orientação” da planilha.',
  'Exportar CSV e PDF.',
];

export default async function ReportsPage() {
  const { level } = await requireModule('reports');

  return (
    <PendingModule
      stage={6}
      delivers="Relatórios e exportação para o contador"
      level={level}
      items={ITEMS}
    />
  );
}
