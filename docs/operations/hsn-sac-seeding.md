# HSN/SAC reference data

The HSN/SAC seed source is `database/prisma/seed/HSN_SAC_separated_fixed.xlsx`. Its `HSN_6_PLUS` and `SAC_6_PLUS` sheets are the only sheets loaded by the seed. The source currently contains 20,486 HSN rows and 649 SAC rows (21,135 total). The supplied workbook was verified to be byte-identical to the checked-in source. The seed validates all populated rows and duplicate codes before writing. One source description cell for HSN `52083110` contains the malformed formula `=--- LUNGI`; the importer retains that HSN code and uses `--- LUNGI` as its literal description fallback.

The `hsn_sac_codes` table already exists. The seeder performs idempotent upserts and needs no schema migration. Product creation searches this shared table through the authenticated `/api/v1/master-data/hsn-sac` endpoint, so seed the target database used by the API. The API applies the search on both code and description; users can find entries by typing a code or description.

## Verify the source

From the repository root:

```sh
npm run db:verify-hsn-sac
```

This is read-only and verifies the expected row counts, unique codes, and populated descriptions before deployment or seeding.

After seeding a reachable database, verify every source code, kind, and description with:

```sh
npm run db:verify-hsn-sac-db
```

## Seed local development

Confirm the root `.env` points to the local development database, then run:

```sh
npm run db:seed-hsn-sac
```

This command seeds only HSN/SAC reference data; it does not run the broad ERP master-data seed.

## Seed production

After deploying a release containing the seed script and workbook, take the normal database backup and verify the production API service is configured to use the intended production database. Run the seed once against that database from the production host:

```sh
docker compose exec -T -w /app api ./node_modules/.bin/ts-node database/prisma/seed/verify-hsn-sac-source.ts
docker compose exec -T -w /app api ./node_modules/.bin/ts-node database/prisma/seed/seed-hsn-sac-only.ts
docker compose exec -T -w /app api ./node_modules/.bin/ts-node database/prisma/seed/verify-hsn-sac-database.ts
```

The API container receives the production `DATABASE_URL` from the deployment environment; the seed uses that same connection. Do not run the full `npm run db:seed` command for this task because it seeds other ERP reference and demo data. The HSN/SAC seeder is safe to rerun: it updates descriptions/kind for existing codes and inserts missing codes. Verify the production endpoint by searching for representative HSN and SAC codes and descriptions after seeding.

No production database was changed as part of this code change.
