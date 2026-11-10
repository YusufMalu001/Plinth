# Local development

## Recommended one-command startup

The local workflow runs PostgreSQL in Docker and the API/web processes on the host:

```bash
npm run dev
```

The launcher starts PostgreSQL, waits for its health check, generates Prisma Client, applies migrations, seeds the default local users, then starts:

- Web: `http://localhost:3000`
- API: `http://localhost:5000`
- PostgreSQL: `localhost:55432`

Use `SEED_LOCAL=false npm run dev` to skip the seed step. Use `SEED_FULL=true` with the database seed command when the full fixture catalogue is required for workflow testing.

## First-time setup

```bash
cp .env.example .env
# Set local JWT secrets and local database values in .env.
npm install
npm run dev
```

The API fails fast if PostgreSQL is unavailable. This is intentional: it prevents a running-looking API from accepting login requests that later hang and time out.

## Alternative all-Docker startup

To run API, web, and PostgreSQL inside Docker, use the production-style compose file:

```bash
docker compose up -d --build
docker compose ps
```

Do not mix the Docker web/API containers with host-running API/web processes unless you explicitly configure container-to-host networking. Stop old application containers before switching modes:

```bash
docker compose down
docker compose -f docker-compose.dev.yml down
```

## Troubleshooting

```bash
curl -i http://127.0.0.1:5000/api/v1/health
ss -ltnp | grep -E ':3000|:5000|:55432'
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs postgres
```

If port `55432` is already in use, reuse the existing PostgreSQL container or change `POSTGRES_PORT`, `DATABASE_URL`, and `DIRECT_URL` together. Never start two containers mapped to the same host port.

The root `npm run dev` is intentionally separate from `npm run dev:turbo`; this avoids passing the API's `PORT=5000` to Next.js and avoids duplicate API/web processes.
