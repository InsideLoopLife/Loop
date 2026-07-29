-- LOOP v28.10 LOOP Inbox / Postmark startup setup checklist
-- Run after v28_09. Keeps the developer checklist in Admin > Future integrations / products.

create table if not exists public.app_future_integration_tasks (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  task_key text not null,
  title text not null,
  description text not null default '',
  section text not null default 'Setup',
  priority int not null default 100,
  status text not null default 'todo',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_key, task_key),
  constraint app_future_integration_tasks_status_check check (status in ('todo','done','blocked','not_applicable'))
);

alter table public.app_future_integration_tasks enable row level security;

drop policy if exists "future integration tasks admin read" on public.app_future_integration_tasks;
create policy "future integration tasks admin read" on public.app_future_integration_tasks
  for select using (
    exists (
      select 1 from public.app_admin_users au
      join auth.users u on lower(u.email) = lower(au.email)
      where u.id = auth.uid() and au.status = 'active'
    )
  );

-- Writes are performed by service role through admin server actions.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_inbound_aliases' and column_name='domain') then
    update public.loop_inbound_aliases
       set domain = 'inbox.insideloop.life'
     where domain = 'insideloop.life';
  end if;
end $$;

alter table if exists public.loop_inbound_aliases
  alter column domain set default 'inbox.insideloop.life';

alter table if exists public.loop_inbound_email_events
  alter column domain set default 'inbox.insideloop.life';

create or replace function public.loop_random_alias_for_email(p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_local text := split_part(lower(coalesce(p_email, 'loop')), '@', 1);
  v_base text;
  v_alias text;
begin
  v_base := public.loop_normalise_inbound_alias(v_local);
  if length(v_base) < 3 or v_base in ('admin','support','security','help','postmaster','abuse','billing','root','system','loop','insideloop','mail','smtp','api') then
    v_base := 'loop' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);
  end if;
  v_base := substr(v_base, 1, 28);

  loop
    v_alias := v_base || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
    exit when not exists(select 1 from public.loop_inbound_aliases where alias = v_alias and domain = 'inbox.insideloop.life');
  end loop;
  return v_alias;
end;
$$;

create or replace function public.loop_claim_inbound_alias(p_alias text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_alias text;
  v_domain text := 'inbox.insideloop.life';
  v_reserved text[] := array['admin','support','security','help','postmaster','abuse','billing','root','system','loop','insideloop','mail','smtp','api','mx','dns','webhook'];
  v_row public.loop_inbound_aliases%rowtype;
begin
  if v_user_id is null then raise exception 'Not signed in'; end if;
  if not public.loop_user_has_inbound_email_entitlement(v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'premium_required', 'message', 'Inbound email aliases are available on paid tiers.');
  end if;

  select email into v_email from auth.users where id = v_user_id;
  select * into v_row from public.loop_inbound_aliases where user_id = v_user_id;
  if found then
    return jsonb_build_object('ok', true, 'alias', v_row.alias, 'email', v_row.alias || '@' || v_row.domain, 'status', v_row.status, 'existing', true);
  end if;

  v_alias := public.loop_normalise_inbound_alias(p_alias);
  if v_alias is null or length(v_alias) < 3 then
    v_alias := public.loop_random_alias_for_email(v_email);
  end if;
  if v_alias = any(v_reserved) or v_alias like 'admin%' or v_alias like 'support%' then
    raise exception 'That alias is reserved.';
  end if;

  insert into public.loop_inbound_aliases(user_id, alias, domain, allowed_sender_email)
  values (v_user_id, v_alias, v_domain, lower(v_email))
  returning * into v_row;

  return jsonb_build_object('ok', true, 'alias', v_row.alias, 'email', v_row.alias || '@' || v_row.domain, 'status', v_row.status, 'existing', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'alias_taken', 'message', 'That alias is already taken.');
end;
$$;

grant execute on function public.loop_claim_inbound_alias(text) to authenticated;

insert into public.app_future_integration_tasks(product_key, task_key, title, description, section, priority, metadata)
values
('loop_inbox', 'choose-postmark', 'Choose Postmark for startup inbound email', 'Recommended startup option: free Developer tier for initial testing, then low monthly paid plan when volume grows. Keep AWS SES for later scale only.', 'Provider', 10, '{"why":"Lowest-friction startup provider with inbound parsing and webhook JSON."}'::jsonb),
('loop_inbox', 'create-postmark-server', 'Create a Postmark server and inbound message stream', 'In Postmark, create a server for LOOP Inbox, then use the Inbound message stream. Do not create one mailbox per user.', 'Provider', 20, '{}'::jsonb),
('loop_inbox', 'subdomain-dns', 'Add DNS records for inbox.insideloop.life', 'In Microsoft 365 / domain DNS, add only the MX records Postmark gives you for inbox.insideloop.life. Leave normal Microsoft 365 email records for insideloop.life untouched.', 'DNS', 30, '{}'::jsonb),
('loop_inbox', 'inbound-domain', 'Set Postmark inbound forwarding domain', 'Configure inbox.insideloop.life as the inbound forwarding domain. This lets Postmark catch aliases like dan@inbox.insideloop.life.', 'DNS', 40, '{}'::jsonb),
('loop_inbox', 'env-secret', 'Create Render environment secrets', 'Add INBOUND_EMAIL_DOMAIN=inbox.insideloop.life, INBOUND_EMAIL_WEBHOOK_SECRET, INBOUND_EMAIL_BASIC_USER, and INBOUND_EMAIL_BASIC_PASSWORD. Use a long generated secret.', 'Render', 50, '{}'::jsonb),
('loop_inbox', 'webhook-url', 'Add the Postmark inbound webhook URL', 'Set the Postmark inbound webhook to https://loop:YOUR_PASSWORD@YOUR_APP_DOMAIN/api/inbound/email. This build also accepts ?secret= fallback, but Basic Auth is cleaner.', 'Webhook', 60, '{}'::jsonb),
('loop_inbox', 'run-sql', 'Run v28.08, v28.09 and v28.10 SQL migrations', 'Run db/v28_08_inbound_email_premium.sql, db/v28_09_inbound_email_hardening.sql and db/v28_10_loop_inbox_postmark_admin_checklist.sql in Supabase SQL editor.', 'Database', 70, '{}'::jsonb),
('loop_inbox', 'premium-tier-test', 'Give a test user a premium tier and claim alias', 'Use Admin > Users/Tiers to put a test user on Plus/Pro, then open /account/inbound-email and claim an alias.', 'Testing', 80, '{}'::jsonb),
('loop_inbox', 'send-test-property', 'Send a Rightmove URL from the verified account email', 'Send a property URL from the same email used to sign in. Confirm it lands in Review imports and imports only into that user account.', 'Testing', 90, '{}'::jsonb),
('loop_inbox', 'send-test-ticker', 'Send a ticker test from the verified account email', 'Send G4M.L or AAPL. Confirm it appears as an investment ticker and does not create fake holdings automatically.', 'Testing', 100, '{}'::jsonb),
('loop_inbox', 'negative-security-tests', 'Run negative security tests', 'Try sending from another email, with an attachment, to a non-existent alias, and with an unsupported URL. Confirm each is rejected without leaking whether aliases exist.', 'Security', 110, '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata,
  updated_at = now();
