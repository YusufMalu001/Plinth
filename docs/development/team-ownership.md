# Team Ownership & Code Review

Plinth ERP enforces structural ownership to coordinate tasks, protect boundaries, and maintain quality across the development team.

## Team Roles & Ownership Areas

### 1. Technical Lead
- **Scope:** Monorepo infrastructure, Turborepo tasks, CI/CD pipelines, package structures under `packages/`, general review governance.
- **Responsibility:** Reviewing production promotion PRs, approving pipeline changes, and maintaining deployment secrets.

### 2. Siddhi (Database Lead / Developer)
- **Scope:** `/database/` folder (Prisma schema, migrations, relational integrity, seeds, indexing).
- **Responsibility:** Siddhi is the primary gatekeeper for database updates. Any PR containing updates to `schema.prisma` or migration SQL files requires Siddhi's review and approval.

### 3. Fardeen (Full-Stack Developer)
- **Scope:** `/apps/web/` and `/services/api/` feature domains.
- **Responsibility:** Building frontend components and views, building backend service methods, controllers, routes, and implementing API integration modules.

## Code Review Expectations
- All code merges targeting the `stage` or `main` branches require at least **one approved review** from the respective area owners.
- Relational schema modifications require approval from Siddhi.
- Codeowners rules are enforced automatically in `.github/CODEOWNERS` to add reviewers based on the files touched.
- Direct pushes to protected branches are disabled at the GitHub repository settings.
