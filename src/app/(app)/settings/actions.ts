'use server';

// Settings actions. Everything here is owner-only, enforced by requireModule('settings'),
// and every change lands in the audit log.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { validateAccentColor } from '@/lib/color';
import { withTenant } from '@/lib/db';
import { DEFAULT_FLAGS, readFlags, type Flags } from '@/lib/flags';

export type SettingsState = { error?: string; saved?: string };

const identitySchema = z.object({
  name: z.string().trim().min(2, 'O nome da clínica precisa ter ao menos 2 caracteres.'),
  subtitle: z.string().trim().max(120, 'O subtítulo ficou longo demais.').optional(),
  monogram: z.string().trim().min(1, 'Informe o monograma.').max(3, 'O monograma tem no máximo 3 letras.'),
  defaultUnit: z.string().trim().max(80).optional(),
  accentColor: z.string().trim(),
});

export async function saveIdentity(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { tenant, session } = await requireModule('settings');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const parsed = identitySchema.safeParse({
    name: formData.get('name'),
    subtitle: formData.get('subtitle'),
    monogram: formData.get('monogram'),
    defaultUnit: formData.get('defaultUnit'),
    accentColor: formData.get('accentColor'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  // The same contrast rule the seed and the onboarding script apply: below 3:1 the
  // primary button's outline disappears into the paper.
  const color = validateAccentColor(parsed.data.accentColor);
  if (!color.ok) return { error: color.error };

  await withTenant(tenant.id, (tx) =>
    tx.tenant.update({
      where: { id: tenant.id },
      data: {
        name: parsed.data.name,
        subtitle: parsed.data.subtitle || null,
        monogram: parsed.data.monogram.toUpperCase(),
        defaultUnit: parsed.data.defaultUnit || null,
        accentColor: color.hex,
      },
    }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'identity',
    details: { accentColor: color.hex, contrast: Number(color.contrast.toFixed(2)) },
  });

  revalidatePath('/settings');
  return { saved: 'Identidade salva. A cor nova já vale em toda a instância.' };
}

const percent = (label: string) =>
  z.coerce
    .number({ message: `Informe ${label} como número.` })
    .min(0, `${label} não pode ser negativo.`)
    .max(100, `${label} não pode passar de 100%.`);

const pricingSchema = z.object({
  taxRate: percent('os impostos'),
  cardFeeUpfront: percent('a taxa à vista'),
  cardFeeInstallment: percent('a taxa parcelada'),
  defaultMargin: percent('a margem'),
  fixedMonthlyCosts: z.coerce.number({ message: 'Informe os custos fixos como número.' }).min(0),
  expectedAppointments: z.coerce
    .number({ message: 'Informe os atendimentos como número.' })
    .int('Atendimentos por mês precisa ser inteiro.')
    .min(1, 'Informe ao menos 1 atendimento por mês.'),
});

export async function savePricingParams(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { tenant, session } = await requireModule('settings');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const parsed = pricingSchema.safeParse({
    taxRate: formData.get('taxRate'),
    cardFeeUpfront: formData.get('cardFeeUpfront'),
    cardFeeInstallment: formData.get('cardFeeInstallment'),
    defaultMargin: formData.get('defaultMargin'),
    fixedMonthlyCosts: formData.get('fixedMonthlyCosts'),
    expectedAppointments: formData.get('expectedAppointments'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const d = parsed.data;
  // The form collects percentages; everything below the boundary stores fractions.
  const taxRate = d.taxRate / 100;
  const feeInstallment = d.cardFeeInstallment / 100;
  const margin = d.defaultMargin / 100;

  // Guard the divisor before saving. Past 100% combined there is no price that yields
  // the margin, and the quote would come out negative or infinite — better refused here,
  // where the person can see which number is wrong.
  if (taxRate + feeInstallment + margin >= 1) {
    return {
      error: `Impostos, taxa parcelada e margem somam ${((taxRate + feeInstallment + margin) * 100).toFixed(1)}%. Precisam ficar abaixo de 100%, senão não existe preço que feche essa margem.`,
    };
  }

  // A new row supersedes the old one; nothing is overwritten, so an appointment priced
  // last month can still be explained with the parameters of last month.
  await withTenant(tenant.id, (tx) =>
    tx.pricingParams.create({
      data: {
        tenantId: tenant.id,
        taxRate: taxRate.toFixed(4),
        cardFeeUpfront: (d.cardFeeUpfront / 100).toFixed(4),
        cardFeeInstallment: feeInstallment.toFixed(4),
        defaultMargin: margin.toFixed(4),
        fixedMonthlyCosts: d.fixedMonthlyCosts.toFixed(2),
        expectedAppointments: d.expectedAppointments,
      },
    }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'pricing_params',
    details: { taxRate, margin, expectedAppointments: d.expectedAppointments },
  });

  revalidatePath('/settings');
  return {
    saved: `Parâmetros salvos. Rateio por atendimento: R$ ${(d.fixedMonthlyCosts / d.expectedAppointments).toFixed(2).replace('.', ',')}.`,
  };
}

export async function saveFlags(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const { tenant, session } = await requireModule('settings');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const flags = Object.fromEntries(
    (Object.keys(DEFAULT_FLAGS) as Array<keyof Flags>).map((flag) => [flag, formData.get(flag) === 'on']),
  ) as Flags;

  await withTenant(tenant.id, (tx) =>
    tx.tenant.update({ where: { id: tenant.id }, data: { enabledModules: readFlags(flags) } }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'feature_flags',
    details: { ...flags },
  });

  revalidatePath('/settings');
  return { saved: 'Módulos atualizados. O menu já reflete a mudança.' };
}
