import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Mensagens e lembretes' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Automações: 24h antes, 48h de preparo, pós 1 dia, retorno em 14 dias, política de falta e aniversário.',
  'Status e métricas por automação, com pré-visualização no formato do WhatsApp.',
  'Resposta “1” confirma o horário; “2” devolve o horário à lista de espera.',
];

export default async function MessagesPage() {
  const { level } = await requireModule('messages');

  return (
    <PendingModule
      stage={7}
      delivers="Automações de WhatsApp"
      level={level}
      items={ITEMS}
    />
  );
}
