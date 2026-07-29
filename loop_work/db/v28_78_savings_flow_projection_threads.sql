-- LOOP v28.78 - Savings flow, automatic projection, activity threads and independent pots

alter table if exists public.savings_account_movements
  add column if not exists previous_balance numeric(14,2),
  add column if not exists balance_delta numeric(14,2),
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_note text,
  add column if not exists tax_year text;

alter table if exists public.savings_account_movements
  drop constraint if exists savings_account_movements_type_check;

alter table if exists public.savings_account_movements
  add constraint savings_account_movements_type_check check (
    movement_type in (
      'opening_balance','deposit','withdrawal','interest','fee','balance_correction',
      'transfer_in','transfer_out','manual_adjustment'
    )
  );

create unique index if not exists savings_account_movements_one_opening_uidx
  on public.savings_account_movements(financial_account_id)
  where movement_type = 'opening_balance';

-- Existing accounts need a ledger baseline so future balance changes can be shown as rises/dips.
-- Where older movement rows already exist, infer the pre-movement opening value instead of
-- treating today's confirmed balance as though it had always been present.
with account_baselines as (
  select
    fa.*,
    coalesce(fa.start_date, fa.created_at::date, current_date) as opening_date,
    greatest(
      0,
      coalesce(
        fa.opening_balance_assumption,
        case
          when first_movement.resulting_balance is null then null
          when first_movement.movement_type in ('deposit', 'interest', 'transfer_in')
            then first_movement.resulting_balance - abs(coalesce(first_movement.amount, 0))
          when first_movement.movement_type in ('withdrawal', 'fee', 'transfer_out')
            then first_movement.resulting_balance + abs(coalesce(first_movement.amount, 0))
          else first_movement.resulting_balance
        end,
        fa.balance_last_confirmed_value,
        fa.current_balance,
        0
      )
    ) as opening_value
  from public.financial_accounts fa
  left join lateral (
    select
      sam.movement_type,
      sam.amount,
      sam.resulting_balance
    from public.savings_account_movements sam
    where sam.financial_account_id = fa.id
      and sam.movement_type <> 'opening_balance'
    order by sam.effective_at asc, sam.created_at asc, sam.id asc
    limit 1
  ) first_movement on true
  where coalesce(fa.is_liability, false) = false
    and coalesce(fa.account_type, '') <> 'current_account'
)
insert into public.savings_account_movements (
  user_id,
  owner_user_id,
  created_by_user_id,
  household_id,
  visibility_scope,
  financial_account_id,
  movement_type,
  amount,
  previous_balance,
  balance_delta,
  resulting_balance,
  effective_at,
  note,
  source_type,
  source_note,
  tax_year
)
select
  fa.user_id,
  coalesce(fa.owner_user_id, fa.user_id),
  coalesce(fa.created_by_user_id, fa.user_id),
  fa.household_id,
  case when coalesce(fa.visibility_scope, 'private') = 'household' then 'household' else 'private' end,
  fa.id,
  'opening_balance',
  fa.opening_value,
  0,
  fa.opening_value,
  fa.opening_value,
  fa.opening_date,
  'Opening balance created when the savings ledger was enabled.',
  'migration_backfill',
  'Opening savings baseline used by charts and activity threads.',
  case
    when extract(month from fa.opening_date) >= 4
      then extract(year from fa.opening_date)::int::text || '/' || right((extract(year from fa.opening_date)::int + 1)::text, 2)
    else (extract(year from fa.opening_date)::int - 1)::text || '/' || right(extract(year from fa.opening_date)::int::text, 2)
  end
from account_baselines fa
where not exists (
  select 1 from public.savings_account_movements sam
  where sam.financial_account_id = fa.id and sam.movement_type = 'opening_balance'
)
on conflict do nothing;

-- Enrich legacy rows where a resulting balance was already stored. This makes older activity
-- immediately useful in the account thread without rewriting the amount or event type.
with ordered_movements as (
  select
    sam.id,
    lag(sam.resulting_balance) over (
      partition by sam.financial_account_id
      order by
        sam.effective_at asc,
        case when sam.movement_type = 'opening_balance' then 0 else 1 end,
        sam.created_at asc,
        sam.id asc
    ) as inferred_previous_balance
  from public.savings_account_movements sam
)
update public.savings_account_movements sam
set
  previous_balance = coalesce(sam.previous_balance, ordered.inferred_previous_balance),
  balance_delta = coalesce(
    sam.balance_delta,
    sam.resulting_balance - ordered.inferred_previous_balance
  )
from ordered_movements ordered
where ordered.id = sam.id
  and sam.movement_type <> 'opening_balance'
  and sam.resulting_balance is not null
  and ordered.inferred_previous_balance is not null
  and (sam.previous_balance is null or sam.balance_delta is null);

update public.savings_account_movements sam
set tax_year = case
  when extract(month from sam.effective_at) >= 4
    then extract(year from sam.effective_at)::int::text || '/' || right((extract(year from sam.effective_at)::int + 1)::text, 2)
  else (extract(year from sam.effective_at)::int - 1)::text || '/' || right(extract(year from sam.effective_at)::int::text, 2)
end
where sam.tax_year is null;

-- Independent pots were introduced in v28.75; complete their access rules here.
alter table if exists public.savings_pots enable row level security;
alter table if exists public.savings_pot_allocations enable row level security;

drop policy if exists "savings pots own or household" on public.savings_pots;
create policy "savings pots own or household"
  on public.savings_pots for all
  using (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and exists (
        select 1 from public.app_household_members m
        where m.household_id = savings_pots.household_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  )
  with check (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and exists (
        select 1 from public.app_household_members m
        where m.household_id = savings_pots.household_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );

drop policy if exists "savings pot allocations via visible pot" on public.savings_pot_allocations;
create policy "savings pot allocations via visible pot"
  on public.savings_pot_allocations for all
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.savings_pots p
      where p.id = savings_pot_allocations.savings_pot_id
        and p.visibility_scope = 'household'
        and p.household_id is not null
        and exists (
          select 1 from public.app_household_members m
          where m.household_id = p.household_id
            and m.user_id = auth.uid()
            and m.status = 'active'
        )
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.savings_pots p
      where p.id = savings_pot_allocations.savings_pot_id
        and p.visibility_scope = 'household'
        and p.household_id is not null
        and exists (
          select 1 from public.app_household_members m
          where m.household_id = p.household_id
            and m.user_id = auth.uid()
            and m.status = 'active'
        )
    )
  );

create index if not exists savings_account_movements_effective_account_idx
  on public.savings_account_movements(financial_account_id, effective_at, created_at);

insert into public.app_build_notes(build_key, title, notes, payload, updated_at)
values (
  'v28_78_savings_flow_projection_threads',
  'Savings flow, automatic projection, threads and pots',
  'Savings projections now use recorded account rates, pension history and contribution events. Balance changes create ledger events, account threads are month-based, pots can be created independently and the rate optimiser exposes opportunity cost.',
  '{"areas":["savings","financial_flow","pensions","loopwatch"],"requires_sql":true}'::jsonb,
  now()
)
on conflict (build_key) do update
set title = excluded.title,
    notes = excluded.notes,
    payload = excluded.payload,
    updated_at = now();

notify pgrst, 'reload schema';
select 'v28_78_savings_flow_projection_threads' as migration_marker;
