# Git Workflow & Release Promotion

This document details how code transitions from development to staging and eventually production.

## Branch Progression Pipeline

```
                 DEVELOPER FEATURE BRANCHES
                (feature/fardeen/inventory)
                            │
                            ▼
                    DEVELOPER BRANCHES
             ┌──────────────┴──────────────┐
             ▼                             ▼
       assign/fardeen                assign/siddhi
             └──────────────┬──────────────┘
                            │
                            ▼ (Pull Request + CI Check)
                          stage
                            │
                            ▼ (Automatic Staging Deploy)
                    QA & Staging Testing
                            │
                            ▼ (Promotion PR + Approval)
                          main
                            │
                            ▼ (Manual Lead Approval)
                     Production Deploy
```

## Step-by-Step Flow

### 1. Feature Development
Developers check out feature branches from their assigned developer branch:
```bash
git checkout assign/fardeen
git checkout -b feature/fardeen/inventory-filters
```

### 2. Integration into Developer Branch
After completing changes, merge features back to the main developer branch:
```bash
git checkout assign/fardeen
git merge feature/fardeen/inventory-filters
```

### 3. Submission to Stage
Merge developer branches to the shared `stage` integration branch.
- **Rules:** Never push directly to `stage`. Create a Pull Request (PR) from `assign/fardeen` to `stage`.
- **Requirements:** CI checks (linting, typechecking, tests, build) must pass, and at least one team member must approve.

### 4. Promotion to Production (main)
Once QA testing on stage is completed successfully, a Promotion PR is created from `stage` to `main`.
- **Rules:** Only Technical Leads can approve production merges. CI pipeline must pass without errors.
- **Deploys:** Triggers the production deployment pipeline, which requires manual approval in the GitHub UI before running.
