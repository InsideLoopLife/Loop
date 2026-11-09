-- KIT/SPLIT days + NHS pension arrears (buy-back of unpaid maternity leave) per maternity pay event.
-- Shape: MaternityExtras in lib/calculations/maternity.ts. Parsed defensively in app code.
-- ALREADY APPLIED to vuqlgderfszguttdnxsr on 2026-10-04 via Supabase MCP.
alter table public.pay_events
  add column if not exists maternity_extras jsonb not null default '{}'::jsonb;

comment on column public.pay_events.maternity_extras is
  'Maternity extras: { kitDays:[{date,hours}], kitPayMethod, contractedWeeklyHours, kitDayHours, kitAllowance, pensionArrearsOptIn, pensionArrearsBasis, pensionArrearsMonths, pensionArrearsStartMonth }';

notify pgrst, 'reload schema';
