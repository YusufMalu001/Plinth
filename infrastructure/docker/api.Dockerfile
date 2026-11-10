# ==============================================================================
# SYNERGY ERP - API BACKEND DOCKERFILE
# ==============================================================================

# --- Stage 1: Build ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install system libraries needed by Prisma, argon2, and native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace configurations
COPY package.json package-lock.json turbo.json ./

# Copy all package configurations for workspace dependency resolution
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/ui/package.json ./packages/ui/
COPY services/api/package.json ./services/api/
COPY database/package.json ./database/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy all source files
COPY packages/ ./packages/
COPY database/ ./database/
COPY services/api/ ./services/api/

# Generate Prisma client
WORKDIR /app
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Build packages and API service
RUN npx turbo run build --filter=@synergy/api...

# --- Stage 2: Runtime ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy built artifacts and node_modules from builder
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/database ./database
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/package.json ./services/api/

EXPOSE 5000

WORKDIR /app/services/api
CMD ["node", "dist/server.js"]
