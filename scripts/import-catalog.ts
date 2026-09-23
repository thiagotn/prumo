// Imports the clinic's real catalogue — rooms, procedures and products — from the
// pricing spreadsheet into a tenant.
//
//   npx tsx scripts/import-catalog.ts --host app.clinic.example [--file data/planilha.xlsx] [--dry-run]
//
// The spreadsheet stays out of git: it holds the clinic's supplier costs and margins,
// and this repository is public. That is exactly why this is a separate script rather
// than part of prisma/seed.ts, whose catalogue is illustrative.
//
// It reads the "Parâmetros", "Salas" and "Materiais" tabs, matching them by header text
// rather than by cell position, so an inserted column does not silently shift the data.
// Idempotent: existing rows are updated, new ones created, nothing is deleted.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import { prisma, withTenant } from '../src/lib/db';
import { tenantByHost } from '../src/lib/tenant';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    file: { type: 'string', default: 'data/precificacao_clinica_dra_tati_mayumi.xlsx' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const DRY_RUN = values['dry-run'] === true;

/** Cell text, trimmed. ExcelJS hands back rich text and formula objects too. */
function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('result' in value) return String(value.result ?? '').trim();
    if ('text' in value) return String(value.text).trim();
  }
  return String(value).trim();
}

/** A number from a cell, accepting the pt-BR decimal comma. */
function num(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  const raw = text(value).replace(/[R$\s.]/g, '').replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Finds the header row and maps each expected fragment to its column.
 *
 * Two rules keep this from silently picking the wrong column, which is how a "Materiais"
 * import ends up with one procedure per product:
 *
 *  - **Exact beats prefix beats substring.** "Procedimento" must win over
 *    "Opção (Procedimento — Marca)", which also contains the word.
 *  - **Every fragment maps to a distinct column.** A title row like "Salas de coworking —
 *    valor hora" contains both "sala" and "valor hora" in a single cell; without this it
 *    would pass as a header row and every value would be read from column A.
 */
function headerMap(sheet: ExcelJS.Worksheet, expected: string[]): Map<string, number> {
  for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
    const labels: Array<{ label: string; col: number }> = [];
    sheet.getRow(r).eachCell((cell, col) => {
      const label = text(cell.value).toLowerCase();
      if (label) labels.push({ label, col });
    });

    const resolved = new Map<string, number>();
    const taken = new Set<number>();
    for (const fragment of expected) {
      const candidates = labels.filter((l) => !taken.has(l.col));
      const match =
        candidates.find((l) => l.label === fragment) ??
        candidates.find((l) => l.label.startsWith(fragment)) ??
        candidates.find((l) => l.label.includes(fragment));
      if (!match) break;
      resolved.set(fragment, match.col);
      taken.add(match.col);
    }

    if (resolved.size === expected.length) return resolved;
  }
  throw new Error(
    `Sheet "${sheet.name}": could not find a header row with distinct columns for ${expected.join(', ')}.`,
  );
}

async function main() {
  const host = values.host?.trim();
  if (!host) {
    console.error('Usage: --host <clinic hostname> [--file <path.xlsx>] [--dry-run]');
    process.exit(1);
  }

  const tenant = await tenantByHost(host);
  if (!tenant) {
    console.error(`No clinic answers for ${host}.`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(values.file!);

  // ── parameters ─────────────────────────────────────────────────────────────
  const paramsSheet = workbook.getWorksheet('Parâmetros');
  if (!paramsSheet) throw new Error('The spreadsheet has no "Parâmetros" tab.');

  const labelled = new Map<string, number>();
  paramsSheet.eachRow((row) => {
    const label = text(row.getCell(1).value).toLowerCase();
    const value = num(row.getCell(2).value);
    if (label && value !== null) labelled.set(label, value);
  });
  const param = (fragment: string): number | null => {
    for (const [label, value] of labelled) if (label.includes(fragment)) return value;
    return null;
  };

  const taxRate = param('impostos');
  const feeUpfront = param('à vista');
  const feeInstallment = param('parcelado');
  const fixedCosts = param('custos fixos');
  const appointments = param('atendimentos estimados');
  if ([taxRate, feeUpfront, feeInstallment, fixedCosts, appointments].some((v) => v === null)) {
    throw new Error('The "Parâmetros" tab is missing one of the expected rows.');
  }

  // ── rooms ──────────────────────────────────────────────────────────────────
  const roomsSheet = workbook.getWorksheet('Salas');
  if (!roomsSheet) throw new Error('The spreadsheet has no "Salas" tab.');
  const roomCols = headerMap(roomsSheet, ['sala', 'valor hora']);
  const rooms: Array<{ name: string; hourlyRate: number }> = [];
  roomsSheet.eachRow((row) => {
    const name = text(row.getCell(roomCols.get('sala')!).value);
    const rate = num(row.getCell(roomCols.get('valor hora')!).value);
    if (name && rate !== null && !name.toLowerCase().includes('sala /')) {
      rooms.push({ name, hourlyRate: rate });
    }
  });

  // ── products ───────────────────────────────────────────────────────────────
  const materialsSheet = workbook.getWorksheet('Materiais');
  if (!materialsSheet) throw new Error('The spreadsheet has no "Materiais" tab.');
  const matCols = headerMap(materialsSheet, ['procedimento', 'produto', 'custo de compra', 'rendimento', 'unidade']);
  const products: Array<{
    procedure: string;
    brand: string;
    purchaseCost: number;
    yieldPerUnit: number;
    purchaseUnit: string;
  }> = [];
  materialsSheet.eachRow((row) => {
    const procedure = text(row.getCell(matCols.get('procedimento')!).value);
    const brand = text(row.getCell(matCols.get('produto')!).value);
    const cost = num(row.getCell(matCols.get('custo de compra')!).value);
    const perUnit = num(row.getCell(matCols.get('rendimento')!).value);
    const unit = text(row.getCell(matCols.get('unidade')!).value);
    // Skip the header row and the trailing note.
    if (procedure && brand && cost !== null && perUnit !== null && !brand.toLowerCase().startsWith('produto')) {
      products.push({ procedure, brand, purchaseCost: cost, yieldPerUnit: perUnit, purchaseUnit: unit });
    }
  });

  console.log(`\nClinic: ${tenant.name} (${tenant.domain})`);
  console.log(`Spreadsheet: ${values.file}`);
  console.log(`  parameters: tax ${taxRate}, fees ${feeUpfront}/${feeInstallment}, fixed ${fixedCosts} over ${appointments} appointments`);
  console.log(`  rooms: ${rooms.length}`);
  console.log(`  products: ${products.length} across ${new Set(products.map((p) => p.procedure)).size} procedures`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing was written.\n');
    return;
  }

  // The disposables cost per procedure is not a column in the sheet — it is applied per
  // appointment on the pricing tab. Existing procedures keep whatever is configured; new
  // ones start at zero and have to be filled in under Settings.
  await withTenant(tenant.id, async (tx) => {
    await tx.pricingParams.create({
      data: {
        tenantId: tenant.id,
        taxRate: taxRate!.toFixed(4),
        cardFeeUpfront: feeUpfront!.toFixed(4),
        cardFeeInstallment: feeInstallment!.toFixed(4),
        fixedMonthlyCosts: fixedCosts!.toFixed(2),
        expectedAppointments: Math.round(appointments!),
        defaultMargin: '0.3000',
      },
    });

    for (const room of rooms) {
      await tx.room.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: room.name } },
        update: { hourlyRate: room.hourlyRate.toFixed(2) },
        create: { tenantId: tenant.id, name: room.name, hourlyRate: room.hourlyRate.toFixed(2) },
      });
    }

    for (const product of products) {
      const procedure = await tx.procedure.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: product.procedure } },
        update: {},
        create: {
          tenantId: tenant.id,
          name: product.procedure,
          disposablesCost: '0.00',
          defaultDurationHours: '1.00',
        },
      });
      await tx.product.upsert({
        where: {
          tenantId_procedureId_brand: {
            tenantId: tenant.id,
            procedureId: procedure.id,
            brand: product.brand,
          },
        },
        update: {
          purchaseCost: product.purchaseCost.toFixed(2),
          yieldPerUnit: product.yieldPerUnit.toFixed(4),
          purchaseUnit: product.purchaseUnit,
        },
        create: {
          tenantId: tenant.id,
          procedureId: procedure.id,
          brand: product.brand,
          purchaseCost: product.purchaseCost.toFixed(2),
          yieldPerUnit: product.yieldPerUnit.toFixed(4),
          purchaseUnit: product.purchaseUnit,
        },
      });
    }
  });

  console.log('\n✅ Catalogue imported.');
  console.log('   Check the disposables cost of each procedure under Settings — the sheet');
  console.log('   applies it per appointment rather than storing it with the procedure.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
