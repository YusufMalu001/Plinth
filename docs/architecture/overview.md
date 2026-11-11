# Plinth ERP - System Architecture Overview

This document describes the high-level architecture of Plinth ERP, designed to serve as a scalable base for a multi-developer team.

## Monorepo Layout
Plinth ERP uses a monorepo configuration managed by **npm workspaces** and **Turborepo**.

```
                       PLINTH ERP (Monorepo)
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
     apps/web/               services/api/             packages/
(Next.js Frontend)        (Express Monolith API)    (Shared Libraries)
         │                        │                        │
         │                        ▼                        │
         │                   Prisma Client                 │
         │                        │                        │
         └───────────────►        ▼        ◄───────────────┘
                        Supabase PostgreSQL
```

### Components

1. **Next.js Frontend (`apps/web/`):** React framework running in App Router mode. It compiles client UI pages and communicates with the Express backend strictly via HTTP API calls. It has no direct database access.
2. **Express Monolith API (`services/api/`):** A modular monolith Express server. It houses business logic, authentication, database client management, and exposes REST endpoints.
3. **Shared Packages (`packages/`):** Code reused by both the frontend and backend.
   - `@plinth/config`: Shared compiler configurations (tsconfig bases).
   - `@plinth/eslint-config`: Project-wide linting standards.
   - `@plinth/types`: Shared TypeScript definitions.
   - `@plinth/validation`: Shared input parsing schemas using Zod.
   - `@plinth/ui`: Base UI styling primitives and utilities.

## Core Architectural Rules
- **No Direct Database Access from Frontend:** The Next.js frontend must never import `@prisma/client` or communicate directly with Supabase. It must use HTTP clients to fetch data from the Express backend API.
- **Thin Controllers:** The backend controllers only process requests and output responses. Heavy business logic should live in service classes, and query execution should live in repositories.
- **Strict Data Validation:** All API inputs (request bodies, parameters, and queries) must be validated server-side using shared Zod schemas before being passed to business logic.
