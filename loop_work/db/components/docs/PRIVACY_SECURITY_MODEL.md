# Privacy and security model

## Principles

1. Private by default.
2. Every user-owned row must have `user_id` and, where possible, `household_id`.
3. Row Level Security must be enabled on private tables.
4. API tokens must be encrypted at rest, never hashed only if the app must reuse them.
5. Passwords are not handled by this app; Supabase Auth handles them.
6. Audits must not copy raw sensitive values.
7. The service-role/secret key must only run on the server.
8. The PWA must not cache private financial API responses.

## Sensitive data handling

| Data type | Storage approach |
|---|---|
| User password | Supabase Auth only |
| API tokens | AES-256-GCM encrypted with `APP_ENCRYPTION_KEY` |
| Income, transactions, mortgages | Plain database values protected by auth/RLS, because calculations need the values |
| Audit trail | Table, record id, changed columns and hashes only |
| CSV uploads | Store parsed rows privately; avoid public buckets |

## Production hardening backlog

- Invite-only onboarding.
- MFA for owner/admin accounts.
- Export-my-data job worker.
- Delete-my-account workflow.
- Backup restore drill.
- Error monitoring with privacy scrubbing.
- Rate limiting for AI/property/banking routes.
- Supabase Vault or managed secret store for production tokens.
