-- v28.17 Property move planner confidence + archive cleanup
-- Run after v28.16.

alter table if exists public.property_move_queries
  add column if not exists image_url text,
  add column if not exists archived_at timestamptz,
  add column if not exists delete_after timestamptz;

alter table if exists public.property_move_queries
  add column if not exists source_confidence integer default 40;

create index if not exists property_move_queries_delete_after_idx
  on public.property_move_queries(status, delete_after)
  where status = 'archived' and delete_after is not null;

-- Ensure archived rows created before this update are not kept forever.
update public.property_move_queries
set archived_at = coalesce(archived_at, updated_at, now()),
    delete_after = coalesce(delete_after, coalesce(updated_at, now()) + interval '14 days')
where status = 'archived';
