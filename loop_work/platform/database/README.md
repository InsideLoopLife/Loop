# LOOP database clients

- `server-client`: signed-in user session; RLS applies.
- `browser-client`: browser session; RLS applies; public key only.
- `admin-client`: privileged server-only access; bypasses RLS.
- `worker-client`: privileged client with an explicit worker-domain marker.

Domain UI code should normally use the server or browser client. Privileged
clients belong in API routes, admin services, scheduled jobs and worker modules.
