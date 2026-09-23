import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { PendingModule } from '../pending-module';

export const metadata: Metadata = { title: 'Configurações da instância' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Identidade: nome, subtítulo, domínio, remetente, cor de acento e logo, com prévia ao vivo do login.',
  'A validação de contraste da cor (mínimo 3:1 contra #f3f2f2) já está implementada e testada em src/lib/color.ts.',
  'Operação: expediente, duração padrão, antecedência e política de falta.',
  'Feature flags por tenant e matriz de permissões por perfil.',
];

export default async function SettingsPage() {
  const { level } = await requireModule('settings');

  return (
    <PendingModule
      stage={2}
      delivers="Identidade, operação e permissões"
      level={level}
      items={ITEMS}
    />
  );
}
