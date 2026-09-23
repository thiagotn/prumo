import type { Metadata } from 'next';
import { requireSensitiveModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Ficha de atendimento' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Cinco passos: anamnese, procedimento, fotos, fechamento e termo.',
  'Procedimento: produto, marca, lote, validade, volume, técnica e evolução — com baixa do lote no estoque.',
  'Fotos em quatro enquadramentos padronizados, com guia fantasma da foto anterior.',
  'Fechamento: forma de pagamento, decomposição de custos, lucro e margem.',
  'Lateral com preço sugerido à vista e parcelado, e a linha do tempo da paciente.',
];

export default async function EncounterPage() {
  const { level } = await requireSensitiveModule('encounter');

  return (
    <PendingModule
      stage={4}
      delivers="Ficha de atendimento com estoque e fechamento"
      level={level}
      items={ITEMS}
    />
  );
}
