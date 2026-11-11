# Plinth ERP — Complete Local Setup Guide (Windows Native)

This guide documents the exact, step-by-step procedure to set up, migrate, seed, and run **Plinth ERP** from a fresh `git clone` on Windows using a local PostgreSQL service (without requiring Docker or WSL).

---

## 1. Prerequisites Check

Before starting, ensure the following are installed on your Windows machine:

- **Node.js**: `v22.x` or `v24.x` (check with `node -v`)
- **npm**: `v9.x` or `v11.x` (check with `npm -v`)
- **Git**: (check with `git -v`)
- **PostgreSQL 18** (or 16+): Installed as a Windows Service (`postgresql-x64-18`).
  - *Note:* In our setup, PostgreSQL is configured to listen on **Port 5000** with superuser `postgres`.

---

## 2. Clone the Repository & Switch to Your Branch

Open PowerShell and run:

```powershell
git clone https://github.com/plinth-erp/plinth-erp.git
cd plinth-erp
git switch assign/akash
```

Configure Git so it does not pause or block waiting for an editor during pulls:
```powershell
git config core.mergeoptions "--no-edit"
```

---

## 3. Install All Monorepo Dependencies

Install dependencies for all workspaces (`apps`, `services`, `packages`, `database`):

```powershell
npm install
```

---

## 4. Create the PostgreSQL Database

Using `psql.exe`, connect to your local PostgreSQL instance on port `5000` and create the `plinth_erp` database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -p 5000 -c "CREATE DATABASE plinth_erp;"
```
*(Enter your PostgreSQL password when prompted, e.g. `Akash.2003`)*.

---

## 5. Configure Environment Variables

### Root `.env`
Create `.env` in the root directory (`c:\plinth-erp\.env`):

```ini
# ==============================================================================
# PLINTH ERP - LOCAL ENVIRONMENT CONFIGURATION (.env)
# ==============================================================================

NODE_ENV=development

# Backend API Port (Port 5001 avoids conflict with PostgreSQL running on 5000)
PORT=5001
API_PORT=5001
API_HOST_PORT=5001
WEB_PORT=3000
WEB_HOST_PORT=3000
API_VERSION=v1

# JWT Security
JWT_SECRET=your_jwt_secret_must_be_long_and_secure_at_least_32_characters
JWT_REFRESH_SECRET=your_jwt_secret_must_be_long_and_secure_at_least_32_characters
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
WEB_ORIGIN=http://localhost:3000

# Database Configuration (Local Windows PostgreSQL 18 on port 5000)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Akash.2003
POSTGRES_DB=plinth_erp
POSTGRES_PORT=5000
DATABASE_URL="postgresql://postgres:Akash.2003@localhost:5000/plinth_erp?schema=public&connection_limit=20"
DIRECT_URL="postgresql://postgres:Akash.2003@localhost:5000/plinth_erp?schema=public"

# Frontend configurations
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase Storage
SUPABASE_URL=https://jvvnozejrkgjkreijdfe.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_key_here
SUPABASE_PRODUCT_BUCKET=plinth-product-images
SUPABASE_STORAGE_BUCKET=goods-receipts

# OpenRouter / Gemini LLM & OCR
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_OCR_MODEL=openrouter/free
OPENROUTER_VENDOR_MODEL=openrouter/free
OPENROUTER_TIMEOUT_MS=30000
OCR_TIMEOUT_MS=90000
OPENROUTER_MONTHLY_BUDGET_USD=100

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_OCR_MODEL=gemini-3.6-flash
OCR_PROVIDER=gemini

# Email (Resend SMTP)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=your_resend_api_key_here
EMAIL_FROM_ADDRESS=onboarding@resend.dev
EMAIL_FROM_NAME="Plinth International"

# Decision Intelligence
INTELLIGENCE_ENABLED=true
INTELLIGENCE_PROVIDER_ENABLED=true
INTELLIGENCE_SHADOW_MODE=true
INTELLIGENCE_EVENT_TRIGGERS_ENABLED=false
INTELLIGENCE_SCHEDULES_ENABLED=false
INTELLIGENCE_NOTIFICATIONS_ENABLED=false
INTELLIGENCE_CASES_ENABLED=true
INTELLIGENCE_SCENARIOS_ENABLED=true
INTELLIGENCE_CONVERSATIONS_ENABLED=true
INTELLIGENCE_DELEGATION_ENABLED=true

INTELLIGENCE_MODULE_MODEL=nvidia/nemotron-3-super-120b-a12b:free
INTELLIGENCE_EXECUTIVE_MODEL=nvidia/nemotron-3-super-120b-a12b:free
INTELLIGENCE_FALLBACK_MODEL=nvidia/nemotron-3.5-lightning:free
INTELLIGENCE_FREE_ONLY=true
INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE=true
INTELLIGENCE_MONTHLY_BUDGET_USD=5
INTELLIGENCE_INPUT_COST_PER_MILLION_USD=0
INTELLIGENCE_OUTPUT_COST_PER_MILLION_USD=0
INTELLIGENCE_MAX_CONCURRENT_RUNS=1
INTELLIGENCE_MAX_TOOL_CALLS=5
INTELLIGENCE_MAX_OUTPUT_TOKENS=4096
INTELLIGENCE_MCP_MAX_RESPONSE_BYTES=65536
INTELLIGENCE_MIN_COST_COVERAGE=0.8
INTELLIGENCE_MIN_DATA_QUALITY=0.8

# Intelligence Runtime Keys & MCP Tokens
INTELLIGENCE_EXECUTIVE_RUNTIME_KEY=8a719bdc5b44bed0e4573671019cd3d4a0c3507831912af994d1813209b335b1
INTELLIGENCE_EXECUTIVE_MCP_TOKEN=executive-advisor.87e1858f46e428cd375fe741d9e51bcb4031411834fe232e96590292511f1738
INTELLIGENCE_SALES_RUNTIME_KEY=6c7dc9d3710782b9cbe958827e72f48aa9072e358709fba86a2e1f9196d37081
INTELLIGENCE_SALES_MCP_TOKEN=sales-advisor.b9f786f98765d567ca3f1474034bb3205a93c2b442961f3131407f385e086e6c
INTELLIGENCE_INVENTORY_RUNTIME_KEY=c08c73416ae2fb41b3b0271f632c6359f8ac1a39d11bdc3dc4c4ea5e6c48ed18
INTELLIGENCE_INVENTORY_MCP_TOKEN=inventory-advisor.8704e28572a1a1c5743198f8a39ad15991cd53a646a7baa19ca39d24a94f382c
INTELLIGENCE_PROCUREMENT_RUNTIME_KEY=426cd422546c2fe86fc6fcddd35c1194c1ac5fc44735868015c70a20e4008250
INTELLIGENCE_PROCUREMENT_MCP_TOKEN=procurement-advisor.8f09ca7cb8524bf4091b56a081f75a5adf6c33538dde892c485c0f00493d11b0
INTELLIGENCE_PRODUCTION_RUNTIME_KEY=c8a39bf9c924accea18df697c88427650dd4ae7d4e90c1adfbe295957ff09b13
INTELLIGENCE_PRODUCTION_MCP_TOKEN=production-advisor.b6b18c48a33d30a6ac6d2dd74e3a38695fc555df24d00c427304e0cf71dabacd
INTELLIGENCE_FULFILLMENT_RUNTIME_KEY=ee1bc3fb3a8eeafc19d211a5a5762beb9023e0b3dea9fb8ef98c381d0607acd4
INTELLIGENCE_FULFILLMENT_MCP_TOKEN=fulfillment-advisor.7561029bb8a55175ca5f5e19a4da2b4017dfe26bd10a0f84230d18d677344ce2
```

### Frontend `.env.local`
Create `apps/web/.env.local`:
```ini
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 6. Build Shared Packages & Generate Prisma Client

Build the shared monorepo packages first, then generate the Prisma client:

```powershell
npm run build --workspace=@plinth/types
npm run build --workspace=@plinth/ui
npm run build --workspace=@plinth/validation
npm run db:generate
```

---

## 7. Apply Database Migrations & Sync Schema

1. Apply all versioned migrations:
   ```powershell
   npm run db:deploy
   ```

2. Sync all remaining models (e.g. assembly batches, finished goods receipts):
   ```powershell
   npx dotenv-cli -e .env -- npx prisma db push --schema=database/prisma/schema.prisma --accept-data-loss
   ```

3. Verify status:
   ```powershell
   npx dotenv-cli -e .env -- npx prisma migrate status --schema=database/prisma/schema.prisma
   ```
   *(Should output: `Database schema is up to date!`)*

---

## 8. Seed Master Data, Catalogs & Test Users

Run the comprehensive seeder to populate all 11 ERP modules (21,000+ HSN codes, opening inventory, routes, BOMs, users):

```powershell
# 1. Seed complete ERP master data (users, products, inventory, production, sales, logistics)
npm run db:seed-all --workspace=@plinth/database

# 2. Seed Finance / Accounts RBAC & Test User
npm run db:seed-accounts-rbac --workspace=@plinth/database
npm run db:seed-accounts-test-user --workspace=@plinth/database
```

---

## 9. Start the Development Servers

> **Important**: Do not run `npm run dev` directly on Windows, as it calls a Linux bash script (`scripts/dev-local.sh`). Use `npm run dev:turbo` instead.

Run in PowerShell:

```powershell
npm run dev:turbo
```

Turborepo will start both services in parallel:
- **Frontend Web Application**: [http://localhost:3000](http://localhost:3000)
- **Backend Express API**: [http://localhost:5001](http://localhost:5001)
  *(API Health check: [http://localhost:5001/api/v1/health](http://localhost:5001/api/v1/health))*

---

## 10. Open in Browser & Log In

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

Enter the seeded credentials:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin@gmail.com` *(or `admin@plinth.com`)* | `password123` |
| **Store Manager** | `manager@plinth.com` | `password123` |
| **Sales Executive** | `sales@plinth.com` | `password123` |
| **Production Head** | `production.head@plinth.com` | `password123` |
| **Accounts / Finance** | `accounts.test@plinth.local` | `SynwTzRNbS_oXi0gPmNf1O03FoU!` |

---

## 11. Troubleshooting Common Windows Issues

### Issue 1: Port Conflict (`EADDRINUSE 5000` or `EADDRINUSE 3000`)
- **Port 5000**: Used by your local PostgreSQL service. Keep API on `PORT=5001` in `.env`.
- **Port 3000 / 5001 already in use**:
  Check which process is holding it and kill it:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000, 5001 -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
  Stop-Process -Id <OwningProcessId> -Force
  ```

### Issue 2: `'NODE_ENV' is not recognized as an internal or external command`
- Ensure `services/api/package.json` line 9 is:
  ```json
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts"
  ```
  *(Without bash-specific `NODE_ENV=development` prefix)*.

### Issue 3: `hint: Waiting for your editor to close the file...` on `git pull`
- Run:
  ```powershell
  git config core.mergeoptions "--no-edit"
  ```
