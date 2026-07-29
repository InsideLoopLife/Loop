-- Life Tracker V5 migration
-- Adds NHS maternity modelling fields, an integration-secret store for local/dev API tokens,
-- and a schema-cache refresh for Supabase/PostgREST.

alter table pay_events add column if not exists maternity_scheme text;
alter table pay_events add column if not exists maternity_leave_start date;
alter table pay_events add column if not exists maternity_leave_end date;
alter table pay_events add column if not exists maternity_pay_mode text;
alter table pay_events add column if not exists maternity_full_pay_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_half_pay_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_smp_only_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_unpaid_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_smp_weekly_rate numeric(12,2);

-- Make sure maternity remains an accepted pay kind.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_pay_kind_check') then
    alter table pay_events drop constraint pay_events_pay_kind_check;
  end if;

  alter table pay_events add constraint pay_events_pay_kind_check
  check (pay_kind in ('salary', 'maternity', 'return_to_work', 'other'));

  if exists (select 1 from pg_constraint where conname = 'pay_events_maternity_pay_mode_check') then
    alter table pay_events drop constraint pay_events_maternity_pay_mode_check;
  end if;

  alter table pay_events add constraint pay_events_maternity_pay_mode_check
  check (maternity_pay_mode is null or maternity_pay_mode in ('spread_equal', 'actual_by_week'));
end $$;

create table if not exists integration_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  key_label text not null,
  -- Deprecated legacy column. Kept nullable so older databases can migrate cleanly.
  secret_value text,
  -- Encrypted secret fields. API tokens must be encrypted because the app needs to use them later;
  -- hashing alone is only useful for fingerprinting/duplicate checks.
  secret_ciphertext text,
  secret_iv text,
  secret_auth_tag text,
  secret_hash text,
  secret_hint text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table integration_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can read their own integration secrets metadata') then
    create policy "Users can read their own integration secrets metadata"
    on integration_secrets
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can insert their own integration secrets') then
    create policy "Users can insert their own integration secrets"
    on integration_secrets
    for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can update their own integration secrets') then
    create policy "Users can update their own integration secrets"
    on integration_secrets
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can delete their own integration secrets') then
    create policy "Users can delete their own integration secrets"
    on integration_secrets
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists pay_events_maternity_dates_idx on pay_events(person_id, maternity_leave_start, maternity_leave_end);
alter table integration_secrets alter column secret_value drop not null;
alter table integration_secrets add column if not exists secret_ciphertext text;
alter table integration_secrets add column if not exists secret_iv text;
alter table integration_secrets add column if not exists secret_auth_tag text;
alter table integration_secrets add column if not exists secret_hash text;
alter table integration_secrets add column if not exists secret_hint text;
create index if not exists integration_secrets_user_provider_idx on integration_secrets(user_id, provider);

select pg_notify('pgrst', 'reload schema');
