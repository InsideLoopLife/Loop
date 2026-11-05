-- Applied 2026-11-04. Original script loop_work/migrations/20260921_calendar_feature_v2.sql was never run;
-- adds service_role grants for the .ics feed route and Google sync worker.
-- ---------------------------------------------------------------------
-- Per-person calorie target — the app currently uses a hardcoded 2200
-- default (DAILY_TARGETS.calories in NutritionClient.tsx). This adds
-- real per-person storage; NULL means "fall back to the 2200 default".
-- Lives on `people`, not `app_user_profiles`, because food_logs.person_id
-- is how food entries are actually scoped, and a household can have
-- several people (partner, children) each needing their own target.
-- ---------------------------------------------------------------------
alter table people add column if not exists daily_calorie_target integer;

-- ---------------------------------------------------------------------
-- Unified calendar events layer — household + person scoped like
-- planned_items / food_logs, using the same householdWriteFields shape
-- (user_id, household_id, visibility_scope) so it composes with the
-- existing household-context helpers rather than reinventing scoping.
-- ---------------------------------------------------------------------
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user_profiles(user_id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  visibility_scope text not null default 'household' check (visibility_scope in ('private', 'household')),
  person_id uuid references people(id) on delete cascade,
  source text not null check (source in ('google', 'loop_payment', 'loop_income', 'loop_calorie', 'loop_manual')),
  external_id text,               -- Google event id, or a deterministic key for Loop-native rows
  event_type text not null check (event_type in ('payment_due', 'income_expected', 'calorie_progress', 'manual')),
  title text not null,
  event_date date not null,
  amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, event_type, event_date, external_id)
);

create index if not exists calendar_events_user_date_idx on calendar_events (user_id, event_date);
create index if not exists calendar_events_household_date_idx on calendar_events (household_id, event_date);
create index if not exists calendar_events_person_idx on calendar_events (person_id);

drop trigger if exists set_calendar_events_updated_at on calendar_events;
create trigger set_calendar_events_updated_at
  before update on calendar_events
  for each row execute function app_set_updated_at();

alter table calendar_events enable row level security;

-- Mirrors the visible-data pattern used elsewhere: own rows, or
-- household-visible rows for any active member of the same household.
-- (Loop's own visibleDataOrFilter/householdMemberDataOrFilter build an
-- equivalent .or() filter at the query layer — this policy is the DB-
-- level backstop so a bug in application code can't leak past RLS.)
create policy calendar_events_select_household on calendar_events
  for select using (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and household_id in (
        select household_id from app_household_members
        where user_id = auth.uid() and status = 'active'
      )
    )
  );

create policy calendar_events_insert_own on calendar_events
  for insert with check (auth.uid() = user_id);
create policy calendar_events_update_own on calendar_events
  for update using (auth.uid() = user_id);
create policy calendar_events_delete_own on calendar_events
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on calendar_events to authenticated;

-- ---------------------------------------------------------------------
-- Google Calendar OAuth connections — one per logged-in user account,
-- not household-scoped (each person connects their own Google account).
-- ---------------------------------------------------------------------
create table if not exists google_calendar_connections (
  user_id uuid primary key references app_user_profiles(user_id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  loop_calendar_id text,
  last_synced_at timestamptz,
  connected_at timestamptz not null default now()
);

alter table google_calendar_connections enable row level security;

create policy gcal_conn_select_own on google_calendar_connections for select using (auth.uid() = user_id);
create policy gcal_conn_insert_own on google_calendar_connections for insert with check (auth.uid() = user_id);
create policy gcal_conn_update_own on google_calendar_connections for update using (auth.uid() = user_id);
create policy gcal_conn_delete_own on google_calendar_connections for delete using (auth.uid() = user_id);

grant select, insert, update, delete on google_calendar_connections to authenticated;

-- ---------------------------------------------------------------------
-- .ics feed tokens. household_id is snapshotted at creation time so the
-- unauthenticated feed route (using the admin client, no auth.uid())
-- can still resolve "which household's events" without re-deriving
-- household context outside a request-scoped Supabase client.
-- ---------------------------------------------------------------------
create table if not exists calendar_feed_tokens (
  user_id uuid primary key references app_user_profiles(user_id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table calendar_feed_tokens enable row level security;

create policy feed_token_select_own on calendar_feed_tokens for select using (auth.uid() = user_id);
create policy feed_token_insert_own on calendar_feed_tokens for insert with check (auth.uid() = user_id);
create policy feed_token_delete_own on calendar_feed_tokens for delete using (auth.uid() = user_id);

grant select, insert, delete on calendar_feed_tokens to authenticated;

grant select, insert, update, delete on calendar_events, google_calendar_connections, calendar_feed_tokens to service_role;

notify pgrst, 'reload schema';
