# Master Data Management (Module 1) — Schema & Interface Architecture

This document specifies the database design, data invariants, and interface contracts for **Module 1: Master Data Management** in Plinth ERP.

---

## 1. Overview & Architectural Boundaries

Master Data Management serves as the single source of versioned truth for all operational domains (procurement, inventory, BOM/formulation, production, assembly, sales, and dispatch).

### Strict Boundary Rules:
1. **Module 0 Decoupling**: Module 1 does not establish hard foreign keys to unfinalized Module 0 tables (e.g. `users`, `roles`, `permissions`). Instead:
   - User identity fields (`createdById`, `approvedById`, `deactivatedById`) are recorded as scalar string references.
   - Authorization is abstracted via the `PermissionChecker` interface.
   - Audit logging is abstracted via the `AuditWriter` interface.
2. **Zero Hard Deletes**: Master entities cannot be deleted from the database once created. State transitions, soft deactivations (`deactivatedAt`), and supersession pointers (`supersededById`) are used exclusively.
3. **No Direct Database Access from Frontend**: Next.js (`apps/web`) communicates solely through Express REST endpoints (`services/api`).

---

## 2. The 6-State Lifecycle Model

Every master entity that requires controlled validation enforces the `LifecycleStatus` enum:

```
                  ┌─────────┐
                  │  DRAFT  │ (Newly created or staged via import)
                  └────┬────┘
                       │ submit_for_validation
                       ▼
            ┌──────────────────────┐
            │  PENDING_VALIDATION  │
            └──────────┬───────────┘
                       │ approve (Authorized actor != Creator)
                       ▼
                  ┌──────────┐
                  │ APPROVED │ (Validated identity, immutable)
                  └────┬─────┘
                       │ activate
                       ▼
                  ┌──────────┐
                  │  ACTIVE  │ (Eligible for operational transactions)
                  └────┬─────┘
            ┌──────────┴──────────┐
            │                     │
      deactivate              supersede (New version created)
            ▼                     ▼
      ┌──────────┐          ┌────────────┐
      │ INACTIVE │          │ SUPERSEDED │
      └──────────┘          └────────────┘
```

### State Semantics:
- **`DRAFT`**: Work in progress. Can be modified directly by the creator. Blocked from operational use.
- **`PENDING_VALIDATION`**: Submitted for formal review. Fields are locked against unapproved modifications.
- **`APPROVED`**: Formally validated. Cannot be silently overwritten. Any changes require creating a new version.
- **`ACTIVE`**: Live master record referenceable by downstream transactions (PO lines, BOM components, routing steps).
- **`INACTIVE`**: Soft-deactivated. Retained for historical integrity; blocked from new transactional links.
- **`SUPERSEDED`**: Replaced by a successor version (`supersededById` points to the new record).

---

## 3. Versioning & Effective-Dating Pattern

Versioned entities (e.g., `Product`, `Material`, `UomConversion`, `PackSize`, `QcRule`, `WastageRule`, `ProductRoute`) follow this pattern:

1. **Version Numbering**: Starts at `version: 1` on creation.
2. **Immutability of Approved Masters**: Editing an approved record spawns a new version (`version: N + 1`), sets the old record's status to `SUPERSEDED`, and links `old.supersededById = new.id`.
3. **Effective Date Windows**:
   - `effectiveDate` / `effectiveFrom` defines when the version becomes active.
   - `effectiveTo` defines when the rule expires.
4. **Resolution Invariant**: For any given entity and target timestamp `T`, the service layer resolves exactly one applicable version where `effectiveFrom <= T < effectiveTo` (or `effectiveTo IS NULL`).

---

## 4. Invariants & Business Constraints

### A. Non-Circular UOM Conversions
- Schema uniqueness constraint: `@@unique([fromUomId, toUomId, version])`.
- **Service Layer Invariant**: The service layer must perform a cycle-detection check (e.g. Tarjan's or BFS graph traversal) before persisting any conversion, ensuring that a chain such as `A -> B -> C -> A` cannot be created.

### B. Global Code & SKU Uniqueness
- Every primary identifier field (`sku`, `code`, `employeeCode`, `batchNumber`) is protected by a database-level `UNIQUE` constraint.
- Normalized SKU / code checks run prior to persistence to prevent case-insensitive collision.

### C. Orphan Reference Guard
- Before transitioning an entity to `INACTIVE` or `SUPERSEDED`, service methods (`checkReferences()`) verify that no active child masters or operational transactions rely on the entity.

---

## 5. Interface Contracts (`@plinth/types`)

### Authorization: `PermissionChecker`
```ts
export interface ScopeContext {
  organizationId?: string;
  locationId?: string;
  departmentId?: string;
  [key: string]: unknown;
}

export interface PermissionChecker {
  can(actorId: string, action: string, resource: string, scope?: ScopeContext): Promise<boolean>;
}
```
*Temporary Stub:* `AllowAllPermissionChecker` is injected for local development and unit tests. When Module 0 RBAC is delivered, it will be replaced by the database-backed policy engine.

### Auditing: `AuditWriter`
```ts
export interface AuditEvent {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  timestamp?: Date;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditWriter {
  record(event: AuditEvent): Promise<void>;
}
```
*Temporary Stub:* `ConsoleAuditWriter` outputs structured JSON logs to stdout during local execution. When Module 0 Audit is completed, it will be replaced by the persistent audit repository.

---

## 6. Staged Import Pipeline

Master data cannot be bulk-inserted directly into live tables:
1. **Stage Batch**: CSV / Excel data is uploaded to create a `MasterDataImportBatch`.
2. **Row Normalization & Validation**: Rows are parsed into `MasterDataImportRow`, validated against Zod schemas, and evaluated for duplicates.
3. **Duplicate Resolution**: If duplicate candidates are detected, operators choose `SKIP`, `CREATE_NEW`, or `MERGE`.
4. **Commit Valid Rows**: Only valid rows are committed to master tables as `DRAFT` or `PENDING_VALIDATION`. Failed rows remain in `MasterDataImportRow` with structured error logs for review.
