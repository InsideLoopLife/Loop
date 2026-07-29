-- v28.16 - investment provider guardrails
-- Purpose:
-- 1) Remove the temporary/fallback Trading 212 bundle labels created by earlier builds.
--    SnapTrade does not reliably expose Trading 212 pie membership, so LOOP must not invent pies.
-- 2) Remove obviously bad provider snapshots produced while GBX/cost/value logic was being corrected.
-- 3) Mark SnapTrade-imported holding raw payloads as unverified for cost basis unless explicitly verified later.

begin;

-- Clear generated bundle labels from SnapTrade-imported Trading 212 rows.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'investment_holdings'
      and column_name = 'updated_at'
  ) then
    update investment_holdings
    set group_label = null,
        updated_at = now()
    where lower(coalesce(import_source_type, '')) = 'snaptrade'
      and group_label ~* '^Trading 212 .+ bundle$';
  else
    update investment_holdings
    set group_label = null
    where lower(coalesce(import_source_type, '')) = 'snaptrade'
      and group_label ~* '^Trading 212 .+ bundle$';
  end if;
end $$;

-- Remove matching generated pie settings, otherwise the UI can continue to present a fake pie.
delete from investment_pie_settings
where group_label ~* '^Trading 212 .+ bundle$';

-- Remove impossible provider snapshots where stored snapshot value is wildly out of line with current provider value.
-- The thresholds are intentionally wide to avoid deleting genuine movement.
delete from investment_price_snapshots s
using investment_holdings h
where s.holding_id = h.id
  and s.user_id = h.user_id
  and lower(coalesce(h.import_source_type, '')) = 'snaptrade'
  and coalesce(s.source, '') ilike 'snaptrade:%'
  and coalesce(h.imported_current_value, 0) > 0
  and coalesce(s.value, 0) > 0
  and (
    s.value > h.imported_current_value * 5
    or s.value < h.imported_current_value * 0.20
  );

-- Remove zero/near-zero provider snapshots for live holdings where the provider now has a positive value.
delete from investment_price_snapshots s
using investment_holdings h
where s.holding_id = h.id
  and s.user_id = h.user_id
  and lower(coalesce(h.import_source_type, '')) = 'snaptrade'
  and coalesce(s.source, '') ilike 'snaptrade:%'
  and coalesce(h.imported_current_value, 0) > 0
  and coalesce(s.value, 0) <= 0.01;

-- Make cost-basis reliability explicit in the raw JSON where the column exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'investment_holdings'
      and column_name = 'external_position_raw'
  ) then
    update investment_holdings
    set external_position_raw = coalesce(external_position_raw, '{}'::jsonb) || jsonb_build_object('loop_cost_basis_verified', false)
    where lower(coalesce(import_source_type, '')) = 'snaptrade'
      and coalesce(external_position_raw ->> 'loop_cost_basis_verified', '') = '';
  end if;
end $$;

commit;
