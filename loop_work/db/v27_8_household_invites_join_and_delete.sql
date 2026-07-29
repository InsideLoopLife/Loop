-- v27.8 household invite join + household cleanup
-- Lets signed-in users accept a household invite without the Next.js server needing a Supabase service-role key.
-- Also permits owners to delete legacy/test households from Account > Households & sharing.

create extension if not exists pgcrypto;

alter table if exists household_join_invites add column if not exists accepted_user_id uuid;
alter table if exists household_join_invites add column if not exists accepted_at timestamptz;
alter table if exists household_join_invites add column if not exists updated_at timestamptz default now();
alter table if exists household_join_invites add column if not exists invited_email_hash text;

-- Older prototype schemas had tight checks that did not include later household roles/statuses.
do $$
begin
  alter table app_household_members drop constraint if exists app_household_members_role_check;
  alter table app_household_members drop constraint if exists app_household_members_status_check;
exception when undefined_table then null;
end $$;

alter table if exists app_household_members
  add constraint app_household_members_role_check
  check (role in ('owner','admin','parent','parent_admin','member','viewer','child')) not valid;

alter table if exists app_household_members
  add constraint app_household_members_status_check
  check (status in ('active','invited','pending','removed','left')) not valid;

alter table if exists app_households enable row level security;
drop policy if exists app_households_owner_delete on app_households;
create policy app_households_owner_delete
on app_households for delete
using (owner_user_id = auth.uid());

create or replace function public.app_accept_household_invite(
  p_token text default null,
  p_invite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''));
  v_token text := trim(coalesce(p_token, ''));
  v_short_code text := upper(trim(coalesce(p_token, '')));
  v_token_hash text := case when trim(coalesce(p_token, '')) <> '' then encode(digest(trim(coalesce(p_token, '')), 'sha256'), 'hex') else null end;
  v_invite household_join_invites%rowtype;
  v_owner_user_id uuid;
  v_household_name text;
  v_tier text;
  v_role text;
  v_can_manage_people boolean;
  v_can_manage_child_profiles boolean;
  v_can_view_household_income boolean;
  v_can_manage_household_costs boolean;
  v_can_manage_integrations boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in before accepting a household invite.';
  end if;

  if p_invite_id is null and v_token = '' then
    raise exception 'Enter a household invite code or use a valid invite link.';
  end if;

  if p_invite_id is not null then
    select * into v_invite
    from household_join_invites
    where id = p_invite_id
    for update;
  else
    select * into v_invite
    from household_join_invites
    where (upper(short_code) = v_short_code or token_hash = v_token_hash)
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_invite.id is null then
    raise exception 'Invite not found. Check the code or ask for a fresh household invite.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer pending. Ask for a fresh household invite.';
  end if;

  if v_invite.expires_at < now() then
    update household_join_invites
      set status = 'expired', updated_at = now()
      where id = v_invite.id;
    raise exception 'This invite has expired. Ask for a fresh household invite.';
  end if;

  if coalesce(v_invite.invited_email, '') <> '' then
    if v_email = '' or lower(v_invite.invited_email) <> v_email then
      raise exception 'This invite was sent to %. Sign in with that email to accept it.', v_invite.invited_email;
    end if;
  elsif coalesce(v_invite.invited_email_hash, '') <> '' then
    if v_email = '' or v_invite.invited_email_hash <> encode(digest(v_email, 'sha256'), 'hex') then
      raise exception 'This invite was sent to a different email address.';
    end if;
  end if;

  select owner_user_id, name into v_owner_user_id, v_household_name
  from app_households
  where id = v_invite.household_id;

  if v_owner_user_id is null then
    raise exception 'The household for this invite could not be found.';
  end if;

  v_tier := coalesce(nullif(v_invite.permission_tier, ''), 'member');
  v_role := coalesce(nullif(v_invite.role, ''), 'member');
  v_can_manage_people := v_tier in ('owner','admin');
  v_can_manage_child_profiles := v_tier in ('owner','admin','parent','parent_admin');
  v_can_view_household_income := v_tier in ('owner','admin');
  v_can_manage_household_costs := v_tier in ('owner','admin','parent','parent_admin');
  v_can_manage_integrations := v_tier in ('owner','admin');

  insert into app_household_members (
    household_id,
    user_id,
    email,
    role,
    permission_tier,
    status,
    can_manage_people,
    can_manage_child_profiles,
    can_view_household_income,
    can_manage_household_costs,
    can_manage_integrations,
    updated_at
  ) values (
    v_invite.household_id,
    v_user_id,
    nullif(v_email, ''),
    v_role,
    v_tier,
    'active',
    v_can_manage_people,
    v_can_manage_child_profiles,
    v_can_view_household_income,
    v_can_manage_household_costs,
    v_can_manage_integrations,
    now()
  )
  on conflict (household_id, user_id) do update set
    email = excluded.email,
    role = excluded.role,
    permission_tier = excluded.permission_tier,
    status = 'active',
    can_manage_people = excluded.can_manage_people,
    can_manage_child_profiles = excluded.can_manage_child_profiles,
    can_view_household_income = excluded.can_view_household_income,
    can_manage_household_costs = excluded.can_manage_household_costs,
    can_manage_integrations = excluded.can_manage_integrations,
    updated_at = now();

  update household_join_invites
    set status = 'accepted',
        accepted_user_id = v_user_id,
        accepted_at = now(),
        updated_at = now()
    where id = v_invite.id;

  insert into app_user_profiles (user_id, email, household_id, updated_at)
  values (v_user_id, nullif(v_email, ''), v_invite.household_id, now())
  on conflict (user_id) do update set
    email = coalesce(app_user_profiles.email, excluded.email),
    household_id = excluded.household_id,
    updated_at = now();

  -- Claim an existing adult/partner profile inside the inviting household when the owner
  -- already created one using the same email. This avoids duplicate Bethany/partner records.
  if v_email <> '' then
    update people
      set linked_user_id = v_user_id,
          email = coalesce(email, v_email),
          invite_email = coalesce(invite_email, v_email),
          account_status = 'linked',
          updated_at = now()
      where user_id = v_owner_user_id
        and relationship <> 'child'
        and (linked_user_id is null or linked_user_id = v_user_id)
        and (lower(coalesce(email, '')) = v_email or lower(coalesce(invite_email, '')) = v_email);
  end if;

  insert into app_notifications (
    user_id,
    household_id,
    notification_type,
    severity,
    status,
    title,
    body,
    cta_label,
    cta_href
  ) values (
    v_user_id,
    v_invite.household_id,
    'household_invite',
    'success',
    'unread',
    'Household joined',
    'You joined ' || coalesce(v_household_name, 'this household') || '. You can switch households from Account settings.',
    'Open dashboard',
    '/dashboard'
  );

  return jsonb_build_object(
    'ok', true,
    'household_id', v_invite.household_id,
    'household_name', v_household_name,
    'claimed_email', v_email
  );
end;
$$;

grant execute on function public.app_accept_household_invite(text, uuid) to authenticated;
