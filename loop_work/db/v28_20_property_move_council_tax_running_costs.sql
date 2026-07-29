-- v28.20 - property move council-tax/running-cost/mortgage-estimate polish

alter table property_move_queries add column if not exists property_use text default 'primary_home';
alter table property_move_queries add column if not exists council_tax_confidence numeric(5,2);
alter table property_move_queries add column if not exists council_tax_authority text;
alter table property_move_queries add column if not exists council_tax_source_url text;
alter table property_move_queries add column if not exists map_latitude numeric(12,8);
alter table property_move_queries add column if not exists map_longitude numeric(12,8);
alter table property_move_queries add column if not exists map_embed_url text;
alter table property_move_queries add column if not exists service_charge_monthly numeric(12,2);
alter table property_move_queries add column if not exists maintenance_allowance_monthly numeric(12,2);
alter table property_move_queries add column if not exists running_cost_breakdown jsonb default '{}'::jsonb;

comment on column property_move_queries.property_use is 'primary_home, second_home or buy_to_let. Drives stamp duty and equity/deposit assumptions.';
comment on column property_move_queries.council_tax_confidence is 'Confidence in council tax band/annual estimate. Listing band + local authority source should target 95+.';
comment on column property_move_queries.council_tax_source_url is 'Council or GOV source used to verify council tax amount.';
comment on column property_move_queries.map_embed_url is 'Cached OSM embed URL used as fallback when no listing image is available.';
comment on column property_move_queries.running_cost_breakdown is 'Explainable recurring cost breakdown: mortgage, council tax, energy, service/estate charges, maintenance allowance.';

update property_move_queries
set property_use = coalesce(property_use, 'primary_home'),
    running_cost_breakdown = coalesce(running_cost_breakdown, '{}'::jsonb),
    maintenance_allowance_monthly = coalesce(maintenance_allowance_monthly, round((coalesce(asking_price, 0) * 0.0075 / 12)::numeric, 2))
where property_use is null
   or running_cost_breakdown is null
   or maintenance_allowance_monthly is null;

insert into public.app_future_integration_tasks (product_key, task_key, section, title, description, priority, status, metadata)
values
  ('houses', 'verify-council-tax-rates-by-authority', 'property-enrichment', 'Verify council tax rates by local authority', 'Add confirmed annual Band A-H rows/source URLs for target councils so moving-home running cost confidence can reach 95%+ instead of using national fallback estimates.', 131, 'todo', '{}'::jsonb),
  ('houses', 'connect-voa-band-check-flow', 'property-enrichment', 'Add VOA council-tax band check flow', 'Use the listing band first, then give users/admin a direct source trail for confirming council tax band and annual amount.', 132, 'todo', '{}'::jsonb),
  ('houses', 'wire-live-mortgage-range-into-move-cards', 'mortgage-watch', 'Wire live mortgage range into move cards', 'Replace static rate +/- range with filtered catalogue rows once enough active mortgage products exist by term and LTV.', 133, 'todo', '{}'::jsonb)
on conflict (product_key, task_key) do update set
  section = excluded.section,
  title = excluded.title,
  description = excluded.description,
  priority = excluded.priority,
  status = case when public.app_future_integration_tasks.status = 'done' then public.app_future_integration_tasks.status else excluded.status end,
  metadata = excluded.metadata,
  updated_at = now();
