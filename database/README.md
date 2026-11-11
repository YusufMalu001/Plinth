# Database Layer - Plinth ERP

This directory houses the Prisma schema configuration, migrations, seeds, and database models.

## Technology Stack
- **Database Engine:** Supabase PostgreSQL
- **Object-Relational Mapping (ORM):** Prisma ORM
- **Seed Scripts:** TypeScript compilation via `ts-node`

## Domain Ownership
- **Primary Owner:** Siddhi (Database Developer / Technical Lead)
- **Scope:** Prisma schema, indexes, constraints, ERD maintenance, seeds, and migrations approval.
- **Rule:** No direct modifications to staging or production databases. All schema updates must go through git branches, local testing, and Pull Request approval.

## Commands

From the workspace root, you can execute the database tasks using npm workspace:

### 1. Generate Prisma Client
```bash
npm run db:generate
```
*(Runs `prisma generate` internally inside the `@plinth/database` workspace).*

### 2. Create and Run Local Migrations
```bash
# This requires a local .env file configured with DATABASE_URL and DIRECT_URL
npm run db:migrate
```
*(Runs `prisma migrate dev` internally).*

### 3. Seed the Database
```bash
npm run db:seed
```
*(Runs `prisma db seed` to insert the default users).*

Development-only seed credentials include `admin@plinth.example` / `Admin123!`, `manager@plinth.example` / `Manager123!`, `storemanager@gmail.com` / `StoreManager@2026!`, `fardeen@plinth.example` / `Employee123!`, and `siddhi@plinth.example` / `Siddhi123!`. Never use these credentials outside a disposable development database.

To apply a changed development password to an existing local account, start the local database and run `SEED_RESET_PASSWORDS=true npm run db:seed` from the repository root.

### 4. Database Studio (GUI)
```bash
npm run db:studio --workspace=database
```
*(Launches the browser-based database inspector).*
