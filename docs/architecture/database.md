# Database Architecture - Supabase & Prisma

Plinth ERP uses Supabase PostgreSQL as its cloud database and Prisma ORM for type-safe database queries.

## Architecture Diagram
```
    Express Backend API
            │
            ▼
    Prisma ORM Client
            │
            ▼
    Supabase PostgreSQL
```

## Database Ownership
- **Primary Owner:** Siddhi
- **Responsibility:** Siddhi oversees the relational layout, column structures, Prisma migrations, and performance indexing.
- **Rule:** Every schema alteration must go through Pull Request reviews and be validated in the CI pipeline.

## Supabase Connection Types
Prisma requires distinct connection strings depending on database access:
1. **Transaction Connection (`DATABASE_URL`):** Uses port `6543` with pooler enabled (`pgbouncer=true`). Suitable for runtime server queries to minimize pool exhaustion.
2. **Direct Connection (`DIRECT_URL`):** Uses port `5432` to connect directly to the database. Required for migrations, schema modifications, and seed updates.

## Schema Modifications Guidelines
1. Update `database/prisma/schema.prisma`.
2. Generate a local migration by running `npm run db:migrate` inside the workspace root.
3. Verify that the generated SQL migration file under `database/prisma/migrations/` is non-destructive.
4. Run `npm run db:seed` to verify seeding compatibility.
5. Push changes in a feature branch and request review from Siddhi.
