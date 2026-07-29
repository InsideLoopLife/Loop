begin;

alter table public.investment_price_snapshots
  add column if not exists snapshot_batch_id uuid;

create index if not exists investment_price_snapshots_user_batch_idx
  on public.investment_price_snapshots(user_id, snapshot_batch_id, snapshot_at)
  where snapshot_batch_id is not null;

comment on column public.investment_price_snapshots.snapshot_batch_id is
  'Identifies every holding snapshot written during the same portfolio refresh. Account charts must aggregate complete batches rather than individual ticker timestamps.';

commit;
