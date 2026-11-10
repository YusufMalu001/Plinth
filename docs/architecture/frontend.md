# Frontend Architecture - Next.js App

The Synergy ERP frontend is built using Next.js, leveraging modern client-side interaction frameworks and strict TypeScript constraints.

## Tech Stack
- **Framework:** Next.js (React Server Components and App Router).
- **Styling:** Tailwind CSS + custom glassmorphism design variables.
- **Component Primitives:** shadcn/ui.
- **State Management:** Zustand (global application state) and React Hook Form + Zod (form/validation states).
- **Data Querying:** TanStack React Query (caching and syncing server state).

## Directory Structure

Under `apps/web/src/`:
- `app/`: Next.js App Router folders, layouts, pages, and global stylesheets.
- `components/`: Global shared UI components (layout layouts, common buttons, data tables, modals).
- `features/`: Placeholders for core business domains (e.g. `inventory`, `sales`, `finance`). Custom sub-components, pages, and hooks specific to these domains must live inside these folders to prevent global clutter.
- `hooks/`: Reusable react hooks (e.g. `useMediaQuery`, `useDebounce`).
- `lib/`: Standard utility wrappers (e.g. `fetch` client configuration).
- `services/`: API gateway query fetch functions.
- `stores/`: Zustand global store configurations.
- `types/`: Custom UI-only types (shared API types are imported from `@synergy/types`).

## Data Fetching Guidelines
- All requests should route to the Express API backend (`/api/v1/...`).
- A next rewrite rule is configured in `next.config.js` to map client-side calls to `/api/v1/*` directly to `http://localhost:5000/api/v1/*` in development mode, preventing CORS issues.
- Direct database calls, imports of Prisma, or SQL queries inside Next.js components are **strictly forbidden**.
