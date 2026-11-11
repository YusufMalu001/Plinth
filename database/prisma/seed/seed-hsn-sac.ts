import fs from 'fs';
import path from 'path';
import XLSX = require('xlsx');
import { Prisma, PrismaClient } from '@prisma/client';

type SeedClient = Pick<PrismaClient, '$executeRaw'>;
export type HsnSacDefinition = { code: string; description: string; kind: 'HSN' | 'SAC' };

const clean = (value: unknown) => String(value ?? '').trim();

/** Read and validate every populated row before any database writes occur. */
export function loadHsnSacDefinitions(workbookPath = process.env.HSN_SAC_WORKBOOK_PATH || path.join(__dirname, 'HSN_SAC_separated_fixed.xlsx')): HsnSacDefinition[] {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`HSN/SAC workbook not found at ${workbookPath}`);
  }

  const workbook = XLSX.readFile(workbookPath, { cellFormula: true });
  const definitions: HsnSacDefinition[] = [];
  const seenCodes = new Set<string>();
  for (const [sheet, kind, codeKey, descriptionKey] of [
    ['HSN_6_PLUS', 'HSN', 'HSN_CD', 'HSN_Description'],
    ['SAC_6_PLUS', 'SAC', 'SAC_CD', 'SAC_Description'],
  ] as const) {
    const worksheet = workbook.Sheets[sheet];
    if (!worksheet) throw new Error(`Required sheet ${sheet} is missing from ${workbookPath}`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: true, blankrows: false });
    const headers = (rows[0] ?? []).map(clean);
    const codeIndex = headers.indexOf(codeKey);
    const descriptionIndex = headers.indexOf(descriptionKey);
    if (codeIndex < 0 || descriptionIndex < 0) {
      throw new Error(`Required columns ${codeKey} and ${descriptionKey} are missing from ${sheet}`);
    }

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const rawCode = row[codeIndex];
      const descriptionCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: descriptionIndex })];
      const rawDescription = row[descriptionIndex] || (typeof descriptionCell?.f === 'string' ? descriptionCell.f.replace(/^=/, '') : '');
      if ((rawCode === '' || rawCode == null) && (rawDescription === '' || rawDescription == null)) continue;

      const code = clean(rawCode);
      const description = clean(rawDescription);
      // Preserve the source cell verbatim: the supplied HSN sheet has two codes
      // with an embedded space. Normalizing them would create collisions with
      // separate source entries and lose one of the supplied rows.
      if (!/^[\d ]+$/.test(code) || !description) {
        throw new Error(`Invalid code or description in ${sheet} row ${rowIndex + 1}`);
      }
      if (seenCodes.has(code)) {
        throw new Error(`Duplicate HSN/SAC code ${code} in ${sheet} row ${rowIndex + 1}`);
      }
      seenCodes.add(code);
      definitions.push({ code, description, kind });
    }
  }

  if (definitions.length === 0) throw new Error(`No HSN/SAC rows found in ${workbookPath}`);
  return definitions;
}

/** Seeds the two 6+ digit reference sheets supplied by Plinth International. */
export async function seedHsnSacCodes(prisma: SeedClient, workbookPath?: string) {
  const definitions = loadHsnSacDefinitions(workbookPath);

  // Parameterized bulk upserts keep the seed repeatable without flooding the DB with one query per code.
  const chunkSize = 250;
  for (let index = 0; index < definitions.length; index += chunkSize) {
    const batch = definitions.slice(index, index + chunkSize);
    const values = Prisma.join(batch.map((item) => Prisma.sql`(gen_random_uuid(), ${item.code}, ${item.description}, ${item.kind}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`));
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "hsn_sac_codes" ("id", "code", "description", "kind", "createdAt", "updatedAt") VALUES ${values} ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "kind" = EXCLUDED."kind", "updatedAt" = CURRENT_TIMESTAMP`);
  }
  const hsnCount = definitions.filter((item) => item.kind === 'HSN').length;
  const sacCount = definitions.length - hsnCount;
  console.log(`✅ Seeded ${definitions.length} HSN/SAC reference codes (${hsnCount} HSN, ${sacCount} SAC)`);
}
