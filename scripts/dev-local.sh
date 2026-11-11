#!/usr/bin/env bash
set -Eeuo pipefail

# Local developer launcher. Production/staging continue to use their Docker
# compose files and deployment script; this script only orchestrates the host
# API/web processes against the local Docker PostgreSQL service.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and configure local values first."
  exit 1
fi

# Export only the local configuration file for this process tree. Compose also
# reads .env itself, while the exported values let the health check use custom
# local POSTGRES_USER/POSTGRES_DB values consistently.
set -a
source .env
set +a

# Remote database configured (e.g. hosted Postgres/Neon): skip the local Docker
# PostgreSQL service entirely so dev never collides with past local databases.
if ! echo "${DATABASE_URL:-}" | grep -qE 'localhost|127\.0\.0\.1|@postgres'; then
  echo "DATABASE_URL points at a remote database; skipping local Docker PostgreSQL."
else
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start local PostgreSQL."
  exit 1
fi

compose=(docker compose -f docker-compose.dev.yml)
echo "Starting local PostgreSQL..."
"${compose[@]}" up -d postgres

echo "Waiting for PostgreSQL health..."
ready=false
for _ in {1..30}; do
  if "${compose[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-plinth_erp}" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "PostgreSQL did not become ready. Run: ${compose[*]} logs postgres"
  exit 1
fi
fi

echo "Applying migrations, generating Prisma client, and verifying migration status..."
npm run db:sync

if [[ "${SEED_LOCAL:-false}" == "true" ]]; then
  echo "Seeding local users/master data..."
  npm run db:seed
else
  echo "Skipping local seed data (set SEED_LOCAL=true to opt in)."
fi

# Stop any lingering docker containers or orphaned host processes using our ports.
for web_container in plinth-web plinth-web-dev; do
  if docker ps --format '{{.Names}}' | grep -Fxq "$web_container"; then
    echo "Stopping existing $web_container container so the host web app can use port ${WEB_PORT:-3000}..."
    docker stop "$web_container"
  fi
done

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${WEB_PORT:-3000}/tcp" "${API_PORT:-5000}/tcp" >/dev/null 2>&1 || true
fi
pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Starting API on http://localhost:5000..."
PORT="${API_PORT:-5000}" npm run dev --workspace=@plinth/api &
pids+=("$!")

if [[ "${INTELLIGENCE_ENABLED:-false}" == "true" && "${INTELLIGENCE_EVENT_TRIGGERS_ENABLED:-false}" == "true" ]]; then
  echo "Starting Hermes event worker against the same local database..."
  npm run dev:worker --workspace=@plinth/api &
  pids+=("$!")
fi

echo "Starting web on http://localhost:3000..."
PORT="${WEB_PORT:-3000}" API_PORT="${API_PORT:-5000}" NEXT_PUBLIC_API_URL="http://localhost:${API_PORT:-5000}/api/v1" npm run dev --workspace=@plinth/web &
pids+=("$!")

echo "Plinth local environment is running. Press Ctrl+C to stop API and web."
wait -n "${pids[@]}"
exit $?
