-- A pension fund can have more than one dated purchase in a month. The old
-- user/fund/month constraint made a contribution thread behave like a monthly
-- summary and prevented provider-statement reconciliation.
alter table public.pension_contribution_events
  drop constraint if exists pension_contribution_events_user_id_pension_fund_id_contrib_key;

create index if not exists pension_contribution_events_account_date_idx
  on public.pension_contribution_events (user_id, pension_account_id, investment_date desc);

create index if not exists pension_contribution_events_fund_date_idx
  on public.pension_contribution_events (user_id, pension_fund_id, investment_date desc);

revoke all on table public.pension_contribution_events from anon;
revoke all on table public.pension_contribution_events from authenticated;
grant select, insert, update, delete on table public.pension_contribution_events to authenticated;

drop policy if exists "Users read their pension contribution events" on public.pension_contribution_events;
drop policy if exists pension_contribution_events_delete_own on public.pension_contribution_events;
drop policy if exists pension_contribution_events_insert_own on public.pension_contribution_events;
drop policy if exists pension_contribution_events_select_own on public.pension_contribution_events;
drop policy if exists pension_contribution_events_update_own on public.pension_contribution_events;

create policy pension_contribution_events_select_own
  on public.pension_contribution_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy pension_contribution_events_insert_own
  on public.pension_contribution_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy pension_contribution_events_update_own
  on public.pension_contribution_events for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pension_contribution_events_delete_own
  on public.pension_contribution_events for delete
  to authenticated
  using ((select auth.uid()) = user_id);
