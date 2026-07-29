-- LOOP v28.22 social login + welcome email support
-- Run after v28.21. This stores provider metadata and makes welcome email sending idempotent.

alter table if exists public.app_user_profiles
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists signup_provider text,
  add column if not exists last_login_provider text,
  add column if not exists last_login_at timestamptz;

-- Ensure the existing email template table accepts platform/onboarding templates.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_email_templates'::regclass
      and conname = 'app_email_templates_category_check'
  ) then
    alter table public.app_email_templates drop constraint app_email_templates_category_check;
  end if;
exception when undefined_table then
  null;
end $$;

alter table if exists public.app_email_templates
  add constraint app_email_templates_category_check
  check (category in ('finance','health','platform','security','household','admin'));

insert into public.app_email_templates (template_key, name, category, cadence, subject, preheader, body_markdown, enabled)
values (
  'welcome_loop_onboarding',
  'Welcome to LOOP',
  'platform',
  'event',
  'Welcome to LOOP — start tracking smarter',
  'Your LOOP workspace is ready: savings, mortgages, investments and property in one place.',
  $$Hi {{first_name}},

Welcome to LOOP — your private household tracker for the decisions that usually live across five different apps.

LOOP helps you organise money, property, savings, pensions, investments and health into one place, then highlights what has changed and what may need attention.

### Start here

1. **Household** — confirm who is in your household and who owns what.
2. **Home + mortgage** — add your current home, mortgage balance, payment and deal end date.
3. **Savings** — add providers you already bank with, then let LOOP compare eligible options.
4. **Investments** — connect a broker or manually add pots, pies, holdings and cash.
5. **Moving home** — save property links and compare running costs without affecting your current-home view.

### Quick links

- Dashboard: {{app_url}}/dashboard
- Household: {{app_url}}/household
- Mortgage and property tools: {{app_url}}/mortgage
- Investments: {{app_url}}/investments
- Integrations: {{app_url}}/integrations

You stay in control of what is connected, imported and shared. Where LOOP uses imported data, it keeps source and confidence notes so important decisions can be reviewed first.

Thanks,
The LOOP team$$,
  true
)
on conflict (template_key) do update set
  name = excluded.name,
  category = excluded.category,
  cadence = excluded.cadence,
  subject = excluded.subject,
  preheader = excluded.preheader,
  body_markdown = excluded.body_markdown,
  enabled = excluded.enabled,
  updated_at = now();

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

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('platform', 'enable-google-oauth-supabase', 'Authentication', 'Enable Google OAuth in Supabase', 'Add the Google OAuth Client ID/secret in Supabase Auth > Providers > Google and keep /auth/callback whitelisted in URL configuration.', 20, 'todo', '{"area":"auth","provider":"google"}'::jsonb),
  ('platform', 'enable-apple-oauth-supabase', 'Authentication', 'Enable Apple OAuth in Supabase', 'Add Apple Service ID / team credentials in Supabase Auth > Providers > Apple and test the web OAuth flow.', 21, 'todo', '{"area":"auth","provider":"apple"}'::jsonb),
  ('platform', 'send-test-welcome-email', 'Email', 'Send a test welcome email', 'Use Admin > Email formats to send the Welcome to LOOP template to a test user before inviting beta users.', 22, 'todo', '{"area":"email","template_key":"welcome_loop_onboarding"}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata,
  status = case when public.app_future_integration_tasks.status = 'done' then public.app_future_integration_tasks.status else excluded.status end,
  updated_at = now();
