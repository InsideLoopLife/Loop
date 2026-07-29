-- v27.71 Product identity / barcode / match-first logic
-- Run after v27.67/v27.69/v27.70.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.loop_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin new.updated_at = now(); return new; end; $$;

-- Minimal safety if the table was not created yet. If it exists, this is harmless.
create table if not exists public.loop_nutrition_cards (
  id uuid primary key default gen_random_uuid(),
  card_kind text not null default 'product',
  visibility text not null default 'shared_database',
  product_type text not null default 'food',
  owner_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  display_name text not null,
  formal_name text,
  brand_name text,
  variant_name text,
  source_url text,
  source_host text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  salt_g numeric,
  caffeine_mg numeric,
  nutrition jsonb not null default '{}'::jsonb,
  confidence integer not null default 50,
  score integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_cards
  add column if not exists barcode text,
  add column if not exists gtin text,
  add column if not exists gtin14 text,
  add column if not exists source_provider text,
  add column if not exists source_priority integer not null default 500,
  add column if not exists retailer_name text,
  add column if not exists category text,
  add column if not exists pack_size text,
  add column if not exists canonical_search_text text,
  add column if not exists data_origin text not null default 'unknown',
  add column if not exists match_status text not null default 'unresolved',
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists external_ids jsonb not null default '{}'::jsonb,
  add column if not exists imported_source_batch text;

create index if not exists loop_nutrition_cards_barcode_idx on public.loop_nutrition_cards(barcode);
create index if not exists loop_nutrition_cards_gtin14_idx on public.loop_nutrition_cards(gtin14);
create index if not exists loop_nutrition_cards_provider_idx on public.loop_nutrition_cards(source_provider, source_priority);
create index if not exists loop_nutrition_cards_canonical_trgm_idx on public.loop_nutrition_cards using gin (lower(coalesce(canonical_search_text, display_name, '')) gin_trgm_ops);

create or replace function public.loop_digits_only(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

drop function if exists public.loop_gtin_is_valid(text);
create or replace function public.loop_gtin_is_valid(p_value text)
returns boolean language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  v text := public.loop_digits_only(p_value); v_body text; v_check int; v_sum int := 0; v_i int; v_digit int; v_pos int := 1; v_calc int;
begin
  if length(v) not in (8,12,13,14) then return false; end if;
  v_body := left(v, length(v)-1); v_check := right(v,1)::int;
  for v_i in reverse length(v_body)..1 loop
    v_digit := substr(v_body, v_i, 1)::int;
    if (v_pos % 2) = 1 then v_sum := v_sum + (v_digit * 3); else v_sum := v_sum + v_digit; end if;
    v_pos := v_pos + 1;
  end loop;
  v_calc := (10 - (v_sum % 10)) % 10;
  return v_calc = v_check;
end; $$;

create or replace function public.loop_gtin_to14(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case when public.loop_gtin_is_valid(p_value) then lpad(public.loop_digits_only(p_value), 14, '0') else null end;
$$;

create or replace function public.loop_normalise_product_query(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(p_value,'')), '\b(i had|i ate|i drank|from|a|an|the|meal|ready meal|pasta meal|for breakfast|for lunch|for dinner)\b', ' ', 'g'), '\s+', ' ', 'g'));
$$;

grant execute on function public.loop_digits_only(text) to anon, authenticated;
grant execute on function public.loop_gtin_is_valid(text) to anon, authenticated;
grant execute on function public.loop_gtin_to14(text) to anon, authenticated;
grant execute on function public.loop_normalise_product_query(text) to anon, authenticated;

create table if not exists public.loop_product_data_providers (
  source_key text primary key,
  name text not null,
  source_kind text not null,
  priority integer not null default 500,
  enabled boolean not null default true,
  supports_barcode boolean not null default false,
  supports_price boolean not null default false,
  supports_image boolean not null default false,
  supports_nutrition boolean not null default false,
  supports_ingredients boolean not null default false,
  supports_allergens boolean not null default false,
  requires_api_key boolean not null default false,
  website_url text,
  terms_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loop_product_data_providers
(source_key,name,source_kind,priority,enabled,supports_barcode,supports_price,supports_image,supports_nutrition,supports_ingredients,supports_allergens,requires_api_key,website_url,terms_note)
values
('admin_verified','Admin verified LOOP data','internal',10,true,true,true,true,true,true,true,false,'https://insideloop.life','Highest trust; do not overwrite without admin approval.'),
('manual_import','Manual CSV/ZIP import','manual',50,true,true,true,true,true,true,true,false,'https://insideloop.life','Imported rows are staged and matched before applying.'),
('open_food_facts','Open Food Facts','open_data',90,true,true,false,true,true,true,true,false,'https://world.openfoodfacts.org','Use API with custom User-Agent and local cache.'),
('gs1_digital_link','GS1 Digital Link / GTIN identity','standards',100,true,true,false,false,false,false,false,false,'https://id.gs1.org','GTIN validation and Digital Link resolver support; product data depends on brand/partner access.'),
('gs1_verified_by_gs1','Verified by GS1 / GDSN adapter','standards',110,false,true,false,false,false,false,false,true,'https://www.gs1.org','Optional commercial/partner adapter; disabled unless credentials/feed are available.'),
('affiliate_feed','Affiliate/product feed','commercial_feed',150,false,true,true,true,false,false,false,true,null,'Optional retailer/affiliate feed adapter.'),
('retailer_source_url','Retailer product page URL','retailer_url',200,true,false,true,true,true,true,true,false,null,'Polite source URL checks only; no bot-protection bypass.'),
('ai_estimate','AI estimate','ai',900,true,false,false,false,true,true,true,true,'https://insideloop.life','Lowest priority; only after local/import/provider matching fails.')
on conflict (source_key) do update set
  name=excluded.name, source_kind=excluded.source_kind, priority=excluded.priority, enabled=excluded.enabled,
  supports_barcode=excluded.supports_barcode, supports_price=excluded.supports_price, supports_image=excluded.supports_image,
  supports_nutrition=excluded.supports_nutrition, supports_ingredients=excluded.supports_ingredients, supports_allergens=excluded.supports_allergens,
  requires_api_key=excluded.requires_api_key, website_url=excluded.website_url, terms_note=excluded.terms_note, updated_at=now();

create table if not exists public.loop_product_identifier_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  identifier_kind text not null,
  identifier_value text not null,
  identifier_digits text,
  gtin14 text,
  source_key text references public.loop_product_data_providers(source_key) on delete set null,
  source_url text,
  confidence integer not null default 60,
  created_at timestamptz not null default now()
);
create index if not exists loop_product_identifier_value_idx on public.loop_product_identifier_observations(identifier_digits, gtin14);

create table if not exists public.loop_product_source_cache (
  id uuid primary key default gen_random_uuid(),
  source_key text references public.loop_product_data_providers(source_key) on delete cascade,
  cache_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  status text not null default 'fresh',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_key, cache_key)
);

create table if not exists public.loop_product_resolution_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  query_text text,
  barcode text,
  gtin14 text,
  retailer_hint text,
  status text not null default 'started',
  resolved_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  candidates jsonb not null default '[]'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,
  ai_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.loop_barcode_scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  scanned_value text not null,
  scanned_digits text,
  gtin14 text,
  is_valid_gtin boolean not null default false,
  scan_context text not null default 'food_log',
  matched_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  status text not null default 'scanned',
  candidates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.loop_product_data_providers enable row level security;
alter table public.loop_product_identifier_observations enable row level security;
alter table public.loop_product_source_cache enable row level security;
alter table public.loop_product_resolution_attempts enable row level security;
alter table public.loop_barcode_scan_events enable row level security;

drop policy if exists "providers readable" on public.loop_product_data_providers;
create policy "providers readable" on public.loop_product_data_providers for select to authenticated using (enabled = true);
drop policy if exists "identifier observations readable" on public.loop_product_identifier_observations;
create policy "identifier observations readable" on public.loop_product_identifier_observations for select to authenticated using (true);
drop policy if exists "source cache admin readable" on public.loop_product_source_cache;
create policy "source cache admin readable" on public.loop_product_source_cache for select to authenticated using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "resolution attempts own read" on public.loop_product_resolution_attempts;
create policy "resolution attempts own read" on public.loop_product_resolution_attempts for select to authenticated using (user_id = auth.uid() or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "resolution attempts own insert" on public.loop_product_resolution_attempts;
create policy "resolution attempts own insert" on public.loop_product_resolution_attempts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "barcode scan own read" on public.loop_barcode_scan_events;
create policy "barcode scan own read" on public.loop_barcode_scan_events for select to authenticated using (user_id = auth.uid() or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "barcode scan own insert" on public.loop_barcode_scan_events;
create policy "barcode scan own insert" on public.loop_barcode_scan_events for insert to authenticated with check (user_id = auth.uid());

update public.loop_nutrition_cards
set canonical_search_text = trim(regexp_replace(lower(coalesce(display_name,'') || ' ' || coalesce(formal_name,'') || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(retailer_name,'') || ' ' || coalesce(pack_size,'')), '\s+', ' ', 'g'))
where canonical_search_text is null or canonical_search_text = '';

update public.loop_nutrition_cards
set gtin14 = public.loop_gtin_to14(coalesce(gtin, barcode))
where gtin14 is null and public.loop_gtin_is_valid(coalesce(gtin, barcode));

insert into public.loop_product_identifier_observations(card_id, identifier_kind, identifier_value, identifier_digits, gtin14, source_key, confidence)
select c.id, 'gtin', coalesce(c.gtin, c.barcode), public.loop_digits_only(coalesce(c.gtin, c.barcode)), c.gtin14, coalesce(c.source_provider, 'manual_import'), 80
from public.loop_nutrition_cards c
where c.gtin14 is not null
and not exists (select 1 from public.loop_product_identifier_observations o where o.card_id = c.id and o.gtin14 = c.gtin14);

drop function if exists public.loop_product_candidate_search(text,text,text,integer);
create or replace function public.loop_product_candidate_search(p_query text default null, p_barcode text default null, p_retailer text default null, p_limit integer default 8)
returns table (
  card_id uuid, display_name text, formal_name text, brand_name text, retailer_name text, product_type text, card_kind text,
  barcode text, gtin text, gtin14 text, source_provider text, source_priority integer, main_image_url text,
  calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric, fibre_g numeric, sugar_g numeric, salt_g numeric, caffeine_mg numeric,
  confidence integer, match_score numeric, match_reason text
)
language sql security definer set search_path = public, pg_catalog as $$
  with input as (
    select public.loop_normalise_product_query(p_query) as q,
           public.loop_digits_only(p_barcode) as barcode_digits,
           public.loop_gtin_to14(p_barcode) as q_gtin14,
           lower(trim(coalesce(p_retailer,''))) as retailer,
           greatest(1, least(coalesce(p_limit,8),30)) as lim
  ), scored as (
    select c.*,
      case
        when i.q_gtin14 is not null and c.gtin14 = i.q_gtin14 then 100::numeric
        when i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits then 98::numeric
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) = i.q then 92::numeric
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' then 82::numeric
        when i.q <> '' then round((similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) * 75)::numeric, 2)
        else 0::numeric
      end
      + case when i.retailer <> '' and lower(coalesce(c.retailer_name,'')) like '%' || i.retailer || '%' then 8::numeric
             when i.retailer <> '' and lower(coalesce(c.source_host,'')) like '%' || i.retailer || '%' then 5::numeric else 0::numeric end
      + case when c.source_provider = 'admin_verified' then 8::numeric when c.source_provider = 'manual_import' then 6::numeric when c.source_provider = 'open_food_facts' then 4::numeric else 0::numeric end
      - greatest(0, coalesce(c.source_priority,500)-100)/100.0 as score_value,
      case
        when i.q_gtin14 is not null and c.gtin14 = i.q_gtin14 then 'GTIN exact match'
        when i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits then 'Barcode exact match'
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) = i.q then 'Exact product text match'
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' then 'Product text contains query'
        when i.q <> '' and similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) > 0.18 then 'Fuzzy product match'
        else 'Low confidence'
      end as reason
    from public.loop_nutrition_cards c cross join input i
    where c.status = 'active' and c.card_kind in ('product','ingredient') and (
      (i.q_gtin14 is not null and c.gtin14 = i.q_gtin14)
      or (i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits)
      or (i.q <> '' and (lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' or similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) > 0.18))
    )
  )
  select id, display_name, formal_name, brand_name, retailer_name, product_type, card_kind, barcode, gtin, gtin14, source_provider, source_priority, main_image_url,
         calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence,
         greatest(0, least(100, score_value)) as match_score, reason as match_reason
  from scored order by score_value desc, confidence desc, updated_at desc limit (select lim from input);
$$;
grant execute on function public.loop_product_candidate_search(text,text,text,integer) to authenticated;

drop function if exists public.loop_record_barcode_scan(text,uuid,text);
create or replace function public.loop_record_barcode_scan(p_scanned_value text, p_household_id uuid default null, p_scan_context text default 'food_log')
returns jsonb language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare v_digits text := public.loop_digits_only(p_scanned_value); v_gtin14 text := public.loop_gtin_to14(p_scanned_value); v_valid boolean := public.loop_gtin_is_valid(p_scanned_value); v_candidates jsonb; v_first uuid; v_status text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.match_score desc), '[]'::jsonb) into v_candidates from public.loop_product_candidate_search(null, p_scanned_value, null, 8) c;
  select (v_candidates -> 0 ->> 'card_id')::uuid into v_first;
  v_status := case when not v_valid then 'invalid' when v_first is not null then 'local_match' else 'provider_lookup' end;
  insert into public.loop_barcode_scan_events(user_id, household_id, scanned_value, scanned_digits, gtin14, is_valid_gtin, scan_context, matched_card_id, status, candidates)
  values (auth.uid(), p_household_id, p_scanned_value, v_digits, v_gtin14, v_valid, coalesce(p_scan_context,'food_log'), v_first, v_status, v_candidates) returning id into v_id;
  return jsonb_build_object('ok', true, 'scan_event_id', v_id, 'digits', v_digits, 'gtin14', v_gtin14, 'is_valid_gtin', v_valid, 'status', v_status, 'candidates', v_candidates);
end; $$;
grant execute on function public.loop_record_barcode_scan(text,uuid,text) to authenticated;

drop function if exists public.loop_v2771_product_identity_healthcheck();
create or replace function public.loop_v2771_product_identity_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql security definer set search_path = public, pg_catalog as $$
  select 'pg_trgm_extension'::text, exists(select 1 from pg_extension where extname='pg_trgm'), 'pg_trgm enabled for fuzzy matching.'
  union all select 'provider_registry', to_regclass('public.loop_product_data_providers') is not null, 'Provider registry exists.'
  union all select 'open_food_facts_provider', exists(select 1 from public.loop_product_data_providers where source_key='open_food_facts' and enabled=true), 'Open Food Facts registered.'
  union all select 'gs1_provider', exists(select 1 from public.loop_product_data_providers where source_key='gs1_digital_link' and enabled=true), 'GS1 Digital Link registered.'
  union all select 'barcode_scan_events', to_regclass('public.loop_barcode_scan_events') is not null, 'Barcode scan table exists.'
  union all select 'candidate_search_rpc', exists(select 1 from pg_proc where proname='loop_product_candidate_search'), 'Candidate search RPC exists.'
  union all select 'gtin_validation', public.loop_gtin_is_valid('5000112546415') = true, 'GTIN validation works.'
  union all select 'gtin_to14', public.loop_gtin_to14('5000112546415') = '05000112546415', 'GTIN-13 pads to GTIN-14.';
$$;
grant execute on function public.loop_v2771_product_identity_healthcheck() to anon, authenticated;
