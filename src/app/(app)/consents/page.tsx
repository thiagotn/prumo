import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Termos de consentimento' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Modelos versionados: uma versão nova nunca sobrescreve a anterior.',
  'Assinatura em tela ou por link enviado à paciente.',
  'PDF guarda a versão assinada com hash, IP e horário.',
  'Pendências com “Reenviar link”.',
];

export default async function ConsentsPage() {
  const { level } = await requireModule('consents');

  return (
    <PendingModule
      stage={5}
      delivers="Termos com assinatura e PDF"
      level={level}
      items={ITEMS}
    />
  );
}
