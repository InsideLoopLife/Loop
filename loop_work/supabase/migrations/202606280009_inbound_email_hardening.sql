-- LOOP v28.09 Email-to-LOOP hardening
-- Run after db/v28_08_inbound_email_premium.sql.

create unique index if not exists loop_inbound_events_provider_msg_unique
  on public.loop_inbound_email_events(provider_message_id, alias, domain)
  where provider_message_id is not null and provider_message_id <> '';

create index if not exists loop_inbound_events_from_email_created_idx
  on public.loop_inbound_email_events(from_email, created_at desc);

create index if not exists loop_inbound_events_user_created_idx
  on public.loop_inbound_email_events(user_id, created_at desc);

create index if not exists loop_inbound_aliases_sender_idx
  on public.loop_inbound_aliases(allowed_sender_email)
  where status = 'active';

-- Users need to be able to approve/reject only their own staged imports from the account page.
drop policy if exists "inbound imports owner update" on public.loop_inbound_imports;
create policy "inbound imports owner update"
  on public.loop_inbound_imports
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Alias ownership remains read-only from the browser. Creation still happens through the security-definer RPC.
drop policy if exists "inbound aliases owner update" on public.loop_inbound_aliases;

-- Lock down function execution. The webhook route uses service_role; browser users only need claim + entitlement read.
revoke all on function public.loop_user_has_inbound_email_entitlement(uuid) from public;
grant execute on function public.loop_user_has_inbound_email_entitlement(uuid) to authenticated, service_role;

grant execute on function public.loop_claim_inbound_alias(text) to authenticated;
