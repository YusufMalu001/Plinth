# Authentication and Access

IMPLEMENTED: The web application authenticates through the Express API using short-lived access JWTs and rotating refresh JWTs in HttpOnly cookies. Browser JavaScript never stores or reads either token.

- `api.ts` owns authenticated HTTP requests, session restoration, refresh, and logout.
- `UserAccess.tsx` provides admin-only account provisioning and activation controls.
- The login page uses the shared API client; the workspace verifies the current user before rendering.
- Public registration, password recovery, MFA, and SSO are not yet implemented.
