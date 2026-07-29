-- Life Tracker V20.1 security migration
-- Encrypt integration API tokens going forward. Existing plaintext tokens should be deleted and re-saved
-- from the Integrations page after setting APP_ENCRYPTION_KEY.

alter table integration_secrets alter column secret_value drop not null;
alter table integration_secrets add column if not exists secret_ciphertext text;
alter table integration_secrets add column if not exists secret_iv text;
alter table integration_secrets add column if not exists secret_auth_tag text;
alter table integration_secrets add column if not exists secret_hash text;
alter table integration_secrets add column if not exists secret_hint text;

create index if not exists integration_secrets_user_provider_idx on integration_secrets(user_id, provider);

-- Keep RLS enabled. Users can see encrypted metadata/ciphertext for their own rows only;
-- the usable plaintext is never stored and is only decrypted server-side with APP_ENCRYPTION_KEY.
alter table integration_secrets enable row level security;

select pg_notify('pgrst', 'reload schema');
