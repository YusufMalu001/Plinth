# Branching Strategy & Naming Conventions

Plinth ERP enforces a strict branch architecture to ensure code security and team coordination.

## Official Branches

### 1. `main` (Production Branch)
- **Status:** Protected. No direct pushes.
- **Content:** Production-ready code.
- **Deploys:** Commits trigger production CI and deployment (which requires Technical Lead approval).

### 2. `stage` (Staging Integration Branch)
- **Status:** Protected. No direct pushes.
- **Content:** Pre-release code containing all merged developer branches. Used for testing and QA.
- **Deploys:** Commits trigger automatic staging deployment.

### 3. Developer Integration Branches (`assign/*`)
- `assign/fardeen`: Active integration branch for Fardeen.
- `assign/siddhi`: Active integration branch for Siddhi.
- **Usage:** Developers push features here, test their local integration, and periodically rebase/merge `stage` into these branches to prevent divergence.

### 4. Feature Branches (`feature/*`)
- Format: `feature/[developer-name]/[short-description]`
- Example: `feature/fardeen/inventory-list`
- Created from and merged back to their respective `assign/*` branch.

## Branch Divergence Prevention

To prevent conflicts and large divergence, developers must regularly fetch and merge from the shared `stage` branch:
```bash
git fetch origin
git checkout assign/fardeen
git merge origin/stage
```
Resolve any conflicts locally, verify with `npm run typecheck`, and push back to your branch.
