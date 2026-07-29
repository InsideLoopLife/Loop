-- v27.48: Household RPCs, wealth roll-up support and GFuel label correction backfill
create extension if not exists pgcrypto;

create or replace function app_get_or_create_household(
  p_name text default 'My household',
  p_timezone text default 'Europe/London',
  p_currency text default 'GBP',
  p_image_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user is null then raise exception 'Not signed in'; end if;

  select household_id into v_household_id
  from app_household_members
  where user_id = v_user and status = 'active'
  order by created_at asc
  limit 1;

  if v_household_id is null then
    select id into v_household_id from app_households where owner_user_id = v_user order by created_at asc limit 1;
  end if;

  if v_household_id is null then
    insert into app_households(owner_user_id, name, timezone, currency, image_url, created_at, updated_at)
    values (v_user, coalesce(nullif(trim(p_name), ''), 'My household'), coalesce(nullif(trim(p_timezone), ''), 'Europe/London'), coalesce(nullif(trim(p_currency), ''), 'GBP'), nullif(trim(coalesce(p_image_url, '')), ''), now(), now())
    returning id into v_household_id;
  end if;

  insert into app_household_members(household_id, user_id, email, role, permission_tier, status, can_manage_people, can_manage_child_profiles, can_view_household_income, can_manage_household_costs, can_manage_integrations, created_at, updated_at)
  values (v_household_id, v_user, (select email from auth.users where id = v_user), 'owner', 'owner', 'active', true, true, true, true, true, now(), now())
  on conflict (household_id, user_id) do update set status='active', role='owner', permission_tier='owner', can_manage_people=true, can_manage_child_profiles=true, can_view_household_income=true, can_manage_household_costs=true, can_manage_integrations=true, updated_at=now();

  insert into app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, (select email from auth.users where id = v_user), v_household_id, now())
  on conflict (user_id) do update set household_id = excluded.household_id, email = coalesce(app_user_profiles.email, excluded.email), updated_at = now();

  return v_household_id;
end;
$$;

create or replace function app_create_household_invite(
  p_household_id uuid,
  p_invited_email text default null,
  p_role text default 'member',
  p_permission_tier text default 'member',
  p_expires_days int default 14,
  p_base_url text default 'http://localhost:3000'
) returns table(invite_id uuid, raw_token text, short_code text, join_link text, household_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_can_manage boolean;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_short text := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  v_id uuid;
  v_name text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;

  select exists(
    select 1 from app_household_members
    where household_id = p_household_id and user_id = v_user and status = 'active'
      and (permission_tier in ('owner','admin') or can_manage_people is true)
  ) into v_can_manage;
  if not v_can_manage then raise exception 'Only household owners/admins can create invites.'; end if;

  select name into v_name from app_households where id = p_household_id;

  insert into household_join_invites(household_id, invited_by_user_id, invited_email, invited_email_hash, token_hash, short_code, role, permission_tier, status, expires_at, created_at, updated_at)
  values (
    p_household_id,
    v_user,
    nullif(lower(trim(coalesce(p_invited_email, ''))), ''),
    case when nullif(trim(coalesce(p_invited_email, '')), '') is null then null else encode(digest(lower(trim(p_invited_email)), 'sha256'), 'hex') end,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_short,
    coalesce(nullif(p_role, ''), 'member'),
    coalesce(nullif(p_permission_tier, ''), 'member'),
    'pending',
    now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 14), 60))),
    now(),
    now()
  ) returning id into v_id;

  invite_id := v_id;
  raw_token := v_token;
  short_code := v_short;
  join_link := rtrim(coalesce(p_base_url, 'http://localhost:3000'), '/') || '/household/join?token=' || v_token;
  household_name := coalesce(v_name, 'Loop household');
  return next;
end;
$$;

create or replace function app_household_invite_preview(p_token text default null, p_invite_id uuid default null)
returns table(invite_id uuid, household_name text, invited_email text, role text, permission_tier text, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select i.id, h.name, i.invited_email, i.role, i.permission_tier, i.status, i.expires_at
  from household_join_invites i
  left join app_households h on h.id = i.household_id
  where (p_invite_id is not null and i.id = p_invite_id)
     or (p_token is not null and length(p_token) <= 16 and i.short_code = upper(p_token))
     or (p_token is not null and length(p_token) > 16 and i.token_hash = encode(digest(p_token, 'sha256'), 'hex'))
  limit 1;
end;
$$;

create or replace function app_accept_household_invite(p_token text default null, p_invite_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite household_join_invites%rowtype;
  v_email_hash text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  select email into v_email from auth.users where id = v_user;
  v_email_hash := encode(digest(lower(coalesce(v_email, '')), 'sha256'), 'hex');

  select * into v_invite
  from household_join_invites
  where status = 'pending'
    and (
      (p_invite_id is not null and id = p_invite_id)
      or (p_token is not null and length(p_token) <= 16 and short_code = upper(p_token))
      or (p_token is not null and length(p_token) > 16 and token_hash = encode(digest(p_token, 'sha256'), 'hex'))
    )
  limit 1;

  if v_invite.id is null then raise exception 'Invite not found or already used.'; end if;
  if v_invite.expires_at < now() then raise exception 'Invite has expired. Ask for a fresh one.'; end if;
  if v_invite.invited_email is not null and lower(v_invite.invited_email) <> lower(coalesce(v_email, '')) then raise exception 'This invite was sent to a different email address.'; end if;
  if v_invite.invited_email is null and v_invite.invited_email_hash is not null and v_invite.invited_email_hash <> v_email_hash then raise exception 'This invite was sent to a different email address.'; end if;

  insert into app_household_members(household_id, user_id, email, role, permission_tier, status, can_manage_people, can_manage_child_profiles, can_view_household_income, can_manage_household_costs, can_manage_integrations, created_at, updated_at)
  values (
    v_invite.household_id,
    v_user,
    v_email,
    coalesce(v_invite.role, 'member'),
    coalesce(v_invite.permission_tier, 'member'),
    'active',
    coalesce(v_invite.permission_tier, 'member') in ('owner','admin'),
    coalesce(v_invite.permission_tier, 'member') in ('owner','admin','parent'),
    coalesce(v_invite.permission_tier, 'member') in ('owner','admin'),
    coalesce(v_invite.permission_tier, 'member') in ('owner','admin','parent'),
    coalesce(v_invite.permission_tier, 'member') in ('owner','admin'),
    now(),
    now()
  ) on conflict (household_id, user_id) do update set
    status='active',
    role=excluded.role,
    permission_tier=excluded.permission_tier,
    can_manage_people=excluded.can_manage_people,
    can_manage_child_profiles=excluded.can_manage_child_profiles,
    can_view_household_income=excluded.can_view_household_income,
    can_manage_household_costs=excluded.can_manage_household_costs,
    can_manage_integrations=excluded.can_manage_integrations,
    updated_at=now();

  update household_join_invites set status='accepted', accepted_user_id=v_user, accepted_at=now(), updated_at=now() where id = v_invite.id;
  insert into app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, v_email, v_invite.household_id, now())
  on conflict (user_id) do update set household_id=excluded.household_id, email=coalesce(app_user_profiles.email, excluded.email), updated_at=now();

  return v_invite.household_id;
end;
$$;

-- Backfill known GFuel cards that were corrected from the Supplement Facts label but still have zero macro snapshot fields.
update meals
set card_kind = 'drink_product',
    product_data_source = coalesce(product_data_source, 'label_image_scan'),
    calories = case when coalesce(calories, 0) = 0 then 5 else calories end,
    carbs_g = case when coalesce(carbs_g, 0) = 0 then 2 else carbs_g end,
    sugar_g = case when coalesce(sugar_g, 0) = 0 then 0 else sugar_g end,
    sodium_mg = case when coalesce(sodium_mg, 0) = 0 then 80 else sodium_mg end,
    salt_g = case when coalesce(salt_g, 0) = 0 then 0.2 else salt_g end,
    caffeine_mg = case when coalesce(caffeine_mg, 0) = 0 then 140 else caffeine_mg end,
    vitamin_c_mg = case when coalesce(vitamin_c_mg, 0) = 0 then 250 else vitamin_c_mg end,
    niacin_mg = case when coalesce(niacin_mg, 0) = 0 then 15 else niacin_mg end,
    vitamin_b12_ug = case when coalesce(vitamin_b12_ug, 0) = 0 then 10 else vitamin_b12_ug end,
    nutrition_json = coalesce(nutrition_json, '{}'::jsonb) || jsonb_build_object(
      'per_serving', jsonb_build_object('calories',5,'carbs_g',2,'sugar_g',0,'sodium_mg',80,'salt_g',0.2,'caffeine_mg',140,'vitamin_c_mg',250,'niacin_mg',15,'vitamin_b6_mg',10,'vitamin_b12_ug',10,'choline_mg',160),
      'supplement_facts', jsonb_build_object('taurine_mg',1500,'glycine_mg',500,'l_citrulline_mg',500,'l_theanine_mg',200,'glucuronolactone_mg',100,'l_carnitine_tartrate_mg',50,'choline_mg',160,'vitamin_b6_mg',10)
    ),
    updated_at = now()
where lower(label) like '%gfuel%hype%sauce%' or lower(label) like '%g fuel%hype%sauce%';


-- Make the signed-in-user RPCs callable from Supabase client sessions.
grant execute on function app_get_or_create_household(text, text, text, text) to authenticated;
grant execute on function app_create_household_invite(uuid, text, text, text, int, text) to authenticated;
grant execute on function app_household_invite_preview(text, uuid) to anon, authenticated;
grant execute on function app_accept_household_invite(text, uuid) to authenticated;
