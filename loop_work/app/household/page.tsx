import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, Mail, QrCode, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { FormInput } from "@/components/FormInput";
import { ProfileImageFileInput } from "@/components/ProfileImageFileInput";
import { SafeAvatar } from "@/components/SafeAvatar";
import { HouseholdOverviewDashboard } from "@/components/household/HouseholdOverviewDashboard";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { processPendingHouseholdLinksForUser } from "@/lib/auth/invite-linking";
import { dedupeHouseholdPeople, getActiveHouseholdContext, householdMemberDataOrFilter, householdPeopleOrFilter, visibleDataOrFilter } from "@/lib/auth/household-context";
import { formatPersonDate, DateDisplayFormat } from "@/lib/format/date";
import { buildHouseholdOverviewModel } from "@/lib/household/household-overview-model";
import {
  createHouseholdFromHouseholdPage,
  createOpenHouseholdQrInvite,
  deleteHousehold,
  inviteExistingUserToHousehold,
  leaveHousehold,
  removeHouseholdMember,
  updateHouseholdMemberRole,
} from "./actions";

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  birth_date: string | null;
  linked_user_id: string | null;
  avatar_url: string | null;
  email: string | null;
  account_status: string | null;
  user_id?: string | null;
  income_visible_to_household: boolean | null;
  costs_visible_to_household: boolean | null;
  household_can_add_costs: boolean | null;
};

type Member = {
  id: string;
  household_id: string;
  user_id: string;
  email: string | null;
  role: string | null;
  permission_tier: string | null;
  status: string | null;
  can_manage_people: boolean | null;
  can_manage_child_profiles: boolean | null;
  can_view_household_income: boolean | null;
  can_manage_household_costs: boolean | null;
  can_manage_integrations: boolean | null;
};

type GuardianLink = { child_person_id: string; guardian_person_id: string };

type Invite = {
  id: string;
  invited_email: string | null;
  role: string | null;
  permission_tier: string | null;
  short_code: string;
  status: string;
  expires_at: string;
};

function roleDescription(tier?: string | null) {
  switch (tier) {
    case "owner":
      return "Full household control, including members, children, permissions and shared settings.";
    case "admin":
      return "Can invite/remove members and manage shared household planning areas.";
    case "parent":
      return "Can manage assigned children and child-related household costs.";
    case "viewer":
      return "Read-only access to shared household information.";
    default:
      return "Owns their own data and only shares what they choose with the household.";
  }
}

function relationshipClass(relationship: Person["relationship"]) {
  if (relationship === "child") return "border-sky-200 bg-sky-50";
  if (relationship === "self" || relationship === "partner") return "border-orange-200 bg-orange-50";
  return "border-slate-200 bg-white";
}

function personPermissionBadges(person: Person, member?: Member | null) {
  const badges: { label: string; tone: string }[] = [];

  if (member?.permission_tier) badges.push({ label: `tier: ${member.permission_tier}`, tone: "bg-slate-950 text-white" });
  if (!person.linked_user_id && person.relationship === "child") badges.push({ label: "managed profile", tone: "bg-white text-slate-700" });
  if (!person.linked_user_id && person.relationship !== "child") badges.push({ label: (person.account_status || "invited").replaceAll("_", " "), tone: "bg-white text-slate-700" });
  if (person.income_visible_to_household) badges.push({ label: "income shared", tone: "bg-emerald-100 text-emerald-700" });
  if (person.costs_visible_to_household) badges.push({ label: "costs shared", tone: "bg-sky-100 text-sky-700" });
  if (person.household_can_add_costs) badges.push({ label: "costs editable", tone: "bg-orange-100 text-orange-700" });

  return badges.slice(0, 4);
}

function PersonNode({ person, dateDisplayFormat, member }: { person: Person; dateDisplayFormat: DateDisplayFormat; member?: Member | null }) {
  const verified = Boolean(person.linked_user_id);
  const badges = personPermissionBadges(person, member);
  return (
    <div className={`relative w-full overflow-hidden rounded-[2rem] border p-5 shadow-sm ${relationshipClass(person.relationship)}`}>
      <div className="grid gap-4 text-center md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_180px] md:items-center md:text-left">
        <div className="mx-auto sm:mx-0">
          <SafeAvatar src={person.avatar_url} name={person.name} className="h-20 w-20 rounded-3xl ring-4 ring-white/70" fallbackClassName="bg-white/90 text-2xl text-slate-700" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-center gap-2 md:justify-start">
            <p className="truncate text-xl font-black text-slate-950">{person.name}</p>
            {verified ? <span title="Linked to a confirmed account" className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[11px] font-black text-white">✓</span> : null}
          </div>
          <p className="mt-1 text-sm capitalize text-slate-600">{person.relationship}</p>
          {person.birth_date ? <p className="mt-1 text-xs font-bold text-slate-500">{formatPersonDate(person.birth_date, dateDisplayFormat)}</p> : null}
          {person.email ? <p className="mt-1 truncate text-xs font-bold text-slate-400">{person.email}</p> : null}
          <Link href={`/household/${person.id}`} className="mt-3 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Open profile</Link>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5 xl:justify-end">
          {badges.map((badge) => (
            <span key={badge.label} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badge.tone}`}>{badge.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateHouseholdEmptyState({ profile }: { profile: any }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <section className="relative overflow-hidden rounded-[3rem] border border-white/80 bg-white/82 p-8 shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)] backdrop-blur-xl md:p-12">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
            <Home className="absolute right-6 top-6 h-72 w-72 text-slate-950" />
            <Home className="absolute bottom-2 left-8 h-44 w-44 text-orange-600" />
          </div>
          <div className="relative grid gap-8 lg:grid-cols-[1fr_.82fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-700">
                <UsersRound className="h-4 w-4" /> Household setup
              </div>
              <h1 className="mt-5 max-w-2xl text-5xl font-black tracking-tight text-slate-950 md:text-6xl">Let’s build your household.</h1>
              <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">
                A household is optional. Create one when you want shared planning, child profiles, household bills, invite links and a shared family dashboard. Your own private records still belong to you.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["1", "Name the household"],
                  ["2", "Invite existing users"],
                  ["3", "Manage sharing permissions"],
                ].map(([step, label]) => (
                  <div key={step} className="rounded-3xl border border-slate-200 bg-white/75 p-4">
                    <p className="text-2xl font-black text-slate-950">{step}</p>
                    <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <form action={createHouseholdFromHouseholdPage} className="relative rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/10">
              <h2 className="text-2xl font-black text-slate-950">Create household</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">You become the household owner. You can invite others after it is created.</p>
              <div className="mt-5 space-y-4">
                <FormInput label="Household name" name="household_name" required placeholder="The Charlton Household" />
                <FormInput label="Timezone" name="timezone" defaultValue={profile?.timezone || "Europe/London"} required />
                <FormInput label="Currency" name="currency" defaultValue={profile?.currency || "GBP"} required />
                <ProfileImageFileInput name="household_image" />
              </div>
              <div className="mt-6"><SubmitButton>Build household</SubmitButton></div>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}

export default async function HouseholdPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await processPendingHouseholdLinksForUser({ userId: user.id, email: user.email });
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdPeopleFilter = householdPeopleOrFilter(householdContext);
  const memberFilter = householdMemberDataOrFilter(householdContext);
  const visibleFilter = visibleDataOrFilter(householdContext);
  const dataClient = supabase;
  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("date_display_format, default_person_image_mode, timezone, currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!householdContext.householdId) {
    return <CreateHouseholdEmptyState profile={profile} />;
  }

  const householdId = householdContext.householdId;
  const canManage = householdContext.canManagePeople || ["owner", "admin"].includes(householdContext.permissionTier);
  const dateDisplayFormat = (profile?.date_display_format || "age_and_date") as DateDisplayFormat;

  const monthKey = new Date().toISOString().slice(0, 7);

  const [
    householdResult,
    peopleResult,
    membersResult,
    guardiansResult,
    invitesResult,
    payResult,
    incomeResult,
    plannedResult,
    spendingResult,
    categoriesResult,
    accountsResult,
    pensionsResult,
    potsResult,
    homesResult,
    livingProfilesResult,
    petsResult,
    vehiclesResult,
    carbonProfileResult,
  ] = await Promise.all([
    dataClient.from("app_households").select("id, name, timezone, currency, owner_user_id, image_url").eq("id", householdId).maybeSingle(),
    dataClient
      .from("people")
      .select("id, user_id, name, relationship, birth_date, linked_user_id, avatar_url, email, account_status, income_visible_to_household, costs_visible_to_household, household_can_add_costs")
      .or(householdPeopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .is("active_until", null)
      .order("relationship")
      .order("name"),
    dataClient.from("app_household_members").select("*").eq("household_id", householdId).eq("status", "active").order("created_at", { ascending: true }),
    dataClient.from("person_guardians").select("child_person_id, guardian_person_id").in("user_id", householdContext.memberUserIds),
    dataClient.from("household_join_invites").select("id, invited_email, role, permission_tier, short_code, status, expires_at").eq("household_id", householdId).order("created_at", { ascending: false }).limit(10),
    dataClient.from("pay_events").select("id, person_id, label, pay_kind, monthly_take_home_override, gross_annual_salary, effective_from, effective_until").or(memberFilter),
    dataClient.from("income_entries").select("id, person_id, label, gross_amount, net_amount, frequency, entry_date").or(memberFilter),
    dataClient.from("planned_items").select("id, person_id, category_id, direction, label, amount, recurrence, start_date, end_date, item_type, notes").or(visibleFilter),
    dataClient.from("spending_entries").select("id, person_id, category_id, label, amount, spent_at, notes").or(visibleFilter),
    dataClient.from("spending_categories").select("id, name, type, standard_category_key").or(visibleFilter),
    dataClient.from("financial_accounts").select("id, owner_person_id, person_id, ownership_scope, name, provider, account_type, current_balance, is_liability, monthly_top_up_amount").or(memberFilter),
    dataClient.from("pension_accounts").select("id, person_id, label, provider, fixed_monthly_contribution").or(memberFilter),
    dataClient.from("savings_pots").select("id, person_id, name, target_amount, target_date, monthly_target, current_allocated_amount, status, visibility_scope, icon, colour").or(visibleFilter),
    dataClient.from("homes").select("id, label, full_address, postcode, property_type, ownership_status").or(visibleFilter).limit(3),
    dataClient.from("household_living_profiles").select("id, household_id, home_id, property_kind, property_style, tenure, bedrooms, occupants_override, heating_type, epc_rating, source").eq("household_id", householdId).order("created_at", { ascending: false }).limit(1),
    dataClient.from("household_pets").select("id, name, species, breed, birth_date, insurer, vet_name, notes").eq("household_id", householdId).eq("status", "active").order("name"),
    dataClient.from("household_vehicles").select("id, name, registration, owner_person_id, make_model, fuel_type, annual_miles, mpg, monthly_finance, insurer, insurance_renewal_date").eq("household_id", householdId).eq("status", "active").order("created_at"),
    dataClient.from("household_carbon_profiles").select("food_assumption_adopted, annual_offset_kg, offset_provider, offset_notes").eq("household_id", householdId).maybeSingle(),
  ]);

  const household = householdResult.data as any;
  const rawPeople = (peopleResult.data || []) as Person[];
  const members = (membersResult.data || []) as Member[];
  const guardianLinks = (guardiansResult.data || []) as GuardianLink[];
  const invites = (invitesResult.data || []) as Invite[];
  const pets = (petsResult.data || []) as any[];

  const linkedUserIds = rawPeople.map((person) => person.linked_user_id).filter(Boolean) as string[];
  const profileAvatarMap = new Map<string, string>();
  if (linkedUserIds.length > 0) {
    const { data: linkedProfiles } = await dataClient
      .from("app_user_profiles")
      .select("user_id, avatar_url")
      .in("user_id", linkedUserIds);
    (linkedProfiles || []).forEach((linkedProfile: any) => {
      if (linkedProfile.user_id && linkedProfile.avatar_url) profileAvatarMap.set(linkedProfile.user_id, linkedProfile.avatar_url);
    });
  }

  const memberProfileMap = new Map<string, any>();
  const memberProfileByEmail = new Map<string, any>();
  if (members.length > 0) {
    const { data: memberProfiles } = await dataClient
      .from("app_user_profiles")
      .select("user_id, email, display_name, full_name, avatar_url")
      .in("user_id", members.map((member) => member.user_id));
    (memberProfiles || []).forEach((profile: any) => {
      memberProfileMap.set(profile.user_id, profile);
      if (profile.email) memberProfileByEmail.set(String(profile.email).toLowerCase(), profile);
    });
  }

  const peopleWithAvatars = rawPeople.map((person) => {
    const linkedProfile = person.linked_user_id ? memberProfileMap.get(person.linked_user_id) : null;
    const emailProfile = person.email ? memberProfileByEmail.get(String(person.email).toLowerCase()) : null;
    const profile = linkedProfile || emailProfile || {};
    const profileName = profile.display_name || profile.full_name;
    return {
      ...person,
      name: profileName || person.name,
      email: person.email || profile.email || null,
      linked_user_id: person.linked_user_id || profile.user_id || null,
      avatar_url: person.avatar_url || profile.avatar_url || (person.linked_user_id ? profileAvatarMap.get(person.linked_user_id) || null : null),
    };
  });

  const linkedMemberIds = new Set(peopleWithAvatars.map((person) => person.linked_user_id).filter(Boolean));
  const linkedMemberEmails = new Set(peopleWithAvatars.map((person) => String(person.email || "").toLowerCase()).filter(Boolean));
  const virtualMembers = members
    .filter((member) => !linkedMemberIds.has(member.user_id) && !linkedMemberEmails.has(String(member.email || memberProfileMap.get(member.user_id)?.email || "").toLowerCase()))
    .map((member) => {
      const profile = memberProfileMap.get(member.user_id) || {};
      const label = profile.display_name || profile.full_name || profile.email || member.email || "Household member";
      return {
        id: `member-${member.user_id}`,
        user_id: member.user_id,
        name: label,
        relationship: "other" as const,
        birth_date: null,
        linked_user_id: member.user_id,
        avatar_url: profile.avatar_url || null,
        email: profile.email || member.email || null,
        account_status: "linked",
        income_visible_to_household: Boolean(member.can_view_household_income),
        costs_visible_to_household: Boolean(member.can_manage_household_costs),
        household_can_add_costs: Boolean(member.can_manage_household_costs),
      };
    });

  const personIdentityKey = (person: Person) => person.linked_user_id ? `linked:${person.linked_user_id}` : person.email ? `email:${String(person.email).toLowerCase()}` : `id:${person.id}`;
  const dedupedPeopleMap = new Map<string, Person>();
  [...peopleWithAvatars, ...virtualMembers].forEach((person) => {
    const key = personIdentityKey(person);
    const existing = dedupedPeopleMap.get(key);
    if (!existing || (person.user_id === householdContext.dataOwnerUserId && existing.user_id !== householdContext.dataOwnerUserId) || (person.linked_user_id && !existing.linked_user_id)) {
      dedupedPeopleMap.set(key, person);
    }
  });
  const people = dedupeHouseholdPeople(Array.from(dedupedPeopleMap.values()), householdContext.dataOwnerUserId);
  const membersByUserId = new Map(members.map((member) => [member.user_id, member]));
  const adults = people.filter((person) => person.relationship !== "child");
  const children = people.filter((person) => person.relationship === "child");
  const selectedGuardianIds = new Set(guardianLinks.map((link) => link.guardian_person_id));
  const householdOverviewModel = buildHouseholdOverviewModel({
    monthKey,
    people,
    payEvents: (payResult.data || []) as any,
    incomeEntries: (incomeResult.data || []) as any,
    plannedItems: (plannedResult.data || []) as any,
    spendingEntries: (spendingResult.data || []) as any,
    categories: (categoriesResult.data || []) as any,
    financialAccounts: (accountsResult.data || []) as any,
    pensionAccounts: (pensionsResult.data || []) as any,
    savingsPots: (potsResult.data || []) as any,
    homes: (homesResult.data || []) as any,
    livingProfiles: (livingProfilesResult.data || []) as any,
    vehicles: (vehiclesResult.data || []) as any,
    carbonProfile: carbonProfileResult.data as any,
  });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <HouseholdOverviewDashboard
          household={{ name: household?.name || householdContext.householdName || "Household", image_url: household?.image_url || null }}
          people={people}
          pets={pets}
          vehicles={(vehiclesResult.data || []) as any}
          carbonProfile={carbonProfileResult.data as any}
          model={householdOverviewModel}
          canManage={canManage}
        />

        {canManage ? (
          <section id="invite" className="grid gap-6">
            <SectionCard title="Invite an adult/account" description="Add an email or username. Existing users receive an in-app notification and email; new users receive a branded account setup invite. Everyone must accept before joining.">
              <form action={inviteExistingUserToHousehold} className="space-y-4">
                <FormInput label="Email or username" name="invite_to" placeholder="bethany@example.com or @bethany" required />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block"><span className="text-sm font-black text-slate-700">Role</span><select name="role" defaultValue="member" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"><option value="member">Individual/member</option><option value="parent">Parent/guardian</option><option value="admin">Household admin</option><option value="viewer">Viewer</option></select></label>
                  <label className="block"><span className="text-sm font-black text-slate-700">Permission tier</span><select name="permission_tier" defaultValue="member" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"><option value="member">Member</option><option value="parent">Parent</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></label>
                </div>
                <FormInput label="Expires after days" name="expires_days" type="number" defaultValue={14} />
                <SubmitButton>Send invite</SubmitButton>
              </form>
            </SectionCard>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
          <SectionCard title="Members, roles and permission tiers" description="Roles decide household access. Financial and health visibility are controlled by the person/profile and the household sharing toggles.">
            <details className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              <summary className="cursor-pointer font-black">What do roles and tiers mean?</summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {['owner','admin','parent','member','viewer'].map((tier) => <p key={tier}><strong className="capitalize">{tier}:</strong> {roleDescription(tier)}</p>)}
              </div>
            </details>
            <div className="space-y-4">
              {members.map((member) => {
                const isCurrentUser = member.user_id === user.id;
                const isOwner = member.permission_tier === "owner" || member.role === "owner";
                return (
                  <div key={member.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                    <form action={updateHouseholdMemberRole} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_145px_145px_auto] xl:items-end">
                      <input type="hidden" name="member_id" value={member.id} />
                      <div>
                        <p className="break-all font-black text-slate-950">{member.email || member.user_id}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{isCurrentUser ? "This is you" : "Household member"} · {member.status || "active"}</p>
                      </div>
                      <label><span className="text-xs font-black uppercase text-slate-500">Role</span><select name="role" defaultValue={member.role || "member"} disabled={!canManage || isOwner} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"><option value="owner">Owner</option><option value="admin">Admin</option><option value="parent">Parent/guardian</option><option value="member">Member</option><option value="viewer">Viewer</option></select></label>
                      <label><span className="text-xs font-black uppercase text-slate-500">Tier</span><select name="permission_tier" defaultValue={member.permission_tier || "member"} disabled={!canManage || isOwner} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"><option value="owner">Owner</option><option value="admin">Admin</option><option value="parent">Parent</option><option value="member">Member</option><option value="viewer">Viewer</option></select></label>
                      <button disabled={!canManage || isOwner} className="rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Save</button>
                    </form>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canManage && !isOwner && !isCurrentUser ? <form action={removeHouseholdMember}><input type="hidden" name="member_id" value={member.id} /><button className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700">Remove from household</button></form> : null}
                      {isCurrentUser && !isOwner ? <form action={leaveHousehold}><input type="hidden" name="household_id" value={householdId} /><button className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700">Leave household</button></form> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="QR / share link" description="A QR invite can be scanned by a new or existing user, but it still lands on a review screen and must be accepted.">
            {canManage ? <form action={createOpenHouseholdQrInvite} className="mb-4"><SubmitButton>Create / refresh QR invite</SubmitButton></form> : null}
            <div className="space-y-3">
              {invites.length === 0 ? <p className="text-sm font-bold text-slate-500">No pending invite links yet.</p> : null}
              {invites.map((invite) => {
                const link = `${baseUrl}/household/join?token=${invite.short_code}`;
                return (
                  <div key={invite.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/qr?data=${encodeURIComponent(link)}`} alt="Household invite QR" className="h-24 w-24 rounded-2xl border border-slate-200 bg-white p-2" />
                      <div className="min-w-0">
                        <p className="font-black text-slate-950">{invite.invited_email || "Reusable QR invite"}</p>
                        <p className="text-xs font-bold text-slate-500">{invite.role || "member"} · {invite.permission_tier || "member"} · {invite.status}</p>
                        <p className="mt-2 break-all text-xs font-bold text-slate-500">{link}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </section>

        {canManage && household?.owner_user_id === user.id ? (
          <SectionCard title="Danger zone" description="Delete this household only if you are sure. This removes the shared household shell, pending invites and membership links. Private user-owned records stay with the account that owns them.">
            <form action={deleteHousehold} className="grid gap-3 rounded-3xl border border-red-200 bg-red-50 p-5 md:grid-cols-[1fr_auto] md:items-end">
              <input type="hidden" name="household_id" value={householdId} />
              <label className="block">
                <span className="text-sm font-black text-red-800">Type DELETE to confirm</span>
                <input name="confirmation" placeholder="DELETE" className="mt-1 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-900" />
              </label>
              <button className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white">Delete household</button>
            </form>
          </SectionCard>
        ) : null}
      </main>
    </>
  );
}
