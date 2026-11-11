# Plinth ERP - Workspace Structure & Architecture Map

This document is the master technical guide to the Plinth ERP repository layout, architectural guidelines, development workflows, and coding conventions. Every developer joining the team must read and follow this guide.

---

## 1. Project Overview & Objective
Plinth ERP is an integrated enterprise resource planning platform built as a strongly typed, team-friendly monorepo. The goal is to provide a solid, production-grade base that developers can build on safely without conflicting workflows.

## 2. Monorepo Architecture Overview
The repository is laid out as a multi-package monorepo containing a frontend Next.js application, backend Express API monolith, and shared package utilities, orchestrated via npm workspaces and Turborepo.

## 3. Directory Folder Tree
```
plinth-erp/
│
├── apps/
│   └── web/                   # Next.js Frontend Application
│       ├── public/            # Static assets
│       ├── src/
│       │   ├── app/           # App Router pages and globals CSS
│       │   ├── components/    # Reusable layout and UI elements
│       │   ├── features/      # Feature-scoped UI modules
│       │   ├── hooks/         # Reusable React hooks
│       │   ├── lib/           # Utility client config modules
│       │   ├── services/      # HTTP query fetch functions
│       │   ├── stores/        # Zustand state stores
│       │   ├── types/         # Local UI interfaces
│       │   └── config/        # Environment configurations
│       ├── next.config.js     # Next.js bundle options
│       ├── tailwind.config.js # Tailwind CSS configuration
│       ├── tsconfig.json      # TypeScript configurations
│       └── package.json
│
├── services/
│   └── api/                   # Express Backend Monolith API
│       ├── src/
│       │   ├── config/        # Environment variables loader
│       │   ├── common/        # Shared core middleware, errors, utils
│       │   │   ├── middleware/ # Correlation ID, logger, error handlers
│       │   │   ├── errors/     # Custom AppError classes
│       │   │   ├── utils/      # Structured logger instance
│       │   │   └── types/      # Express declaration overrides
│       │   ├── modules/       # Domain-driven monolith business modules
│       │   │   ├── auth/       # Authentication route/controller/service
│       │   │   ├── users/      # User accounts management
│       │   │   ├── employees/  # HR and employee modules
│       │   │   ├── inventory/  # Product stock and warehouse modules
│       │   │   ├── production/ # Production work order tracking
│       │   │   ├── sales/      # Orders, point-of-sale, invoicing
│       │   │   ├── purchases/  # Supply chain and vendor purchases
│       │   │   └── finance/    # General ledgers, accounts, taxes
│       │   ├── database/      # Prisma client singleton
│       │   ├── app.ts         # Express server middlewares mounting
│       │   └── server.ts      # Main server startup entrypoint
│       ├── tsconfig.json
│       └── package.json
│
├── packages/                  # Reusable Monorepo Packages
│   ├── ui/                    # Tailwind CSS configuration and class merger
│   ├── types/                 # Shared TypeScript models and interface shapes
│   ├── validation/            # Shared Zod validation schemas
│   ├── config/                # Shared tsconfig base files
│   └── eslint-config/         # Shared ESLint linting configurations
│
├── database/                  # Relational Schema and Migrations (Siddhi)
│   ├── prisma/
│   │   ├── schema.prisma      # Source database schema
│   │   └── seed/              # Database seeding scripts
│   ├── diagrams/
│   │   └── erd.md             # Mermaid Entity Relationship Diagram
│   └── README.md
│
├── infrastructure/            # Docker and Deployment Scripts
│   ├── docker/                # api.Dockerfile and web.Dockerfile
│   └── deployment/
│
├── docs/                      # Extended Architecture and Development guides
│   ├── architecture/          # overview.md, frontend.md, backend.md, database.md
│   ├── api/                   # API response details
│   └── development/           # git-workflow.md, branching.md, contribution.md, team-ownership.md
│
├── .devcontainer/             # Visual Studio Code Devcontainer setup
│   ├── devcontainer.json
│   └── Dockerfile
│
├── .github/                   # GitHub templates and action pipelines
│   ├── workflows/             # ci.yml, staging.yml, production.yml
│   ├── CODEOWNERS             # File-level reviewer assignments
│   └── pull_request_template.md
│
├── docker-compose.yml         # Production-grade Docker Composer
├── docker-compose.dev.yml     # Local dev Docker Composer with mounts
├── package.json               # Monorepo workspaces definition
├── turbo.json                 # Turborepo task pipeline mappings
├── .env.example               # Template environment configuration file
├── .gitignore                 # Files excluded from git tracking
├── README.md                  # Quick-start developer guide
├── Agents.md                  # Mandatory AI coder instructions
└── structure.md               # This structure file
```

---

## 4. Architectural Stack Detail

### A. Frontend Architecture (`apps/web/`)
- Built using **Next.js 14 (App Router)** and **TypeScript**.
- Styling is handled via **Tailwind CSS** using a curated dark-glassmorphism theme with custom utility variables.
- Uses **Zustand** for local UI state, **React Hook Form + Zod** for input fields validation, and **TanStack Query** for client caching.
- **Strict Limitation:** Next.js must never make direct database queries, import `@prisma/client`, or run raw SQL commands. All page data fetching must execute through HTTP queries directed to the Express backend.

### B. Backend Architecture (`services/api/`)
- Built using **Node.js**, **Express**, and **TypeScript**.
- Structured as a **Modular Monolith** containing isolated folders representing core business modules under `services/api/src/modules/`.
- Request pipeline: Route -> Middlewares -> Zod Input Validation -> Controller -> Business Service -> Repository -> Prisma ORM -> Supabase PostgreSQL.
- **Strict Limitation:** Controllers must remain extremely thin, mapping requests and return statuses only. Business calculations must reside in Services, and queries must live in Repositories.

### C. Database & Prisma (`database/` & Supabase)
- **Database Engine:** Supabase PostgreSQL.
- **ORM:** Prisma Client.
- **Transactions Connection (`DATABASE_URL`):** Uses transaction pooling via port `6543` for runtime API instances.
- **Direct Connection (`DIRECT_URL`):** Connects directly via port `5432` to allow safe migration execution.

### D. Docker Configurations
- Production-grade multi-stage Dockerfiles:
  - `infrastructure/docker/api.Dockerfile` built on Node 18 Alpine.
  - `infrastructure/docker/web.Dockerfile` optimized Next.js runtime.
- Compose orchestrator:
  - `docker-compose.yml`: Spins up production containers connecting directly to Supabase databases. No local PG is generated.
  - `docker-compose.dev.yml`: Mounts directories locally for hot reloading during development.

### E. npm Workspace & Turborepo
- The monorepo uses npm workspaces configured in the root `package.json` file.
- Turborepo (`turbo.json`) manages cache files and optimizes tasks pipelines (`npm run dev`, `npm run build`, `npm run lint`, `npm run test`, `npm run typecheck`).

### F. CI/CD Pipeline
- **Continuous Integration (`ci.yml`):** Runs on PRs to `stage` and `main` branches. Validates Prisma schema, runs eslint lints, executes typechecking, runs Jest unit tests, and verifies production compilation builds.
- **Staging Pipeline (`staging.yml`):** Triggered on pushes to the `stage` branch. Runs staging Prisma migrations and deploys staging builds.
- **Production Pipeline (`production.yml`):** Triggered on pushes to the `main` branch. Targets the production environment and requires manual Technical Lead approval before deploying.

---

## 5. Development Workflows & Governance

### A. Git Branching Progression
- Branches move strictly from developer feature branches up to production:
  `feature/name/desc` -> `assign/[fardeen | siddhi]` -> `stage` -> `main`
- Merge requests targeting `stage` require PR submissions, successful CI validation pipelines, and area owner approvals.
- Code promotion from `stage` to `main` is handled via technical lead promotion PRs.

### B. Team Area Ownership
- **Technical Lead:** Infrastructure, Turborepo settings, CI/CD settings, general governance.
- **Siddhi:** `/database/` folder. Relational designs, seeds, and migrations validation.
- **Fardeen:** Monolith module routes, controllers, services, and Next.js frontend pages.

### C. Folder Ownership Constraints
- **What belongs in `packages/validation/`:** Shared Zod input verification schemas (e.g. auth login, products validation).
- **What MUST NOT be placed in `packages/validation/`:** Database client wrappers, Express middleware configurations.
- **What belongs in `services/api/src/modules/`:** Domain controllers, repository methods, business services, local routes, and unit tests.
- **What MUST NOT be placed in `services/api/src/modules/`:** Raw page layout components or HTML templates.

### D. Database Migration Guideline
1. Modify `database/prisma/schema.prisma`.
2. Generate local migrations via `npm run db:migrate`.
3. Check migrations SQL file safety under `database/prisma/migrations/`.
4. Run `npm run db:seed` to verify seeding compatibility.
5. Merge branch using PR reviewed and approved by Siddhi.

### E. Coding Standards
- **Zero TypeScript Compiler Errors:** A strict compiler is enabled project-wide. Any compiler check failure breaks the CI pipeline and blocks PR merges.
- **JSON Standard API responses:** All endpoints must output standard payloads conforming to `@plinth/types` (`ApiResponse<T>` / `ApiErrorResponse`).
- **Input Validation:** All controller entry points must enforce Zod validation middlewares.
