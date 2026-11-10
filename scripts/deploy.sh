#!/usr/bin/env bash
# ==============================================================================
# SYNERGY ERP - VPS DEPLOYMENT & UPDATE SCRIPT
# ==============================================================================
# Usage: ./scripts/deploy.sh [branch_name]
# Default branch: main
# ==============================================================================
set -e

BRANCH="${1:-main}"

echo "🚀 [Synergy ERP] Starting deployment sequence for branch: ${BRANCH}..."

# 1. Pull latest code if in a git repository
if [ -d ".git" ]; then
  echo "📥 Fetching git changes from origin/${BRANCH}..."
  git fetch origin "${BRANCH}"
  if [ -n "${DEPLOY_REF:-}" ]; then
    git checkout --detach "${DEPLOY_REF}"
  else
    git checkout "${BRANCH}"
    git pull origin "${BRANCH}"
  fi
fi

# 2. Verify .env file exists
if [ ! -f ".env" ]; then
  echo "⚠️ Warning: .env file not found in current directory! Please create one based on .env.example."
fi

# Configure Docker Compose command (Staging vs Production)
if [ "$BRANCH" = "stage" ]; then
  COMPOSE_CMD="docker compose -f docker-compose.staging.yml"
else
  COMPOSE_CMD="docker compose"
fi

# 3. Build and start containers
echo "📦 Building and starting Docker containers with ${COMPOSE_CMD}..."
if [ "${REQUIRE_PREBUILT_IMAGES:-0}" = "1" ]; then
  : "${API_IMAGE:?API_IMAGE is required for prebuilt-image deployment}"
  : "${WEB_IMAGE:?WEB_IMAGE is required for prebuilt-image deployment}"
fi

if [ -n "${API_IMAGE:-}" ] && [ -n "${WEB_IMAGE:-}" ]; then
  ${COMPOSE_CMD} pull api web
  ${COMPOSE_CMD} up -d --no-build --remove-orphans
else
  ${COMPOSE_CMD} up -d --build --remove-orphans
fi

# 4. Wait for PostgreSQL container healthcheck
echo "⏳ Waiting for PostgreSQL database to be healthy..."
until ${COMPOSE_CMD} exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; do
  sleep 2
done
echo "✅ Database is ready."

# 5. Run Prisma database migrations
echo "🔄 Running Prisma database migrations..."
${COMPOSE_CMD} exec -T api npx prisma migrate deploy --schema=/app/database/prisma/schema.prisma
# 6. Check container statuses
echo "📊 Checking container health status:"
${COMPOSE_CMD} ps

echo "🎉 [Synergy ERP] Deployment successfully completed for ${BRANCH}!"
