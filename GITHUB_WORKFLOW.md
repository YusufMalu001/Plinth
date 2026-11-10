# Synergy ERP GitHub Workflow

This guide explains how the Synergy team should create branches, save work, push, pull, merge, resolve conflicts, and use pull requests.

## 🌿 Branching Architecture

```text
Feature Branches (assign/*)  --->  Pull Request  --->  'stage' (Development / Staging)
                                                               │
                                                       (Review & Verify)
                                                               │
                                                               ▼
                                                     'main' (Production)
                                                               │
                                                  (Automated VPS CD Deploy)
```

- **`main` (Production Branch)**:
  - Contains strictly production-ready code.
  - Deploys automatically to the production VPS via GitHub Actions CD.
  - Direct pushes are blocked. Merges only come from `stage` via Pull Requests with administrator approval.
- **`stage` (Staging / Development Branch)**:
  - The shared active development branch where all team features land.
  - All CI checks (linting, typechecking, tests, build) run automatically on PRs to `stage`.
- **`assign/<developer>/<task>` (Feature Branches)**:
  - Developers branch off `stage` to do their work.
  - Completed work is submitted via Pull Request into `stage`.

Branch examples:

```text
assign/fardeen/fix-procurement
assign/yusuf/vendor-history
assign/sidhi/login-ui
```

## Check your state first

Before switching branches, pulling, or merging:

```bash
git status
git branch --show-current
```

Do not leave important uncommitted changes before switching branches.

## Start a task (from `stage`)

```bash
git switch stage
git pull --ff-only origin stage
git switch -c assign/fardeen/my-task
```

The `--ff-only` option prevents accidental merge commits on local `stage`.

## Save work

Review changes before staging:

```bash
git status
git diff
```

Stage specific files when possible:

```bash
git add path/to/file.ts
```

Or review carefully before staging everything:

```bash
git add .
git status
```

Commit focused work:

```bash
git commit -m "Add procurement approval panel"
```

Never commit `.env`, passwords, API keys, tokens, or private keys.

## Push to GitHub

For a new branch:

```bash
git push -u origin assign/fardeen/my-task
```

For later commits:

```bash
git push
```

Do not force-push `main` or a teammate's branch.

## Update your task branch

Prefer explicit commands:

```bash
git fetch origin
git switch assign/fardeen/my-task
git merge origin/main
```

Then run checks and push:

```bash
npm install
npm run db:generate
npm run lint
npm run typecheck
npm run test
git push
```

Definitions:

```text
git fetch       downloads remote information; does not change your files
git merge       combines another branch into your current branch
git pull        fetches and then merges (or rebases) automatically
```

For this team, merge `origin/main` into task branches. Do not rebase shared branches unless the team agrees.

Optional one-time configuration:

```bash
git config --global pull.rebase false
```

## Uncommitted work before a branch switch

Commit unfinished but meaningful work:

```bash
git add .
git commit -m "WIP: describe current progress"
```

Or temporarily stash it:

```bash
git stash push -u -m "temporary work before branch switch"
git switch main
git stash list
git stash pop
```

Only restore a stash when the working tree is otherwise clean.

## Resolve merge conflicts

Inspect the conflict:

```bash
git status
git diff --name-only --diff-filter=U
```

Source conflicts contain markers:

```text
<<<<<<< HEAD
your current branch
=======
incoming branch
>>>>>>> origin/main
```

Edit source files to keep or combine the correct code, remove the marker lines, and stage the file:

```bash
git add path/to/resolved-file.ts
```

Use one side for a file when appropriate:

```bash
git restore --ours path/to/file
git add path/to/file

git restore --theirs path/to/file
git add path/to/file
```

Check that no conflicts remain:

```bash
git diff --name-only --diff-filter=U
```

When it prints nothing, complete the merge:

```bash
git commit
```

In the editor, Accept Current means your branch, Accept Incoming means `main`, and Accept Both combines both sections.

## Generated files

Never manually merge generated cache files such as:

```text
apps/web/tsconfig.tsbuildinfo
.next/
node_modules/
```

For the repeated `tsconfig.tsbuildinfo` conflict, choose one copy:

```bash
git restore --ours apps/web/tsconfig.tsbuildinfo
git add apps/web/tsconfig.tsbuildinfo
git commit
```

The team should remove generated cache files from Git tracking and add them to `.gitignore`; otherwise they will continue causing conflicts.

## Cancel a confusing merge

If the merge has not been committed:

```bash
git merge --abort
```

Avoid `git reset --hard`; it can delete uncommitted work.

## Pull requests

Before opening or updating a pull request:

```bash
git status
git fetch origin
git merge origin/main
npm install
npm run db:generate
npm run lint
npm run typecheck
npm run test
git push
```

The pull request should explain what changed, why, how it was tested, and whether a database migration is required. Merge only after CI and required reviews pass.

After the pull request is merged:

```bash
git switch main
git pull --ff-only origin main
git branch -d assign/fardeen/my-task
```

## Diverged branches

If Git says a branch is ahead and behind:

```bash
git fetch origin
git status -sb
git rev-list --left-right --count HEAD...origin/your-branch
```

For a personal branch:

```bash
git merge origin/your-branch
git merge origin/main
git push
```

If the work is already merged into `main`, create a fresh task branch from updated `main`.

## Prisma and Supabase safety

Git operations do not deploy database changes. The team shares Supabase, so only the designated database owner should apply reviewed migrations.

Safe local type generation:

```bash
npm run db:generate
```

Do not run these against shared Supabase:

```bash
npx prisma migrate dev
npx prisma migrate reset
npm run db:seed
```

Migration process:

1. Create and commit a migration on a task branch.
2. Review it in the pull request.
3. Have the database owner apply it with:

```bash
npm run db:deploy
```

Never paste database credentials into GitHub or chat. Rotate credentials if exposed.

## Checks before every push

```bash
git status
git diff --check
npm run db:generate
npm run lint
npm run typecheck
npm run test
git status
```

The final status must not contain unresolved paths.

## Quick reference

```bash
# New task
git switch main
git pull --ff-only origin main
git switch -c assign/fardeen/my-task

# Publish
git add .
git commit -m "Describe the change"
git push -u origin assign/fardeen/my-task

# Update task branch
git fetch origin
git merge origin/main

# Finish a generated-file conflict
git restore --ours apps/web/tsconfig.tsbuildinfo
git add apps/web/tsconfig.tsbuildinfo
git commit
```

