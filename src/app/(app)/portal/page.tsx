import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Minha área' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Próximo horário com Confirmar e Reagendar.',
  'Orientações de preparo antes do procedimento.',
  'Documentos: termos assinados e recibos.',
];

export default async function PortalPage() {
  const { level } = await requireModule('portal');

  return (
    <PendingModule
      stage={7}
      delivers="Portal da paciente"
      level={level}
      items={ITEMS}
    />
  );
}
