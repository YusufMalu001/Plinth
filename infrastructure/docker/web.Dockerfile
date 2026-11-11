# ==============================================================================
# PLINTH ERP - NEXT.JS WEB FRONTEND DOCKERFILE
# ==============================================================================

# --- Stage 1: Build ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install runtime libraries needed during the web build. Lifecycle scripts are
# disabled below, so native compiler toolchains are not needed in this stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace configurations
COPY package.json package-lock.json turbo.json ./

# Copy all package configurations for workspace dependency resolution
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/
COPY services/api/package.json ./services/api/
COPY database/package.json ./database/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Set environment variables for build compilation
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build web frontend
RUN npx turbo run build --filter=@plinth/web

# --- Stage 2: Runtime ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH="/app/node_modules/.bin:$PATH"

# Copy built application and required configuration
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

WORKDIR /app/apps/web
CMD ["npm", "start"]
