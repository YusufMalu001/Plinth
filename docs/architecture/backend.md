# Backend Architecture - Express Modular Monolith

Synergy ERP backend API is designed as a modular monolith. This allows the codebase to remain simple, easy to compile, and easy to review by a small team, while preparing boundaries that allow separating domains into standalone microservices in the future.

## Request Lifecycle Flow
Each incoming HTTP request follows a strict step-by-step layer chain:

```
    HTTP Request
         │
         ▼
       Route
         │
         ▼
  Middlewares (Correlation ID, Logging, Security)
         │
         ▼
  Validation (Zod schema checking)
         │
         ▼
     Controller (HTTP status mappings, thin logic)
         │
         ▼
      Service (Heavy business calculations)
         │
         ▼
     Repository (Prisma database calls)
         │
         ▼
    PostgreSQL (Supabase)
```

## Layer Separation Guidelines

### 1. Routes (`*.routes.ts`)
Map paths to controllers. No business logic or database commands should exist here.

### 2. Controllers (`*.controller.ts`)
Extract parameter objects, invoke services, and compile API responses. Database schema instances or SQL operations should never exist inside controller bodies.

### 3. Services (`*.service.ts`)
Coordinate business requirements. Calculations, conditional workflow forks, and transaction handling live in services.

### 4. Repositories (`*.repository.ts`)
Run SQL or Prisma client commands. Other files must communicate with the database solely by calling repository functions.

## Centralized Middlewares
- **Correlation ID:** Automatically generated using `crypto.randomUUID()` and passed to headers as `x-correlation-id`. Added to all logs.
- **Request Logger:** Compiles method, URL, status code, and latency. Logs as structured JSON in production/staging.
- **Error Handler:** Captures application and unhandled errors. Intercepts database codes and ensures secrets or stack traces never leak to the client in production mode.
