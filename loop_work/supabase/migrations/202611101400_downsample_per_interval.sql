-- The nightly downsampler kept one point per listing per time bucket across
-- every interval at once. The history worker stores separate 1d / 1wk / 60m
-- series, so the downsampler deleted the daily series it had just written
-- (keeping that day's 21:00 one-minute close instead). The history worker
-- then saw "6M missing" for the same few listings every night, re-fetched
-- them, and with its 8-listing limit never reached anything else.
-- Thinning now happens within each interval series.
create or replace function public.loop_downsample_instrument_prices()
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run_id uuid;
  v_points_before bigint;
  v_snapshots_before bigint;
  v_portfolios_before bigint;
  v_points_after bigint;
  v_snapshots_after bigint;
  v_portfolios_after bigint;
  v_points_removed bigint := 0;
  v_snapshots_removed bigint := 0;
  v_portfolios_removed bigint := 0;
begin
  select count(*) into v_points_before from public.investment_instrument_price_points;
  select count(*) into v_snapshots_before from public.investment_price_snapshots;
  select count(*) into v_portfolios_before from public.investment_portfolio_value_snapshots;

  insert into public.investment_price_retention_runs (rows_before, details)
  values (
    v_points_before + v_snapshots_before + v_portfolios_before,
    jsonb_build_object(
      'policy', '1m_24h_30m_5d_1h_30d_1d_1y_1w_per_interval',
      'instrument_points_before', v_points_before,
      'holding_snapshots_before', v_snapshots_before,
      'portfolio_snapshots_before', v_portfolios_before
    )
  ) returning id into v_run_id;

  with ranked as (
    select id,
      row_number() over (
        partition by
          coalesce(
            listing_id::text,
            instrument_id::text,
            nullif(concat_ws(':', nullif(upper(ticker), ''), nullif(upper(exchange_code), '')), ''),
            id::text
          ),
          coalesce(bucket_interval, 'raw'),
          date_bin(
            case
              when point_at >= now() - interval '5 days' then interval '30 minutes'
              when point_at >= now() - interval '30 days' then interval '1 hour'
              when point_at >= now() - interval '1 year' then interval '1 day'
              else interval '1 week'
            end,
            point_at,
            timestamptz '2000-01-03 00:00:00+00'
          )
        order by point_at desc, created_at desc nulls last, id desc
      ) rn
    from public.investment_instrument_price_points
    where point_at < now() - interval '24 hours'
  )
  delete from public.investment_instrument_price_points p
  using ranked r
  where p.id = r.id and r.rn > 1;
  get diagnostics v_points_removed = row_count;

  with ranked as (
    select id,
      row_number() over (
        partition by user_id, holding_id,
          date_bin(
            case
              when snapshot_at >= now() - interval '5 days' then interval '30 minutes'
              when snapshot_at >= now() - interval '30 days' then interval '1 hour'
              when snapshot_at >= now() - interval '1 year' then interval '1 day'
              else interval '1 week'
            end,
            snapshot_at,
            timestamptz '2000-01-03 00:00:00+00'
          )
        order by snapshot_at desc, created_at desc nulls last, id desc
      ) rn
    from public.investment_price_snapshots
    where snapshot_at < now() - interval '24 hours'
  )
  delete from public.investment_price_snapshots s
  using ranked r
  where s.id = r.id and r.rn > 1;
  get diagnostics v_snapshots_removed = row_count;

  with ranked as (
    select id,
      row_number() over (
        partition by user_id, scope_key,
          date_bin(
            case
              when snapshot_at >= now() - interval '5 days' then interval '30 minutes'
              when snapshot_at >= now() - interval '30 days' then interval '1 hour'
              when snapshot_at >= now() - interval '1 year' then interval '1 day'
              else interval '1 week'
            end,
            snapshot_at,
            timestamptz '2000-01-03 00:00:00+00'
          )
        order by snapshot_at desc, created_at desc, id desc
      ) rn
    from public.investment_portfolio_value_snapshots
    where snapshot_at < now() - interval '24 hours'
  )
  delete from public.investment_portfolio_value_snapshots p
  using ranked r
  where p.id = r.id and r.rn > 1;
  get diagnostics v_portfolios_removed = row_count;

  select count(*) into v_points_after from public.investment_instrument_price_points;
  select count(*) into v_snapshots_after from public.investment_price_snapshots;
  select count(*) into v_portfolios_after from public.investment_portfolio_value_snapshots;

  update public.investment_price_retention_runs
  set finished_at = now(), status = 'completed',
      rows_after = v_points_after + v_snapshots_after + v_portfolios_after,
      rows_removed = v_points_removed + v_snapshots_removed + v_portfolios_removed,
      details = details || jsonb_build_object(
        'instrument_points_after', v_points_after,
        'holding_snapshots_after', v_snapshots_after,
        'portfolio_snapshots_after', v_portfolios_after,
        'instrument_points_removed', v_points_removed,
        'holding_snapshots_removed', v_snapshots_removed,
        'portfolio_snapshots_removed', v_portfolios_removed
      )
  where id = v_run_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'rows_before', v_points_before + v_snapshots_before + v_portfolios_before,
    'rows_after', v_points_after + v_snapshots_after + v_portfolios_after,
    'rows_removed', v_points_removed + v_snapshots_removed + v_portfolios_removed,
    'instrument_points_removed', v_points_removed,
    'holding_snapshots_removed', v_snapshots_removed,
    'portfolio_snapshots_removed', v_portfolios_removed
  );
exception when others then
  if v_run_id is not null then
    update public.investment_price_retention_runs
    set finished_at = now(), status = 'failed', error_message = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$function$;
