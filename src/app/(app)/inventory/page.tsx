import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Estoque de insumos' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Tabela: produto, procedimento, unidade, custo, rendimento, custo por atendimento, quantidade, lote e validade.',
  'Status OK / Baixo / Vence / Repor.',
  'Entrada de nota e baixa automática ao fechar o atendimento.',
  'Catálogo inicial vem das abas “Materiais” e “Salas” da planilha (etapa 2).',
];

export default async function InventoryPage() {
  const { level } = await requireModule('inventory');

  return (
    <PendingModule
      stage={4}
      delivers="Estoque por lote com baixa automática"
      level={level}
      items={ITEMS}
    />
  );
}
