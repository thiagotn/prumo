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

export type ConsentTemplateSeed = {
  slug: string;
  title: string;
  /** Matched to a seeded procedure by name, when there is one. */
  procedureName?: string;
  body: string;
};

/**
 * Starting wordings, so the screen is not empty in development. They are a plausible
 * starting point, not legal advice: the clinic rewrites them in its own words, and each
 * rewrite publishes a new edition.
 */
export const CONSENT_TEMPLATES: ConsentTemplateSeed[] = [
  {
    slug: 'termo-preenchimento-labial',
    title: 'Termo de consentimento — preenchimento labial',
    procedureName: 'Preenchimento labial 1ml',
    body: [
      'Eu, {{paciente}}, declaro que fui informada de forma clara sobre o procedimento de {{procedimento}}, seus objetivos, a técnica empregada, o material utilizado e os cuidados necessários antes e depois da aplicação.',
      'Estou ciente de que reações como edema, hematoma, sensibilidade local e assimetria temporária podem ocorrer nos primeiros dias, e de que o resultado varia conforme a resposta individual de cada organismo.',
      'Informei à equipe da {{clinica}} todas as minhas condições de saúde, alergias e medicamentos em uso, em especial anticoagulantes, e me comprometo a seguir as orientações recebidas.',
      'Tive a oportunidade de fazer perguntas e fui respondida. Autorizo a realização do procedimento nesta data, {{data}}.',
    ].join('\n\n'),
  },
  {
    slug: 'termo-toxina-botulinica',
    title: 'Termo de consentimento — toxina botulínica',
    procedureName: 'Toxina botulínica (full face)',
    body: [
      'Eu, {{paciente}}, declaro que fui informada sobre a aplicação de {{procedimento}}, incluindo a finalidade estética do tratamento, a duração esperada do efeito e a necessidade de novas aplicações ao longo do tempo.',
      'Fui informada de que podem ocorrer hematomas nos pontos de aplicação, dor de cabeça nas primeiras horas e, com menor frequência, assimetria ou queda temporária da pálpebra, que regridem com o tempo.',
      'Declaro não estar gestante ou amamentando e não ter doença neuromuscular diagnosticada, e informei à equipe da {{clinica}} os medicamentos que utilizo.',
      'Autorizo a realização do procedimento nesta data, {{data}}, e me comprometo a comparecer à avaliação de retorno.',
    ].join('\n\n'),
  },
  {
    slug: 'termo-registro-fotografico',
    title: 'Termo de consentimento — registro fotográfico',
    body: [
      'Eu, {{paciente}}, autorizo a {{clinica}} a realizar fotografias do antes e do depois dos procedimentos a que me submeto, para acompanhamento clínico e registro em prontuário.',
      'Estou ciente de que as imagens ficam guardadas em meio seguro, com acesso restrito à equipe da clínica, e de que todo acesso é registrado.',
      'Qualquer uso das imagens fora do prontuário — divulgação, ensino ou material de comunicação — depende de autorização específica e por escrito, que posso recusar sem prejuízo ao meu atendimento.',
      'Esta autorização é dada nesta data, {{data}}, e pode ser revogada por mim a qualquer momento.',
    ].join('\n\n'),
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

  // Consent terms: first edition of each, only when the tenant has none.
  for (const template of CONSENT_TEMPLATES) {
    const existing = await tx.consentTemplate.findFirst({
      where: { tenantId, slug: template.slug },
      select: { id: true },
    });
    if (existing) continue;

    const procedure = template.procedureName
      ? await tx.procedure.findFirst({
          where: { tenantId, name: template.procedureName },
          select: { id: true },
        })
      : null;

    await tx.consentTemplate.create({
      data: {
        tenantId,
        slug: template.slug,
        title: template.title,
        body: template.body,
        version: 1,
        current: true,
        procedureId: procedure?.id ?? null,
      },
    });
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

/**
 * A week of appointments around today, so the three schedule views have something to
 * show in development. Times are the clinic's working hours; the dates move with the
 * seed so the diary is never empty.
 */
export async function seedAppointments(tx: Tx, tenantId: string) {
  const existing = await tx.appointment.count({ where: { tenantId } });
  if (existing > 0) return existing;

  const [patients, rooms, procedures, tenant] = await Promise.all([
    tx.patient.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    tx.room.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    tx.procedure.findMany({ where: { tenantId }, include: { products: true }, orderBy: { name: 'asc' } }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { defaultUnit: true } }),
  ]);
  if (patients.length === 0 || rooms.length === 0 || procedures.length === 0) return 0;

  // Book into the clinic's own unit rather than whichever room sorts first: the diary
  // should look like the clinic's, and it leaves the second room genuinely free.
  const mainRoom = rooms.find((r) => r.name === tenant?.defaultUnit) ?? rooms[0]!;

  const { instantAt, todayKey, addDays } = await import('../src/lib/schedule');
  const today = todayKey();

  // day offset, hour, patient index, procedure index, status, block?
  const plan: Array<[number, number, number, number, 'CONFIRMED' | 'WAITING' | 'ATTENDED', boolean]> = [
    [0, 9, 1, 0, 'ATTENDED', false],
    [0, 10, 4, 3, 'ATTENDED', false],
    [0, 12, 0, 0, 'CONFIRMED', true], // lunch
    [0, 14, 7, 1, 'CONFIRMED', false],
    [0, 15, 5, 2, 'CONFIRMED', false],
    [0, 16, 3, 4, 'WAITING', false],
    [0, 18, 6, 1, 'CONFIRMED', false],
    [1, 11, 0, 1, 'CONFIRMED', false],
    [1, 15, 2, 2, 'CONFIRMED', false],
    [2, 10, 7, 1, 'WAITING', false],
    [2, 14, 1, 0, 'CONFIRMED', false],
    [-1, 9, 2, 0, 'ATTENDED', false],
    [-1, 14, 6, 1, 'ATTENDED', false],
    [-2, 10, 3, 3, 'ATTENDED', false],
  ];

  let created = 0;
  for (const [dayOffset, hour, patientIndex, procedureIndex, status, isBlock] of plan) {
    const day = addDays(today, dayOffset);
    const procedure = procedures[procedureIndex % procedures.length]!;
    const durationHours = Number(procedure.defaultDurationHours);
    const startsAt = instantAt(day, hour);
    const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);

    await tx.appointment.create({
      data: {
        tenantId,
        patientId: isBlock ? null : patients[patientIndex % patients.length]!.id,
        roomId: mainRoom.id,
        procedureId: isBlock ? null : procedure.id,
        productId: isBlock ? null : (procedure.products[0]?.id ?? null),
        startsAt,
        endsAt,
        status,
        isBlock,
        notes: isBlock ? 'Almoço · sala liberada' : null,
      },
    });
    created++;
  }
  return created;
}

/** Stock lots for development: one or two batches per product, with mixed statuses. */
export async function seedStockLots(tx: Tx, tenantId: string) {
  const existing = await tx.stockLot.count({ where: { tenantId } });
  if (existing > 0) return existing;

  const products = await tx.product.findMany({ where: { tenantId }, orderBy: { brand: 'asc' } });
  const now = Date.now();
  const inDays = (days: number) => new Date(now + days * 86_400_000);

  let created = 0;
  for (const [i, product] of products.entries()) {
    // A spread of states, so the stock screen shows every status without hand-editing:
    // healthy, running low, expiring soon, and one that needs restocking.
    const shape = i % 4;
    const quantity = shape === 3 ? 0 : shape === 1 ? 1 : 4;
    const expiresAt = shape === 2 ? inDays(45) : inDays(400 + i * 10);

    await tx.stockLot.create({
      data: {
        tenantId,
        productId: product.id,
        lotNumber: `${product.brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}-${4000 + i * 137}`,
        expiresAt,
        unitCost: product.purchaseCost,
        quantityReceived: Math.max(quantity, 1),
        quantityRemaining: quantity,
        invoiceRef: `NF-${9000 + i}`,
      },
    });
    created++;
  }
  return created;
}

/**
 * Six months of closed encounters, so the financial screens have a history to show in
 * development. The figures are computed with the real formulas (src/lib/pricing.ts), not
 * invented: a seeded month has to add up the same way a real one does.
 *
 * Stock is deliberately left alone. These closings are backdated, and taking units off
 * today's lots to pay for last April's appointments would make the stock screen lie.
 */
export async function seedClosedEncounters(tx: Tx, tenantId: string) {
  const existing = await tx.payment.count({ where: { tenantId } });
  if (existing > 0) return existing;

  const [patients, rooms, procedures, params, tenant] = await Promise.all([
    tx.patient.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    tx.room.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    tx.procedure.findMany({ where: { tenantId }, include: { products: true }, orderBy: { name: 'asc' } }),
    tx.pricingParams.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { defaultUnit: true } }),
  ]);
  if (patients.length === 0 || rooms.length === 0 || procedures.length === 0 || !params) return 0;

  const room = rooms.find((r) => r.name === tenant?.defaultUnit) ?? rooms[0]!;
  const { costBreakdown, quote, realized, overheadPerAppointment, toCents } = await import(
    '../src/lib/pricing'
  );
  const parameters = {
    taxRate: Number(params.taxRate),
    cardFeeUpfront: Number(params.cardFeeUpfront),
    cardFeeInstallment: Number(params.cardFeeInstallment),
    fixedMonthlyCosts: Number(params.fixedMonthlyCosts),
    expectedAppointments: params.expectedAppointments,
    defaultMargin: Number(params.defaultMargin),
  };
  const overhead = overheadPerAppointment(parameters);

  // Cash flow as the clinic actually sees it: mostly card and Pix.
  const METHODS = ['PIX', 'CREDIT_UPFRONT', 'CREDIT_INSTALLMENT', 'CASH', 'DEBIT'] as const;
  const now = new Date();
  let created = 0;

  // Six months back, up to today. The current month only gets the days that have already
  // happened — a closing dated next week would be a lie the screens would repeat.
  for (let monthsAgo = 6; monthsAgo >= 0; monthsAgo--) {
    // A gentle upward trend, so the six-month chart is not a flat wall.
    const howMany = 4 + ((6 - monthsAgo) % 3);

    for (let i = 0; i < howMany; i++) {
      const day = 4 + i * 4;
      const startsAt = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 12 + (i % 5), 0, 0),
      );
      if (startsAt.getTime() > now.getTime()) continue;
      const procedure = procedures[(monthsAgo + i) % procedures.length]!;
      const product = procedure.products[i % Math.max(procedure.products.length, 1)];
      if (!product) continue;

      const durationHours = Number(procedure.defaultDurationHours);
      const endsAt = new Date(startsAt.getTime() + durationHours * 3_600_000);
      const patient = patients[(monthsAgo * 3 + i) % patients.length]!;
      const method = METHODS[(monthsAgo + i) % METHODS.length]!;

      const cost = costBreakdown({
        purchaseCost: Number(product.purchaseCost),
        yieldPerUnit: Number(product.yieldPerUnit),
        roomHourlyRate: Number(room.hourlyRate),
        durationHours,
        disposablesCost: Number(procedure.disposablesCost),
        overheadPerAppointment: overhead,
      });
      const suggested = quote(
        {
          purchaseCost: Number(product.purchaseCost),
          yieldPerUnit: Number(product.yieldPerUnit),
          roomHourlyRate: Number(room.hourlyRate),
          durationHours,
          disposablesCost: Number(procedure.disposablesCost),
          overheadPerAppointment: overhead,
        },
        parameters,
      );
      // Some months the clinic gives a discount; one of them lands below the 28% line,
      // which is exactly the case the Financeiro screen has to highlight.
      const discount = i === 2 ? 0.88 : i === 3 ? 0.95 : 1;
      const charged =
        method === 'CREDIT_INSTALLMENT' ? suggested.installment * discount : suggested.upfront * discount;
      const outcome = realized(charged, cost.total, method, parameters);

      const appointment = await tx.appointment.create({
        data: {
          tenantId,
          patientId: patient.id,
          roomId: room.id,
          procedureId: procedure.id,
          productId: product.id,
          startsAt,
          endsAt,
          status: 'ATTENDED',
        },
      });
      const encounter = await tx.encounter.create({
        data: {
          tenantId,
          appointmentId: appointment.id,
          patientId: patient.id,
          productId: product.id,
          closedAt: endsAt,
          createdAt: endsAt,
        },
      });
      await tx.payment.create({
        data: {
          tenantId,
          encounterId: encounter.id,
          method,
          installments: method === 'CREDIT_INSTALLMENT' ? 3 : null,
          charged: toCents(charged).toFixed(2),
          materialCost: toCents(cost.material).toFixed(2),
          roomCost: toCents(cost.room).toFixed(2),
          disposablesCost: toCents(cost.disposables).toFixed(2),
          overheadCost: toCents(cost.overhead).toFixed(2),
          totalCost: toCents(cost.total).toFixed(2),
          taxAmount: toCents(outcome.tax).toFixed(2),
          cardFeeAmount: toCents(outcome.cardFee).toFixed(2),
          netProfit: toCents(outcome.netProfit).toFixed(2),
          margin: outcome.margin.toFixed(4),
          pricingParamsId: params.id,
          // The cash date is the day of the appointment, not the day of the seed.
          createdAt: endsAt,
        },
      });
      created++;
    }
  }
  return created;
}

/**
 * Fills the outbox for the bookings that are still ahead, through the same queue the
 * booking form uses. Separate from seedAppointments so it runs even on a database that
 * already has a diary — the dedupe key makes it safe to call again.
 */
export async function seedMessageQueue(tx: Tx, tenantId: string) {
  const { enqueueForAppointment } = await import('../src/lib/message-queue');
  const { readFlags } = await import('../src/lib/flags');
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, enabledModules: true },
  });
  if (!tenant) return 0;

  // A flag da própria clínica: quem abrir uma clínica que não usa comunicação automática
  // no ambiente de desenvolvimento vê a fila vazia que ela teria de verdade.
  const { messageAutomation } = readFlags(tenant.enabledModules);

  const upcoming = await tx.appointment.findMany({
    where: { tenantId, isBlock: false, startsAt: { gte: new Date() } },
    include: {
      patient: { select: { name: true, phone: true, active: true } },
      procedure: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  let queued = 0;
  for (const appointment of upcoming) {
    queued += await enqueueForAppointment(
      tx,
      { tenantId, clinicName: tenant.name, automation: messageAutomation },
      {
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        patientId: appointment.patientId,
        patient: appointment.patient,
        procedure: appointment.procedure,
        room: appointment.room,
      },
    );
  }
  return queued;
}
