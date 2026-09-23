// Development catalogue: rooms, procedures, products and patients for the example
// tenants. Imported by prisma/seed.ts.
//
// The parameters, room rates and disposables are the clinic's real ones — they are
// already documented in docs/regras-de-negocio.md, and the pricing screens are only
// meaningful with them.
//
// The per-brand PURCHASE COSTS here are illustrative, not the clinic's. Supplier pricing
// is commercial information and this repository is public. The real catalogue is loaded
// separately with scripts/import-catalog.ts, which reads the spreadsheet that stays out
// of git. The reference case in src/lib/pricing.test.ts uses the real numbers, because
// those specific ones are published in docs/regras-de-negocio.md as the contract the
// formulas have to satisfy.
import type { Tx } from '../src/lib/db';

export type RoomSeed = { name: string; hourlyRate: string; notes?: string };
export type ProcedureSeed = {
  name: string;
  disposablesCost: string;
  defaultDurationHours: string;
  products: Array<{ brand: string; purchaseCost: string; yieldPerUnit: string; purchaseUnit: string }>;
};
export type PatientSeed = {
  name: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  clinicalAlert?: string;
};

/** Real hourly rates — see docs/regras-de-negocio.md. */
export const ROOMS: RoomSeed[] = [
  { name: 'Coworking Tatuapé', hourlyRate: '77.00', notes: 'Locação avulsa por hora, zona leste' },
  { name: 'Coworking Parque do Carmo', hourlyRate: '35.00', notes: 'Zona leste' },
];

/** Real disposables costs; illustrative purchase costs. */
export const PROCEDURES: ProcedureSeed[] = [
  {
    name: 'Toxina botulínica (full face)',
    disposablesCost: '40.00',
    defaultDurationHours: '1.00',
    products: [
      // Yield 1.5: one vial covers a patient and a half, the rest going to a touch-up.
      { brand: 'Xeomin®', purchaseCost: '600.00', yieldPerUnit: '1.5', purchaseUnit: 'Frasco 100U' },
      { brand: 'Letybo®', purchaseCost: '575.00', yieldPerUnit: '1.5', purchaseUnit: 'Frasco 100U' },
      { brand: 'Nabota®', purchaseCost: '540.00', yieldPerUnit: '1.5', purchaseUnit: 'Frasco 100U' },
    ],
  },
  {
    name: 'Preenchimento labial 1ml',
    disposablesCost: '55.00',
    defaultDurationHours: '1.00',
    products: [
      { brand: 'Belotero®', purchaseCost: '280.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1ml' },
      { brand: 'Restylane® Kysse', purchaseCost: '440.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1ml' },
      { brand: 'Rennova® Lips', purchaseCost: '260.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1ml' },
    ],
  },
  {
    name: 'Bioestimulador de colágeno',
    disposablesCost: '65.00',
    defaultDurationHours: '1.00',
    products: [
      { brand: 'Sculptra®', purchaseCost: '950.00', yieldPerUnit: '1', purchaseUnit: 'Frasco' },
      { brand: 'Radiesse®', purchaseCost: '750.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1,5ml' },
    ],
  },
  {
    name: 'Skinbooster',
    disposablesCost: '45.00',
    defaultDurationHours: '1.00',
    products: [
      { brand: 'Profhilo®', purchaseCost: '880.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 2ml' },
    ],
  },
  {
    name: 'Preenchimento mandíbula/mento',
    disposablesCost: '55.00',
    defaultDurationHours: '1.00',
    products: [
      { brand: 'Belotero® Volume', purchaseCost: '550.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1ml' },
      { brand: 'Rennova® Ultra Volume', purchaseCost: '250.00', yieldPerUnit: '1', purchaseUnit: 'Seringa 1,25ml' },
    ],
  },
];

/** Fictional patients, as in the prototype. No real person is seeded. */
export const PATIENTS: PatientSeed[] = [
  { name: 'Renata Yamada', birthDate: '1988-03-14', phone: '11987650001', email: 'renata@exemplo.com.br' },
  { name: 'Carla Bueno', birthDate: '1979-11-02', phone: '11987650002' },
  { name: 'Juliana Prado', birthDate: '1992-06-25', phone: '11987650003', clinicalAlert: 'Alergia a lidocaína' },
  { name: 'Márcia Okamoto', birthDate: '1975-01-09', phone: '11987650004' },
  { name: 'Fernanda Lins', birthDate: '1990-09-30', phone: '11987650005', clinicalAlert: 'Uso de anticoagulante' },
  { name: 'Ana Beatriz Moura', birthDate: '1995-04-18', phone: '11987650006' },
  { name: 'Patrícia Sato', birthDate: '1983-12-07', phone: '11987650007' },
  { name: 'Bruna Tavares', birthDate: '1998-07-21', phone: '11987650008' },
];

/** Real parameters — see docs/regras-de-negocio.md. */
export const PRICING_PARAMS = {
  taxRate: '0.0600',
  cardFeeUpfront: '0.0450',
  cardFeeInstallment: '0.1500',
  fixedMonthlyCosts: '4500.00',
  expectedAppointments: 40,
  defaultMargin: '0.3000',
};

/** Seeds the catalogue for one tenant. Idempotent, like the rest of the seed. */
export async function seedCatalog(tx: Tx, tenantId: string, withPatients: boolean) {
  const existingParams = await tx.pricingParams.findFirst({ where: { tenantId }, select: { id: true } });
  if (!existingParams) {
    await tx.pricingParams.create({ data: { tenantId, ...PRICING_PARAMS } });
  }

  for (const room of ROOMS) {
    await tx.room.upsert({
      where: { tenantId_name: { tenantId, name: room.name } },
      update: { hourlyRate: room.hourlyRate, notes: room.notes ?? null },
      create: { tenantId, name: room.name, hourlyRate: room.hourlyRate, notes: room.notes ?? null },
    });
  }

  for (const procedure of PROCEDURES) {
    const saved = await tx.procedure.upsert({
      where: { tenantId_name: { tenantId, name: procedure.name } },
      update: {
        disposablesCost: procedure.disposablesCost,
        defaultDurationHours: procedure.defaultDurationHours,
      },
      create: {
        tenantId,
        name: procedure.name,
        disposablesCost: procedure.disposablesCost,
        defaultDurationHours: procedure.defaultDurationHours,
      },
    });

    for (const product of procedure.products) {
      await tx.product.upsert({
        where: {
          tenantId_procedureId_brand: { tenantId, procedureId: saved.id, brand: product.brand },
        },
        update: {
          purchaseCost: product.purchaseCost,
          yieldPerUnit: product.yieldPerUnit,
          purchaseUnit: product.purchaseUnit,
        },
        create: {
          tenantId,
          procedureId: saved.id,
          brand: product.brand,
          purchaseCost: product.purchaseCost,
          yieldPerUnit: product.yieldPerUnit,
          purchaseUnit: product.purchaseUnit,
        },
      });
    }
  }

  if (!withPatients) return;

  for (const patient of PATIENTS) {
    const existing = await tx.patient.findFirst({
      where: { tenantId, name: patient.name },
      select: { id: true },
    });
    const data = {
      name: patient.name,
      birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
      phone: patient.phone ?? null,
      email: patient.email ?? null,
      clinicalAlert: patient.clinicalAlert ?? null,
    };
    if (existing) await tx.patient.update({ where: { id: existing.id }, data });
    else await tx.patient.create({ data: { tenantId, ...data } });
  }
}
