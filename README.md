# Synergy ERP - Workspace Foundation

Synergy ERP is a production-grade, highly scalable enterprise resource planning platform boilerplate designed for multi-developer team collaboration.

## 🚀 Quick Start Guide

### 1. Requirements
Ensure you have the following packages installed on your local development machine:
- **Node.js:** `22.x`
- **npm:** `>=9.0.0`
- **Docker & Docker Compose** (for containerized execution)
- **Git**

### 2. Environment Configurations Setup
Copy the template configuration file to `.env` in the root folder:
```bash
cp .env.example .env
```
Fill in the values in `.env` (such as JWT_SECRET and the transaction/direct URLs referencing your Supabase development database).

### 3. Installation
Install all workspaces dependencies:
```bash
npm install
```

### 4. Database Setup & Client Generation
Run migrations and generate the type-safe Prisma client:
```bash
# Generate Prisma Client
npm run db:generate

# Apply migrations to development database (optional, runs prisma migrate dev)
npm run db:migrate

# Seed database with default admin/manager/employee users
npm run db:seed
```

### 5. Running the Application Locally

#### Option A: Running directly on Node.js (via Turborepo)
Launch both Next.js frontend and Express backend concurrently:
```bash
npm run dev
```
- **Next.js Web App:** http://localhost:3000
- **Express Backend API:** http://localhost:5000/api/v1/health

#### Option B: Running via Docker Compose
To compile production-grade containers locally:
```bash
docker compose up --build
```
To run in development mode with bind mounts (for live hot reloading):
```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 🛠️ Technology Stack & Layer Boundaries

### Frontend
- **Framework:** Next.js (App Router), React, TypeScript.
- **Styling:** Tailwind CSS, shadcn/ui.
- **Rules:** Next.js must never make direct database queries or import `@prisma/client`. All data fetching must go through HTTP queries directed to the Express backend API.

### Backend
- **Framework:** Express, TypeScript, Node.js.
- **Database ORM:** Prisma ORM connecting to Supabase PostgreSQL.
- **Architecture:** Modular monolith. Services map requests as Route -> Validation -> Controller -> Business Service -> Repository -> Database.

### Shared Utility Packages
- `@synergy/config`: TS compiler config templates.
- `@synergy/eslint-config`: Project-wide linting standards.
- `@synergy/types`: Shared TS models and interface shapes.
- `@synergy/validation`: Shared input parsing schemas using Zod.
- `@synergy/ui`: Base UI styling primitives and utilities.

---

## 📦 Directory Structure Map
For an exhaustive explanation of the workspace folder layout, directories, and folder boundary limits, refer to the master [structure.md](file:///home/fardeen/Documents/aleyx-projects/Synergy/structure.md) file at the repository root.

---

## 🤝 Team Area Ownership
- **Technical Lead:** Infrastructure, Turborepo tasks, CI/CD pipelines, package configurations.
- **Siddhi (@siddhi-database-developer):** Database layer (`database/` and Prisma schemas, indexing, seeds, migrations validation).
- **Fardeen (@fardeen-dev):** Monolith module controllers, routes, service helpers, and Next.js frontend pages.

---

## 🔄 Development Git Workflow & CI/CD
- **Branch Strategy:** feature branches -> `assign/[fardeen | siddhi]` -> `stage` -> `main`.
- **Protected Branches:** Direct pushes to `stage` and `main` are disabled. All merges require Pull Request approval, CI pipelines compliance, and area owner approvals.
- **CI Pipeline (`ci.yml`):** Runs on PRs to check lints (`npm run lint`), TypeScript checks (`npm run typecheck`), Jest unit tests (`npm run test`), and build tests (`npm run build`).
- **Staging Deploy (`staging.yml`):** Automatically deploys staging builds on push to the `stage` branch.
- **Production Deploy (`production.yml`):** Runs on push to the `main` branch. Deploys production builds upon manual Technical Lead review and approval.

---

## 🧠 Decision Intelligence

The optional intelligence control plane is documented in the [architecture decision](file:///home/fardeen/Documents/aleyx-projects/Synergy/docs/architecture/adr-007-intelligence-control-plane.md), [implementation guide](file:///home/fardeen/Documents/aleyx-projects/Synergy/docs/implementation/intelligence-control-plane.md), [local test guide](file:///home/fardeen/Documents/aleyx-projects/Synergy/docs/operations/intelligence-local-test.md), and [production rollout runbook](file:///home/fardeen/Documents/aleyx-projects/Synergy/docs/operations/intelligence-rollout.md). Provider-backed analysis and schedules stay disabled by default; local event handling can create review-only low-stock PO drafts without calling an AI provider. Do not enable live provider calls until the rollout gates are signed off.

---

## 💻 Local Development & Runtime Execution Guide

### 1. One-Command Local Launcher
The standard `npm run dev` script runs [scripts/dev-local.sh](file:///home/fardeen/Documents/aleyx-projects/Synergy/scripts/dev-local.sh), which automates the full local environment:
1. Provisions local PostgreSQL via `docker compose -f docker-compose.dev.yml up -d postgres` and verifies health check readiness.
2. Generates the Prisma client (`npm run db:generate`) and applies pending schema migrations (`npm run db:deploy`).
3. Seeds initial demo master data & user accounts (`npm run db:seed`).
4. Boots the Express API (`:5000`), Next.js Web frontend (`:3000`), and—when intelligence event triggers are enabled—the Hermes event worker against the same local database.

The local environment enables event processing for automatic low-stock PO drafts. Provider calls and scheduled Hermes runs remain disabled unless separately enabled. The worker creates a draft PO and notifies procurement owners when available stock reaches the configured safety buffer; it does not send the PO to a vendor.

```bash
npm run dev
```

### 2. Application Access & Ports
- **Next.js Web Application:** [http://localhost:3000](http://localhost:3000)
- **Decision Center:** [http://localhost:3000/decision-center](http://localhost:3000/decision-center)
- **Express Backend API Health:** [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)

### 3. Default Seed Credentials
After running the database seed scripts, use the following credentials to authenticate:
- **Admin:** `admin@synergy.local` / `Admin@123456`
- **Manager:** `manager@synergy.local` / `Manager@123456`
- **Employee:** `employee@synergy.local` / `Employee@123456`

### 4. Running the Background Intelligence Worker
To consume domain outbox events and process background analytical jobs:
```bash
npm run dev:worker --workspace=@synergy/api
```

### 5. Running the Intelligence Container Stack
To start the containerized environment with the six Synergy advisor profiles (Executive, Sales, Inventory, Procurement, Production, Fulfillment):
```bash
# Configure the model provider key and conservative budget settings in .env.
# Launch the full stack with the intelligence compose profile.
docker compose --profile intelligence up -d --build

# Inspect status of running agent containers
docker compose ps
```

## Updating an existing local checkout

After every pull/merge, stop the API and worker processes (Ctrl+C in their terminals), then run this from the repository root:

```powershell
npm run db:sync
```

If dependencies changed, run `npm ci` first. Ensure root `.env` points to the intended database and PostgreSQL is running. The command automatically uses pinned Node 22.23.4 through npm (downloaded on first use and then cached); it does not replace system Node.

The command validates the Prisma schema, applies pending committed migrations, regenerates Prisma Client, and verifies migration status. It stops immediately on any failure. It never resets the database, seeds data, or creates new migrations. Database connectivity, invalid migrations, and Windows file locks can still cause errors; fix the reported cause before retrying.

After success, restart/rebuild the API and workers to load the generated client. On Windows, if generation reports a locked Prisma file, stop the project API/workers, rerun the command, then restart them. Plain Git commands do not run database synchronization automatically.

### Native Windows development

Use Node 22.x for application processes. After synchronization, run `npm run dev --workspace=@synergy/api` and `npm run dev --workspace=@synergy/web` in separate terminals. The root `npm run dev` launcher requires Bash and Docker and includes database sync. Use the ports configured in `.env`; this Windows setup uses PostgreSQL 5000, API 5001 and web 3000.
