# Plinth ERP - API Documentation

The Plinth API is built using Express and TypeScript. It implements a RESTful JSON API structure under versioned prefixes.

## API Endpoint Prefix
All endpoints must be mounted under:
```
/api/v1/
```

## Response Standard Contracts

### 1. Success Response
All successful requests return a `2xx` status code and a standard JSON response body matching the `ApiResponse<T>` interface:

```json
{
  "success": true,
  "data": {
    "status": "healthy"
  },
  "message": "Operation completed successfully",
  "requestId": "e1a90c1f-4424-4f2b-923f-42da0991823f"
}
```

### 2. Error Response
All failed requests return a matching error status code (`4xx` or `5xx`) and a standard error JSON matching the `ApiErrorResponse` interface:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address format"
      }
    ]
  },
  "requestId": "e1a90c1f-4424-4f2b-923f-42da0991823f"
}
```

## Configured Endpoints

### Authentication and access

- `POST /api/v1/auth/login` validates credentials and sets HttpOnly access and refresh cookies.
- `POST /api/v1/auth/refresh` rotates the persisted refresh session and replaces both cookies.
- `POST /api/v1/auth/logout` revokes the current refresh session and clears both cookies.
- `GET /api/v1/auth/me` returns the authenticated user.
- `GET /api/v1/users` lists users for administrators.
- `POST /api/v1/users` provisions a user for administrators.
- `PATCH /api/v1/users/:id/status` activates or deactivates a user for administrators.

Authentication cookies are sent only over secure connections in production. State-changing browser requests must originate from the configured `WEB_ORIGIN`.

### 1. Health Status
Verify API gateway availability and database connectivity.
- **Route:** `GET /api/v1/health`
- **Auth Required:** No
- **Success Response Code:** `200 OK` (Healthy), `503 Service Unavailable` (Database connection failure)
- **Response Shape:**
```json
{
  "success": true,
  "service": "plinth-api",
  "status": "healthy",
  "timestamp": "2026-08-22T09:12:00Z",
  "uptime": 234.5,
  "database": {
    "connected": true,
    "latencyMs": 12
  }
}
```
