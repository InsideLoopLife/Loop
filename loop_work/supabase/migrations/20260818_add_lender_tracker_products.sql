create table if not exists public.lender_tracker_products (
  id uuid primary key default gen_random_uuid(),
  lender_name text not null,
  product_name text not null,
  reference_rate_kind text not null default 'bank_rate',
  margin_percent numeric(6,3) not null,
  active boolean not null default true,
  effective_from date,
  last_verified_at timestamptz,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lender_name, product_name, reference_rate_kind)
);

alter table public.lender_tracker_products enable row level security;

drop policy if exists "Authenticated users can read lender tracker products"
on public.lender_tracker_products;

create policy "Authenticated users can read lender tracker products"
on public.lender_tracker_products
for select
to authenticated
using (active = true);

insert into public.lender_tracker_products (
  lender_name,
  product_name,
  reference_rate_kind,
  margin_percent,
  active,
  effective_from,
  last_verified_at,
  source_url,
  notes
) values (
  'NatWest',
  '2 year tracker representative example',
  'natwest_base_rate',
  0.44,
  true,
  current_date,
  now(),
  'https://www.natwest.com/mortgages/mortgage-rates.html',
  'Official NatWest representative example. NatWest tracker products track National Westminster Bank Plc base rate, which is influenced by Bank Rate.'
)
on conflict (lender_name, product_name, reference_rate_kind)
do update set
  margin_percent = excluded.margin_percent,
  active = excluded.active,
  effective_from = excluded.effective_from,
  last_verified_at = excluded.last_verified_at,
  source_url = excluded.source_url,
  notes = excluded.notes,
  updated_at = now();
