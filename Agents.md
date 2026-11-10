# AGENTS.md

# Synergy International — Engineering Agent Instructions

## 1. Purpose

This repository contains the production-grade implementation of **Synergy International**, an integrated ERP/business management platform.

This file defines the mandatory rules, engineering principles, architectural expectations, development workflow, and behavioral constraints that every AI coding agent and developer-assisted coding system must follow when working inside this repository.

The objective is not merely to make features work.

The objective is to build a system that is:

* Production-ready
* Maintainable
* Modular
* Secure
* Observable
* Testable
* Scalable
* Auditable
* Documented
* Easy for multiple developers to understand
* Safe to modify months or years after initial development

Never optimize for "quickly making the feature work" at the expense of architecture, maintainability, security, or correctness.

---

# 2. Core Engineering Principle

Always think in this order:

1. Understand the existing architecture.
2. Understand the business requirement.
3. Identify affected modules.
4. Check existing reusable components/services.
5. Determine data-model implications.
6. Determine API implications.
7. Determine security and permission implications.
8. Determine logging/audit implications.
9. Determine testing requirements.
10. Implement the smallest clean modular solution.
11. Test it.
12. Update documentation.
13. Update project memory when a meaningful architectural decision has been made.

Do not immediately start modifying code.

---

# 3. Existing Code Comes First

Before implementing a new feature:

* Inspect the relevant directory.
* Search for existing implementations.
* Search for existing components.
* Search for existing services.
* Search for existing database models.
* Search for existing API endpoints.
* Search for existing utilities.
* Search for existing validation schemas.
* Search for existing permission checks.
* Search for existing logging mechanisms.
* Search for existing tests.

Never create a duplicate implementation when an appropriate reusable implementation already exists.

If an existing implementation is poor but used by multiple modules, determine whether it should be refactored instead of creating another parallel implementation.

---

# 4. Do Not Guess Existing Behavior

Never assume:

* Database schema
* API response structure
* Authentication behavior
* Authorization rules
* Environment variables
* Third-party API behavior
* Existing business rules
* Deployment configuration
* File locations
* Naming conventions

Inspect the repository first.

If something cannot be determined from the repository or project documentation, explicitly state the uncertainty.

Do not silently invent behavior.

---

# 5. Production-Grade Development Standard

Every implementation should consider:

### Functional correctness

The feature must satisfy the business requirement.

### Security

The implementation must protect:

* Authentication credentials
* API keys
* Access tokens
* Financial information
* Customer information
* Employee information
* Personally identifiable information
* Sensitive business data

### Reliability

The implementation should handle:

* Invalid input
* Missing data
* Database failures
* Network failures
* Third-party API failures
* Timeouts
* Duplicate requests
* Concurrent operations
* Partial failures
* Unexpected states

### Observability

Important operations must generate appropriate:

* Logs
* Errors
* Metrics where applicable
* Audit events where applicable
* Request identifiers/correlation identifiers

### Maintainability

Code should be:

* Modular
* Readable
* Predictable
* Testable
* Properly named
* Properly documented

---

# 6. Architecture Principles

Follow these principles throughout the project:

* Separation of concerns
* Single responsibility
* Dependency inversion where appropriate
* Reusable components
* Domain-oriented organization
* Clear API boundaries
* Explicit data contracts
* Strong validation
* Centralized error handling
* Centralized logging
* Centralized configuration
* Secure secret management
* Database integrity
* Transactional consistency where required

Avoid:

* God classes
* God components
* Giant controllers
* Giant service files
* Business logic inside UI components
* Business logic directly inside route handlers
* Repeated database queries scattered throughout the application
* Hardcoded credentials
* Hardcoded environment-specific URLs
* Magic numbers
* Copy-pasted logic
* Hidden side effects

---

# 7. Component-Based Implementation

All frontend development must follow a component-based architecture.

Prefer:

```text
components/
├── common/
├── layout/
├── forms/
├── tables/
├── modals/
├── dashboard/
└── domain/
```

Domain-specific components should remain close to their domain.

For example:

```text
modules/
└── accounting/
    ├── components/
    ├── pages/
    ├── hooks/
    ├── services/
    ├── validations/
    └── types/
```

Do not put every component into one global components folder.

A component should have one clear responsibility.

If a component becomes excessively large, identify logical subcomponents and extract them.

---

# 8. Backend Architecture

Backend code should maintain clear separation between:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository / Data Access
  ↓
Database
```

Where appropriate:

```text
Request
  ↓
Authentication
  ↓
Authorization
  ↓
Validation
  ↓
Controller
  ↓
Business Service
  ↓
Repository
  ↓
Database
```

Third-party integrations should be isolated behind dedicated integration/service layers.

Example:

```text
integrations/
├── banking/
├── gst/
├── payments/
├── email/
├── notifications/
└── identity/
```

Do not spread third-party API calls throughout controllers or UI components.

---

# 9. Database Rules

Database changes must be treated as production changes.

Never casually modify schema definitions without considering:

* Existing records
* Existing relationships
* Backward compatibility
* Indexes
* Constraints
* Migration strategy
* Data migration
* Rollback strategy

Every schema change should have a proper migration.

Never manually modify production databases as a substitute for migrations.

Important financial/business records should have appropriate:

* IDs
* timestamps
* status fields
* audit information
* relationships
* constraints

Use transactions whenever multiple database operations must succeed or fail together.

---

# 10. API Standards

APIs must have predictable structures.

Responses should follow the project's established response contract.

Conceptually:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "requestId": "..."
}
```

Errors should follow a predictable structure:

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found"
  },
  "requestId": "..."
}
```

Do not expose:

* Stack traces
* Database errors
* Internal implementation details
* Secrets
* API credentials
* Sensitive infrastructure information

to end users.

---

# 11. Validation

Validate all externally supplied input.

This includes:

* HTTP requests
* Query parameters
* Path parameters
* Request bodies
* Uploaded files
* Webhooks
* Third-party responses
* Import files
* Configuration values

Validation should occur before business logic executes.

Never trust client-side validation alone.

---

# 12. Authentication and Authorization

Authentication and authorization are separate concerns.

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

Every protected operation must verify appropriate authorization.

Never rely solely on frontend visibility for permission enforcement.

If a button is hidden from a user, the backend must still reject the operation.

Permission checks should be centralized/reusable where practical.

---

# 13. Roles and Permissions

The project uses role-based access control.

The initial role architecture should remain intentionally small and understandable.

Do not create a new role merely because one user needs a slightly different permission.

Prefer:

```text
Role
  ↓
Permissions
```

over hardcoding user-specific logic.

All permission-sensitive operations must be enforced server-side.

---

# 14. Error Handling

Errors must be handled intentionally.

Never use:

```javascript
try {
   ...
} catch (error) {
   console.log(error);
}
```

without determining what should happen next.

Every caught error should either:

* Be handled
* Be transformed into a known application error
* Be logged and rethrown
* Be surfaced to an appropriate error boundary

Use centralized error handling where possible.

Errors should have stable machine-readable codes.

Examples:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
RESOURCE_NOT_FOUND
CONFLICT
DATABASE_ERROR
EXTERNAL_SERVICE_ERROR
RATE_LIMITED
INTERNAL_SERVER_ERROR
```

Do not leak internal errors to users.

---

# 15. Logging

Logging is a first-class production requirement.

Use structured logs whenever possible.

Important events should include contextual information such as:

```text
timestamp
level
service
environment
requestId
userId
organizationId
operation
message
errorCode
duration
```

Never log:

* Passwords
* Access tokens
* API keys
* Secret keys
* Full financial credentials
* Sensitive personal information

Use appropriate log levels:

```text
DEBUG
INFO
WARN
ERROR
FATAL
```

Development logs may be more verbose than production logs.

Production logs should be useful for diagnosing failures without exposing sensitive information.

---

# 16. Audit Logging

Business-critical operations must be auditable.

Examples include:

* User creation
* User deletion
* Role changes
* Permission changes
* Financial transactions
* Invoice changes
* Payment changes
* Bank account changes
* GST-related changes
* Approval/rejection operations
* Record deletion
* Important configuration changes

Audit records should capture, where appropriate:

```text
actor
action
resource
resourceId
timestamp
before
after
requestId
IP/context where appropriate
```

Audit logs should not be treated as ordinary application logs.

---

# 17. Security

Never hardcode:

```text
API keys
JWT secrets
Database passwords
Encryption keys
Cloud credentials
Payment credentials
Banking credentials
GST credentials
Third-party credentials
```

Use environment variables or an appropriate secret-management system.

Maintain:

```text
.env
.env.example
```

Never commit `.env`.

If a secret appears in source code, treat it as compromised and recommend rotation.

---

# 18. Environment Management

Clearly separate:

```text
development
testing
staging
production
```

Never assume development configuration is suitable for production.

Environment-specific configuration must be externalized.

Avoid hardcoded:

```text
localhost
development URLs
test credentials
development database names
```

inside production code.

---

# 19. Third-Party Integrations

All external services must be isolated.

Examples:

```text
GST
Banking
Payments
Email
SMS
Storage
Authentication
Cloud services
```

Each integration should have:

* Configuration
* Client/service wrapper
* Request validation
* Response validation
* Error handling
* Timeout handling
* Retry strategy where appropriate
* Logging
* Monitoring
* Documentation
* Tests/mocks

Never allow third-party API-specific implementation details to spread throughout the application.

---

# 20. External API Reliability

For external APIs:

* Use timeouts.
* Validate responses.
* Handle non-2xx responses.
* Handle malformed responses.
* Handle rate limits.
* Implement retries only where safe.
* Use exponential backoff where appropriate.
* Avoid retrying non-idempotent operations blindly.
* Use idempotency keys where supported/required.
* Record external request identifiers where useful.

External services are dependencies, not guarantees.

---

# 21. Financial Data

Synergy handles business and potentially financial information.

Therefore:

* Never use floating-point arithmetic for monetary calculations where precision matters.
* Use appropriate decimal/database numeric representations.
* Store currency explicitly where required.
* Maintain transaction history.
* Avoid destructive updates to financial records.
* Prefer immutable financial transaction records.
* Use adjustment/reversal entries where appropriate.
* Ensure financial operations are auditable.

Never silently alter historical financial records.

---

# 22. File Uploads

File uploads must validate:

* File type
* File size
* File extension
* MIME type where applicable
* Storage path
* Access permissions

Do not trust the file extension alone.

Uploaded files should not automatically become publicly accessible.

---

# 23. Frontend Rules

Frontend code must:

* Handle loading states.
* Handle empty states.
* Handle error states.
* Handle success states.
* Handle permission restrictions.
* Handle API failures.
* Avoid exposing secrets.
* Avoid unnecessary API calls.
* Avoid duplicating business logic that belongs on the backend.

Every important screen should consider:

```text
Loading
Empty
Success
Error
Unauthorized
Forbidden
```

Do not design only the happy path.

---

# 24. UI/UX Quality

The application is intended to be a professional ERP platform.

Avoid:

* Generic AI-generated layouts
* Unnecessary visual complexity
* Inconsistent spacing
* Random colors
* Inconsistent buttons
* Repeated one-off components
* Inconsistent typography

Use a consistent design system.

Common UI primitives should be reusable.

Examples:

```text
Button
Input
Select
Modal
Drawer
Table
Pagination
Badge
Alert
Toast
Tabs
Card
Dropdown
DatePicker
Form
```

---

# 25. State Management

Use the project's established state-management strategy.

Do not introduce a new state-management library for a small feature without architectural justification.

Separate:

* Server state
* UI state
* Form state
* Global application state

Avoid unnecessary global state.

---

# 26. Testing

Every significant feature should include appropriate tests.

Test levels include:

```text
Unit tests
Integration tests
API tests
Component tests
End-to-end tests
```

Prioritize testing around:

* Business logic
* Authentication
* Authorization
* Financial calculations
* Database operations
* External integrations
* Critical workflows

Do not only test UI snapshots.

---

# 27. Test Before Declaring Completion

Never say:

> "The feature is complete"

merely because the code compiles.

Before declaring completion:

* Run linting.
* Run type checks where applicable.
* Run relevant tests.
* Test API behavior.
* Test failure cases.
* Test authorization.
* Test validation.
* Verify database migrations.
* Verify logs.
* Verify frontend states.
* Verify no secrets were introduced.
* Verify documentation.

---

# 28. Git Discipline

Never destroy existing work.

Do not:

```text
reset --hard
force push
delete branches
remove migrations
rewrite history
```

unless explicitly authorized.

Before major changes:

* Inspect git status.
* Understand existing changes.
* Avoid overwriting developer work.
* Keep commits logically scoped.

Prefer small, meaningful commits.

Example:

```text
feat(accounting): add invoice approval workflow
fix(auth): prevent unauthorized role update
refactor(gst): isolate GST provider client
test(invoice): add approval workflow coverage
docs(api): document invoice endpoints
```

---

# 29. Do Not Modify Unrelated Code

When implementing a feature:

Do not refactor unrelated modules merely because you notice something that could be improved.

If an unrelated problem is discovered:

1. Mention it.
2. Determine whether it blocks the current work.
3. Create a separate task if necessary.

This keeps changes reviewable.

---

# 30. Documentation

Every major module should have documentation.

Documentation should explain:

* Purpose
* Responsibilities
* Architecture
* Data flow
* APIs
* Database models
* Permissions
* Important business rules
* External integrations
* Failure scenarios
* Testing strategy

Documentation should be written for another developer joining the team six months later.

---

# 31. Architectural Decisions

When an important architectural decision is made, record it.

Examples:

```text
Why a particular database was selected
Why a particular banking provider was selected
Why a particular authentication strategy was selected
Why a module uses asynchronous processing
Why a particular integration architecture was chosen
```

Do not rely on chat history as the source of truth.

Important decisions should eventually be moved into project documentation/MEMORY.md/ADR documents.

---

# 32. Project Memory

`MEMORY.md` contains the current project knowledge.

When a significant decision changes:

* Update MEMORY.md.
* Do not leave obsolete information as if it is current.
* Clearly distinguish implemented, planned, and proposed architecture.

Use explicit status labels:

```text
IMPLEMENTED
IN PROGRESS
PLANNED
PROPOSED
DEPRECATED
BLOCKED
```

---

# 33. Never Confuse Planned With Implemented

This is extremely important.

Do not write:

> "Synergy uses X"

if X is only planned.

Instead write:

> "PLANNED: Synergy will use X."

Similarly:

> "IMPLEMENTED: Authentication currently uses X."

The project memory must accurately represent the actual state of the repository.

---

# 34. Change Management

Before changing architecture:

1. Understand why the existing architecture exists.
2. Identify dependencies.
3. Identify migration requirements.
4. Identify backward compatibility requirements.
5. Identify affected modules.
6. Identify deployment implications.
7. Update documentation.

Do not casually replace major infrastructure.

---

# 35. Performance

Performance should be considered from the beginning.

Watch for:

* N+1 queries
* Unbounded database queries
* Missing indexes
* Large payloads
* Excessive API calls
* Repeated computation
* Memory leaks
* Blocking operations
* Unnecessary frontend re-renders

Do not prematurely optimize without evidence.

Prefer measurable optimization.

---

# 36. Scalability

Design important services so that they can eventually scale horizontally.

Avoid relying on:

* Local process memory
* Local filesystem state
* Single-process global variables
* In-memory sessions

when the architecture requires multiple instances.

Use appropriate shared infrastructure such as databases, caches, queues, or object storage where required.

---

# 37. Background Jobs

Long-running or asynchronous work should not unnecessarily block HTTP requests.

Examples:

* Emails
* Notifications
* Report generation
* Large imports
* Data processing
* External synchronization
* Scheduled reconciliation

Use background workers/queues when appropriate.

Background jobs must have:

* Retry behavior
* Failure handling
* Logging
* Job status
* Idempotency where required

---

# 38. Idempotency

Operations that may be retried must be designed carefully.

Especially:

* Payments
* Financial transactions
* External API operations
* Webhooks
* Imports
* Synchronization jobs

A retry must not accidentally create duplicate business records.

---

# 39. Webhooks

Webhook handlers must:

1. Authenticate/verify the webhook.
2. Validate the payload.
3. Record/process the event safely.
4. Handle duplicate delivery.
5. Return appropriate responses.
6. Log the event.
7. Avoid performing unsafe long-running work synchronously.

Assume webhook delivery can happen more than once.

---

# 40. API Versioning

Avoid breaking existing API consumers unnecessarily.

When breaking changes are unavoidable, use an explicit migration/versioning strategy.

Do not silently change:

* Response structures
* Field meanings
* Required parameters
* Authentication requirements

without documenting the change.

---

# 41. Code Quality

Prefer explicit, readable code over clever code.

Bad:

```javascript
const x = a?.b?.c?.d ?? foo?.bar ?? baz;
```

when the business meaning is unclear.

Prefer meaningful abstractions.

Names should describe intent.

Bad:

```text
data
temp
obj
res2
handleThing
processData
```

Prefer:

```text
invoice
customerAccount
paymentTransaction
calculateInvoiceTotal
approveInvoice
```

---

# 42. Comments

Comments should explain **why**, not simply repeat **what** the code does.

Bad:

```javascript
// Increment i
i++;
```

Good:

```javascript
// Use the provider's idempotency key to prevent duplicate payment creation
// when the request is retried after a network timeout.
```

---

# 43. AI Agent Behavior

When acting as an AI coding agent:

### Always

* Inspect before editing.
* Explain significant architectural choices.
* Reuse existing patterns.
* Keep changes modular.
* Validate assumptions.
* Run tests where possible.
* Report what was changed.
* Report what was tested.
* Report known limitations.
* Update documentation when appropriate.

### Never

* Invent APIs.
* Invent database fields without justification.
* Delete existing functionality without approval.
* Replace architecture without discussion.
* Hardcode secrets.
* Ignore errors.
* Hide failing tests.
* Claim tests passed when they were not run.
* Claim a feature is production-ready without validation.
* Rewrite large portions of the repository unnecessarily.

---

# 44. Implementation Workflow

For every non-trivial task, follow:

## Phase 1 — Understand

Read:

* AGENTS.md
* MEMORY.md
* Relevant README/documentation
* Relevant source files

## Phase 2 — Inspect

Identify:

* Existing architecture
* Dependencies
* Related modules
* Database models
* APIs
* Tests

## Phase 3 — Plan

Create a concise implementation plan covering:

* Files to create
* Files to modify
* Database changes
* API changes
* UI changes
* Security
* Testing
* Documentation

## Phase 4 — Implement

Implement incrementally.

Do not create a massive unreviewed change.

## Phase 5 — Validate

Run:

* Type checks
* Lint
* Unit tests
* Integration tests
* Relevant E2E tests

as applicable.

## Phase 6 — Review

Check:

* Security
* Error handling
* Logging
* Permissions
* Performance
* Maintainability
* Regression risk

## Phase 7 — Document

Update:

* API documentation
* Module documentation
* MEMORY.md
* ADRs when applicable

## Phase 8 — Report

Provide:

```text
Implemented:
- ...

Changed:
- ...

Tests:
- ...

Known limitations:
- ...

Next steps:
- ...
```

---

# 45. Definition of Done

A feature is not considered complete until:

* [ ] Business requirement implemented
* [ ] Existing architecture respected
* [ ] Validation implemented
* [ ] Authorization implemented
* [ ] Error handling implemented
* [ ] Logging implemented
* [ ] Audit requirements considered
* [ ] Database changes migrated
* [ ] Tests added/updated
* [ ] Loading/error/empty UI states handled
* [ ] Security reviewed
* [ ] Documentation updated
* [ ] Relevant tests executed
* [ ] No secrets committed
* [ ] No unrelated code unnecessarily modified
* [ ] MEMORY.md updated if architecture/project state changed

---

# 46. Final Principle

The repository should always remain understandable to a developer who has never seen it before.

Build Synergy as a long-lived production system, not as a prototype.

**Correctness > Speed**

**Security > Convenience**

**Maintainability > Cleverness**

**Observability > Hidden behavior**

**Reusable architecture > Copy-paste**

**Explicit decisions > Assumptions**

**Tests > Confidence**

**Documentation > Tribal knowledge**


## Required workflow after updating this checkout

When asked to pull/update code and run it, inspect git status and preserve local work, use Node 22.x, install dependencies with npm ci when the lockfile changes, confirm the intended database target without exposing credentials, stop API/worker processes to release Windows Prisma engine locks, then run npm run db:sync (automatically selects pinned Node 22.23.4 via npm). This applies pending committed migrations (never reset/db push/migrate dev), generates Prisma Client, and verifies migration status. Stop on any failure; do not mark the update complete. Restart/rebuild the API and workers after success, then verify health and the affected API/pages. A plain git fetch only downloads refs and does not update the checkout or run migrations. Do not automatically migrate staging/production databases from local development.
