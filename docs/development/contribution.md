# Contribution Guidelines

This document details the quality standards that all developers must satisfy before merging code into Plinth ERP.

## Coding Conventions

### 1. TypeScript Rules
- Strict TypeScript configuration is enabled project-wide.
- **Rule:** Zero TypeScript compiler errors are permitted. `npm run typecheck` must pass before pushing.
- **No shortcut `any`:** Avoid using `any` to bypass TS types. Define proper shapes or interface declarations.
- **No `@ts-ignore`:** Only use if absolutely unavoidable, and document the rationale in comments.

### 2. Linting & Formatting
- **Linting:** Enforced via ESLint rules configured in `@plinth/eslint-config`.
- **Prettier:** Code should be formatted using Prettier.
- **Verification:** Run `npm run lint` to verify that there are no warnings or errors.

### 3. Testing Expectations
- Run unit/integration tests before submitting PRs.
- Critical operations (such as authentication, permissions, financial values, or API routers) must include Jest tests.

### 4. Pull Request Requirements
Before submitting a PR targeting `stage` or `main`:
1. Verify that your branch compiles locally with `npm run build`.
2. Verify that linter passes: `npm run lint`.
3. Verify that TS checks pass: `npm run typecheck`.
4. Fill in the Pull Request template details (Summary, related issues, validations performed).
5. Address all code review comments.
