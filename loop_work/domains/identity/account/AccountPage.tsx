import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellRing,
  Crown,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
  Unplug,
  RotateCcw,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { MfaManager } from "@/components/account/MfaManager";
import { ProfileImageFileInput } from "@/components/ProfileImageFileInput";
import { AjaxProfileImageInput } from "@/components/AjaxProfileImageInput";
import { LiveAvatar } from "@/components/LiveAvatar";
import { SafeAvatar } from "@/components/SafeAvatar";
import { AccountJobsPanel } from "@/components/account/AccountJobsPanel";
import { NavigationLayoutSettings } from "@/components/account/NavigationLayoutSettings";
import {
  assignChildGuardians,
  saveHouseholdPermissions,
  saveMyHouseholdSharingPreferences,
  saveHouseholdSettings,
  saveNotificationPreferences,
  savePersonalIdentityProfile,
  saveHealthAccountSettings,
  saveWealthAccountSettings,
  sendPasswordResetEmail,
  sendAccountTestEmail,
  createHouseholdShareInvite,
  createNewHousehold,
  switchActiveHousehold,
  hideSnapTradeImportedAccount,
  restoreArchivedManualInvestmentAccount,
  removeSnapTradeConnectionAndRestoreManual,
} from "@/app/account/actions";
import { getAdminAccess } from "@/lib/admin/access";
import { providerIntegrationEntitlementFromSources } from "@/lib/integrations/entitlements";
import { FINANCIAL_INSTITUTIONS } from "@/lib/catalogue/financial-institutions";
import { SavingsProviderRelationships } from "@/components/savings/SavingsProviderRelationships";
import { saveFinancialProviderRelationship } from "@/app/accounts/actions";
import { upsertStudentLoanAccount } from "@/app/spending/actions";
import { requireSignedInUser } from "@/domains/identity/auth";

async function requireUser() {
  return requireSignedInUser();
}

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
const checkboxClass = "h-4 w-4 rounded border-slate-300 text-slate-950";
const tabs = [
  ["info", "Personal"],
  ["health", "Health"],
  ["wealth", "Wealth"],
] as const;

function tabHref(tab: string) {
  return `/account?tab=${tab}`;
}

function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${map[tone]}`}>
      {children}
    </span>
  );
}


type WealthFeatureToggleProps = {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  setupHref?: string;
  setupLabel?: string;
  location?: "Account" | "Financial Flow" | "Pensions & Investments" | "House" | "Income" | "LoopWatch";
};

function WealthFeatureToggle({
  name,
  label,
  description,
  checked,
  setupHref,
  setupLabel = "Add details",
  location = "Account",
}: WealthFeatureToggleProps) {
  const inputId = `wealth-toggle-${name}`;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-black text-slate-950">{label}</span>
          <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{description}</span>
        </label>
        <span className="mt-0.5 shrink-0">
          <input
            id={inputId}
            name={name}
            type="checkbox"
            defaultChecked={checked}
            aria-label={`Turn ${label} on or off`}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className="relative block h-7 w-12 cursor-pointer rounded-full bg-slate-200 outline-none ring-indigo-500 transition after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2"
          >
            <span className="sr-only">Turn {label} on or off</span>
          </label>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Setup lives in {location}</span>
        {setupHref ? <Link href={setupHref} className="text-xs font-black text-indigo-700 hover:text-indigo-900">{setupLabel} →</Link> : null}
      </div>
    </div>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};
  const requestedTab = tabs.some(([key]) => key === params.tab)
    ? params.tab!
    : "info";

  const { data: membership } = await supabase
    .from("app_household_members")
    .select(
      "id, household_id, role, permission_tier, can_manage_people, can_manage_child_profiles, can_view_household_income, can_manage_household_costs, can_manage_integrations",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let householdId = membership?.household_id || null;

  const [
    profileResult,
    preferencesResult,
    eventsResult,
    householdResult,
    membersResult,
    peopleResult,
    guardianResult,
    shareInviteResult,
    membershipsResult,
  ] = await Promise.all([
    supabase
      .from("app_user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("app_notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("app_security_events")
      .select("event_type, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    householdId
      ? supabase
          .from("app_households")
          .select("*")
          .eq("id", householdId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    householdId
      ? supabase
          .from("app_household_members")
          .select("*")
          .eq("household_id", householdId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("people")
      .select(
        "id, name, relationship, email, linked_user_id, account_status, avatar_url",
      )
      .eq("user_id", user.id)
      .order("relationship")
      .order("name"),
    supabase
      .from("person_guardians")
      .select("child_person_id, guardian_person_id")
      .eq("user_id", user.id),
    householdId
      ? supabase
          .from("household_join_invites")
          .select("*")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    supabase
      .from("app_household_members")
      .select("*, app_households(id, name, currency, timezone, image_url)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  const profile = profileResult.data as any;
  const preferences = preferencesResult.data as any;
  const events = eventsResult.data || [];
  let household = householdResult.data as any;
  let members = (membersResult.data || []) as any[];
  const people = (peopleResult.data || []) as any[];
  const guardianLinks = (guardianResult.data || []) as any[];
  let shareInvites = (shareInviteResult.data || []) as any[];
  const userHouseholds = (membershipsResult.data || []) as any[];
  if (profile?.household_id && profile.household_id !== householdId) {
    householdId = profile.household_id;
    const [activeHousehold, activeMembers, activeInvites] = await Promise.all([
      supabase
        .from("app_households")
        .select("*")
        .eq("id", householdId)
        .maybeSingle(),
      supabase
        .from("app_household_members")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("household_join_invites")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    household = activeHousehold.data as any;
    members = (activeMembers.data || []) as any[];
    shareInvites = (activeInvites.data || []) as any[];
  }
  const { data: householdLivingProfile } = householdId
    ? await supabase
        .from("household_living_profiles")
        .select("id, property_kind, property_style, tenure, bedrooms, occupants_override, heating_type, epc_rating")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null as any };

  const { data: studentLoanAccounts } = await supabase
    .from("student_loan_accounts")
    .select("id, person_id, plan, current_balance, balance_date, interest_rate, payroll_monthly_override, notes")
    .or(`user_id.eq.${user.id},owner_user_id.eq.${user.id}`)
    .order("balance_date", { ascending: false });

  const activeMembership = (userHouseholds.find(
    (m: any) => (m.app_households?.id || m.household_id) === householdId,
  ) || membership) as any;
  const adults = people.filter((person) => person.relationship !== "child");
  const children = people.filter((person) => person.relationship === "child");
  const access = await getAdminAccess();
  const canManagePermissions =
    access.isAdmin ||
    activeMembership?.permission_tier === "owner" ||
    activeMembership?.permission_tier === "admin";
  const canShareHousehold =
    canManagePermissions || Boolean(activeMembership?.can_manage_people);
  const verificationStatus = user.email_confirmed_at
    ? "email verified"
    : profile?.identity_verification_status || "unverified";
  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  const [myPlanResult, planComparisonResult] = await Promise.all([
    supabase.rpc("app_get_my_plan"),
    supabase.rpc("app_get_plan_comparison"),
  ]);
  const myPlanData = (myPlanResult.data || null) as any;
  const planComparison = (
    Array.isArray(planComparisonResult.data) ? planComparisonResult.data : []
  ) as any[];
  const currentPlanSlug = myPlanData?.current_plan?.slug || "free";

  const [
    snapTradeConnectionsResult,
    snapTradeImportedAccountsResult,
    archivedManualInvestmentAccountsResult,
  ] = await Promise.all([
    supabase
      .from("integration_connections")
      .select(
        "id, provider, connection_type, status, external_connection_id, notes, last_synced_at, updated_at, review_status",
      )
      .eq("user_id", user.id)
      .eq("provider", "SnapTrade")
      .order("updated_at", { ascending: false }),
    supabase
      .from("investment_accounts")
      .select(
        "id, label, provider, account_type, external_connection_id, external_account_id, sync_status, last_provider_sync_at, record_status, provider_migration_status",
      )
      .eq("user_id", user.id)
      .eq("external_provider", "snaptrade")
      .order("updated_at", { ascending: false }),
    supabase
      .from("investment_accounts")
      .select(
        "id, label, provider, account_type, archive_reason, archived_at, superseded_by_account_id, provider_migration_status",
      )
      .eq("user_id", user.id)
      .eq("record_status", "archived")
      .or("external_provider.is.null,external_provider.neq.snaptrade")
      .order("archived_at", { ascending: false }),
  ]);
  const snapTradeConnections = (snapTradeConnectionsResult.data || []) as any[];
  const snapTradeImportedAccounts = (snapTradeImportedAccountsResult.data ||
    []) as any[];
  const archivedManualInvestmentAccounts =
    (archivedManualInvestmentAccountsResult.data || []) as any[];
  const hasExistingProviderState =
    snapTradeConnections.length > 0 ||
    snapTradeImportedAccounts.length > 0 ||
    archivedManualInvestmentAccounts.length > 0;
  const providerIntegrationEntitlement =
    providerIntegrationEntitlementFromSources({
      profile,
      planData: myPlanData,
      isAdmin: access.isAdmin,
      hasExistingProviderState,
    });

  const { data: heldProviderRows } = await supabase
    .from("user_financial_provider_relationships")
    .select("provider_slug, provider_name, relationship_type")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("provider_name");

  const peopleByLinkedUserId = new Map<string, any>();
  const peopleByEmail = new Map<string, any>();
  people.forEach((person: any) => {
    if (person.linked_user_id) peopleByLinkedUserId.set(String(person.linked_user_id), person);
    if (person.email) peopleByEmail.set(String(person.email).toLowerCase(), person);
    if (person.invite_email) peopleByEmail.set(String(person.invite_email).toLowerCase(), person);
  });
  const memberDisplayName = (member: any) => {
    if (member.user_id === user.id) return profile?.display_name || profile?.full_name || "You";
    const matched = peopleByLinkedUserId.get(String(member.user_id || "")) || peopleByEmail.get(String(member.email || "").toLowerCase());
    if (matched?.name) return matched.name;
    if (member.display_name) return member.display_name;
    if (member.email) return String(member.email).split("@")[0];
    return "Household member";
  };
  const memberAvatarUrl = (member: any) => {
    const matched = peopleByLinkedUserId.get(String(member.user_id || "")) || peopleByEmail.get(String(member.email || "").toLowerCase());
    return member.user_id === user.id ? profile?.avatar_url : matched?.avatar_url;
  };
  const activeInviteCount = shareInvites.filter((invite: any) => ["pending", "active"].includes(String(invite.status || "pending").toLowerCase())).length;

  const { data: jobRows } = await supabase
    .from("employment_jobs")
    .select("id, person_id, employer_name, role_title, employment_type, start_date, end_date, annual_leave_days, carried_over_leave_days, bank_holidays_included, contracted_hours_per_week, contracted_days_per_week, work_pattern, salary_link_mode, document_storage_preference, extracted_summary, source_document_name, notes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const employmentJobs = (jobRows || []) as any[];
  const visibleTabs = tabs;
  const activeTab = requestedTab;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <LiveAvatar
                initialUrl={profile?.avatar_url}
                name={profile?.display_name || profile?.full_name || user.email}
                className="h-16 w-16 rounded-3xl ring-2 ring-white/20"
                fallbackClassName="bg-white/10 text-2xl text-white"
              />
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
                  <ShieldCheck className="h-4 w-4" /> Account centre
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-4xl font-black tracking-tight">
                    {profile?.full_name ||
                      profile?.display_name ||
                      "Your account"}
                  </h1>
                  <Link
                    href="/account?tab=info#profile-identity"
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/80 hover:bg-white/20"
                  >
                    Edit name/photo
                  </Link>
                </div>
                <p className="mt-1 text-sm font-medium text-white/70">
                  {user.email} · {household?.name || "Personal household"}
                </p>
              </div>
            </div>
            <div className="grid gap-2 rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/80 sm:min-w-72">
              <div className="flex justify-between gap-3">
                <span>Household role</span>
                <span className="text-white">
                  {activeMembership?.role || "owner"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Permission tier</span>
                <span className="text-white">
                  {activeMembership?.permission_tier || "owner"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Verification</span>
                <span className="text-white">{verificationStatus}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-slate-200 bg-white/80 p-2 shadow-sm">
          {visibleTabs.map(([key, label]) => (
            <Link
              key={key}
              href={tabHref(key)}
              className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {activeTab === "info" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <div id="profile-identity" className="scroll-mt-28">
              <SectionCard
                title="Personal account information"
                description="This is the information controlled by the signed-in user. Passwords, sessions and MFA are controlled by Supabase Auth, not household profiles."
              >
                <form
                  action={savePersonalIdentityProfile}
                  className="space-y-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        Full name
                      </span>
                      <input
                        name="full_name"
                        defaultValue={profile?.full_name || ""}
                        className={inputClass}
                        placeholder="Daniel Charlton"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        Display name
                      </span>
                      <input
                        name="display_name"
                        defaultValue={profile?.display_name || ""}
                        className={inputClass}
                        placeholder="Daniel"
                      />
                    </label>
                    <AjaxProfileImageInput
                      initialUrl={profile?.avatar_url}
                      className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`}
                    />
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        Phone number
                      </span>
                      <input
                        name="phone_number"
                        defaultValue={profile?.phone_number || ""}
                        className={inputClass}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        Timezone
                      </span>
                      <input
                        name="timezone"
                        defaultValue={profile?.timezone || "Europe/London"}
                        className={inputClass}
                      />
                    </label>
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        Currency
                      </span>
                      <input
                        name="currency"
                        defaultValue={profile?.currency || "GBP"}
                        className={inputClass}
                      />
                    </label>
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        DOB / age display
                      </span>
                      <select
                        name="date_display_format"
                        defaultValue={
                          profile?.date_display_format || "age_and_date"
                        }
                        className={inputClass}
                      >
                        <option value="age_and_date">Age + date</option>
                        <option value="age">Age only</option>
                        <option value="long">Long date</option>
                        <option value="ddmmyyyy">dd/mm/yyyy</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-sm font-black text-slate-700">
                        People image mode
                      </span>
                      <select
                        name="default_person_image_mode"
                        defaultValue={
                          profile?.default_person_image_mode || "avatar_url"
                        }
                        className={inputClass}
                      >
                        <option value="avatar_url">Use uploaded images</option>
                        <option value="initials">Initials only</option>
                      </select>
                    </label>
                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
                      <p className="text-sm font-black text-emerald-950">
                        Health baseline
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-800">
                        Used later to make energy, protein, hydration and
                        micronutrient targets more personal. Keep it optional
                        for beta.
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Height (cm)
                          </span>
                          <input
                            name="health_height_cm"
                            type="number"
                            step="0.1"
                            defaultValue={profile?.health_height_cm || ""}
                            className={inputClass}
                            placeholder="185"
                          />
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Weight (kg)
                          </span>
                          <input
                            name="health_weight_kg"
                            type="number"
                            step="0.1"
                            defaultValue={profile?.health_weight_kg || ""}
                            className={inputClass}
                            placeholder="82"
                          />
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Sex for targets
                          </span>
                          <select
                            name="health_sex"
                            defaultValue={profile?.health_sex || "not_set"}
                            className={inputClass}
                          >
                            <option value="not_set">
                              Prefer not to say / later
                            </option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Activity level
                          </span>
                          <select
                            name="health_activity_level"
                            defaultValue={
                              profile?.health_activity_level || "not_set"
                            }
                            className={inputClass}
                          >
                            <option value="not_set">Not set</option>
                            <option value="low">Low</option>
                            <option value="moderate">Moderate</option>
                            <option value="high">High</option>
                            <option value="athlete">
                              Athlete/high training
                            </option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Goal
                          </span>
                          <select
                            name="health_goal"
                            defaultValue={profile?.health_goal || "general"}
                            className={inputClass}
                          >
                            <option value="general">General health</option>
                            <option value="fat_loss">Fat loss</option>
                            <option value="muscle_gain">Muscle gain</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="pregnancy_breastfeeding_context">
                              Pregnancy/breastfeeding context
                            </option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Training load
                          </span>
                          <input
                            name="health_training_load"
                            defaultValue={profile?.health_training_load || ""}
                            className={inputClass}
                            placeholder="e.g. 3 gym sessions/week"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                      <p className="text-sm font-black text-slate-950">
                        Financial Flow display
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Controls how the Spending / Financial Flow timeline
                        shows people, dates and recurring bill images.
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Person marker
                          </span>
                          <select
                            name="spending_person_display_mode"
                            defaultValue={
                              profile?.spending_person_display_mode || "both"
                            }
                            className={inputClass}
                          >
                            <option value="both">Image + name</option>
                            <option value="image">Image only</option>
                            <option value="name">Name only</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Line date format
                          </span>
                          <select
                            name="spending_date_format"
                            defaultValue={
                              profile?.spending_date_format ||
                              "day_month_ordinal"
                            }
                            className={inputClass}
                          >
                            <option value="day_month_ordinal">1st Sept</option>
                            <option value="day_of_month">1st of Sept</option>
                            <option value="month_day">Sept 1st</option>
                            <option value="short_numeric">01/09/2026</option>
                            <option value="iso">2026-09-01</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Bill images
                          </span>
                          <select
                            name="spending_bill_logo_mode"
                            defaultValue={
                              profile?.spending_bill_logo_mode || "auto"
                            }
                            className={inputClass}
                          >
                            <option value="auto">Show / AI-enrich</option>
                            <option value="off">Hide bill images</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Money display
                          </span>
                          <select
                            name="money_display_precision"
                            defaultValue={
                              profile?.money_display_precision || "exact"
                            }
                            className={inputClass}
                          >
                            <option value="exact">Show pounds and pence</option>
                            <option value="rounded">
                              Round to whole pounds
                            </option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Overview homepage
                          </span>
                          <select
                            name="dashboard_home_view"
                            defaultValue={
                              profile?.dashboard_home_view || "breakdown"
                            }
                            className={inputClass}
                          >
                            <option value="breakdown">Breakdown first</option>
                            <option value="financial_flow">
                              Financial Flow first
                            </option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                  <SubmitButton>Save personal account</SubmitButton>
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    Saving also links/syncs your Self person card with this
                    account email, name and image.
                  </p>
                </form>
              </SectionCard>
            </div>

            {canManagePermissions ? (
              <SectionCard
                title="Household identity"
                description="This is an owner/admin setting for naming the household and controlling its defaults. Normal members keep their own account settings separate."
              >
                <form action={saveHouseholdSettings} className="space-y-4">
                  <input
                    type="hidden"
                    name="existing_household_image_url"
                    value={household?.image_url || ""}
                  />
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Household name
                    </span>
                    <input
                      name="household_name"
                      defaultValue={household?.name || "Charlton household"}
                      className={inputClass}
                      placeholder="The Charlton Household"
                    />
                  </label>
                  <ProfileImageFileInput
                    name="household_image"
                    className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`}
                  />
                  {household?.image_url ? (
                    <p className="text-xs font-bold text-slate-500">
                      Current household image is saved. Upload a new one only if
                      you want to replace it.
                    </p>
                  ) : null}
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Timezone
                    </span>
                    <input
                      name="timezone"
                      defaultValue={
                        household?.timezone ||
                        profile?.timezone ||
                        "Europe/London"
                      }
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Currency
                    </span>
                    <input
                      name="currency"
                      defaultValue={
                        household?.currency || profile?.currency || "GBP"
                      }
                      className={inputClass}
                    />
                  </label>
                  <div className="rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                    <p className="text-slate-950">Invite model</p>
                    <p className="mt-1">
                      Adults can own their own accounts. Children can stay
                      managed by parents/guardians until handover at 18.
                    </p>
                  </div>
                  <SubmitButton>Save household settings</SubmitButton>
                </form>
              </SectionCard>
            ) : (
              <SectionCard
                title="Household identity"
                description="Only household owners/admins can rename the household."
              >
                <p className="text-sm font-bold text-slate-500">
                  Current household: {household?.name || "Personal household"}
                </p>
              </SectionCard>
            )}
          </div>
        ) : null}


        {activeTab === "info" ? (
          <div id="navigation-layout" className="scroll-mt-28">
            <SectionCard
              title="Navigation layout"
              description="Choose whether LOOP uses the premium side menu or the compact top navigation. This preference follows your account across devices and can be changed whenever you like."
            >
              <NavigationLayoutSettings
                initialLayout={profile?.ui_navigation_layout === "top" ? "top" : "side"}
                initialChosen={Boolean(profile?.ui_navigation_layout_chosen_at)}
              />
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "info" ? (
          <div className="space-y-6" id="households">
            <SectionCard
              title="Households"
              description="A household lets selected people plan together while keeping private records under their own control. You can be in more than one household, but each shared dashboard has one active context."
            >
              {userHouseholds.length === 0 ? (
                <div className="grid gap-6 rounded-[2.25rem] border border-dashed border-slate-300 bg-white/80 p-8 md:grid-cols-[220px_1fr] md:items-center">
                  <div className="mx-auto grid h-40 w-40 place-items-center rounded-[2.5rem] bg-gradient-to-br from-slate-50 via-emerald-50 to-orange-50 text-7xl shadow-inner">⌂</div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">No household yet</p>
                    <h3 className="mt-2 text-3xl font-black text-slate-950">Create a shared home for money, health and planning.</h3>
                    <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Start alone, then invite a partner later. Shared views only use records each person chooses to share.</p>
                    <form action={createNewHousehold} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                      <input name="household_name" className={inputClass} placeholder="Household name" />
                      <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Create household</button>
                      <input type="hidden" name="timezone" value={profile?.timezone || "Europe/London"} />
                      <input type="hidden" name="currency" value={profile?.currency || "GBP"} />
                    </form>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">My households</p>
                      <h3 className="text-2xl font-black text-slate-950">Choose where shared planning happens</h3>
                    </div>
                    <details className="relative">
                      <summary className="grid h-12 w-12 cursor-pointer place-items-center rounded-full bg-slate-950 text-xl font-black text-white shadow-lg shadow-slate-300/70">+</summary>
                      <form action={createNewHousehold} className="absolute right-0 z-20 mt-3 w-[min(92vw,520px)] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl">
                        <p className="text-sm font-black text-slate-950">Create another household</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <input name="household_name" className={inputClass} placeholder="Household name" />
                          <input name="timezone" defaultValue={profile?.timezone || "Europe/London"} className={inputClass} />
                          <input name="currency" defaultValue={profile?.currency || "GBP"} className={inputClass} />
                          <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Create</button>
                        </div>
                      </form>
                    </details>
                  </div>
                  <div className={`grid gap-4 ${userHouseholds.length <= 1 ? "grid-cols-1" : "lg:grid-cols-2"}`}>
                    {userHouseholds.map((member: any) => {
                      const h = member.app_households || {};
                      const active = h.id && h.id === householdId;
                      return (
                        <form key={member.id} action={switchActiveHousehold} className={`group rounded-[2.25rem] border p-0 transition hover:-translate-y-0.5 hover:shadow-xl ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}>
                          <input type="hidden" name="household_id" value={h.id || member.household_id} />
                          <button type="submit" className="grid w-full gap-4 rounded-[2.25rem] p-6 text-left sm:grid-cols-[auto_1fr_auto] sm:items-center">
                            {h.image_url ? <img src={h.image_url} alt="" className="h-16 w-16 rounded-3xl object-cover shadow-sm" /> : <span className={`grid h-16 w-16 place-items-center rounded-3xl text-3xl ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>⌂</span>}
                            <span className="min-w-0 flex-1"><span className="block truncate text-lg font-black">{h.name || "Unnamed household"}</span><span className={`mt-1 block text-xs font-bold ${active ? "text-white/70" : "text-slate-500"}`}>Members: {active ? members.length : "switch to view"} · Your status: {member.permission_tier || member.role || "member"}</span></span>
                            {active ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Active</span> : <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-white/10" : "bg-slate-100 text-slate-600"}`}>Switch</span>}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

            {householdId && activeInviteCount > 0 ? (
              <SectionCard title="Household invites" description="Only active invites are shown here. If there are no invites, this section disappears.">
                <div className="grid gap-3 md:grid-cols-2">
                  {shareInvites.filter((invite: any) => ["pending", "active"].includes(String(invite.status || "pending").toLowerCase())).map((invite: any) => (
                    <div key={invite.id} className="rounded-3xl border border-slate-200 bg-white p-4"><p className="font-black text-slate-950">{invite.invited_email || "Share link"}</p><p className="mt-1 text-xs font-bold text-slate-500">{invite.role || "member"} · {invite.permission_tier || "member"}</p></div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {householdId ? (
              <SectionCard title="Members and sharing" description="Admins can manage roles and access. Each person controls what personal records they share; use Hide on individual shared records when something should stay private.">
                <div className="space-y-4">
                  {members.map((member: any) => {
                    const isSelfMember = member.user_id === user.id;
                    const displayName = memberDisplayName(member);
                    const avatar = memberAvatarUrl(member);
                    return (
                      <form key={member.id} action={isSelfMember ? saveMyHouseholdSharingPreferences : saveHouseholdPermissions} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <input type="hidden" name="member_id" value={member.id} />
                        <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-start">
                          {avatar ? <img src={avatar} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-lg font-black text-slate-700">{String(displayName).slice(0,1).toUpperCase()}</span>}
                          <div>
                            <p className="font-black text-slate-950">{displayName}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">{member.role || "member"} · {member.permission_tier || "member"}{isSelfMember ? " · your sharing choices" : ""}</p>
                            {isSelfMember ? (
                              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                {[
                                  ["share_income", "Share income"],
                                  ["share_spending", "Share spending"],
                                  ["share_savings", "Share savings"],
                                  ["share_investments", "Share investments"],
                                  ["share_health_summary", "Share health summary"],
                                ].map(([name, label]) => <label key={name} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700"><input type="checkbox" name={name} defaultChecked={member[name] !== false} /> {label}</label>)}
                              </div>
                            ) : canManagePermissions ? (
                              <div className="mt-4 grid gap-3 xl:grid-cols-[150px_150px_1fr] xl:items-end">
                                <label><span className="text-sm font-black text-slate-700">Role</span><select name="role" defaultValue={member.role || "member"} className={inputClass}><option value="owner">Owner</option><option value="parent_admin">Parent/admin</option><option value="member">Member</option><option value="child">Child</option><option value="viewer">Viewer</option></select></label>
                                <label><span className="text-sm font-black text-slate-700">Tier</span><select name="permission_tier" defaultValue={member.permission_tier || "member"} className={inputClass}><option value="owner">Owner</option><option value="admin">Admin</option><option value="parent">Parent</option><option value="member">Member</option><option value="viewer">Viewer</option><option value="child_managed">Child managed</option></select></label>
                                <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">Privacy toggles are hidden because only this member can choose what personal records they share.</p>
                              </div>
                            ) : null}
                          </div>
                          <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">{isSelfMember ? "Save sharing" : "Save access"}</button>
                        </div>
                      </form>
                    );
                  })}
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : null}

        {activeTab === "health" ? (
          <SectionCard
            title="Health settings"
            description="Optional personal health settings used for future health targets. Keep this blank until the user wants to personalise health logic."
          >
            <form action={saveHealthAccountSettings} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label><span className="text-sm font-black text-slate-700">Height (cm)</span><input name="health_height_cm" type="number" step="0.1" defaultValue={profile?.health_height_cm || ""} className={inputClass} placeholder="185" /></label>
                <label><span className="text-sm font-black text-slate-700">Weight (kg)</span><input name="health_weight_kg" type="number" step="0.1" defaultValue={profile?.health_weight_kg || ""} className={inputClass} placeholder="82" /></label>
                <label><span className="text-sm font-black text-slate-700">Sex for targets</span><select name="health_sex" defaultValue={profile?.health_sex || "not_set"} className={inputClass}><option value="not_set">Prefer not to say / later</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                <label><span className="text-sm font-black text-slate-700">Activity level</span><select name="health_activity_level" defaultValue={profile?.health_activity_level || "not_set"} className={inputClass}><option value="not_set">Not set</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="athlete">Athlete/high training</option></select></label>
                <label><span className="text-sm font-black text-slate-700">Goal</span><select name="health_goal" defaultValue={profile?.health_goal || "general"} className={inputClass}><option value="general">General health</option><option value="fat_loss">Fat loss</option><option value="muscle_gain">Muscle gain</option><option value="maintenance">Maintenance</option><option value="pregnancy_breastfeeding_context">Pregnancy/breastfeeding context</option></select></label>
                <label><span className="text-sm font-black text-slate-700">Training load</span><input name="health_training_load" defaultValue={profile?.health_training_load || ""} className={inputClass} placeholder="e.g. 3 gym sessions/week" /></label>
              </div>
              <SubmitButton>Save health settings</SubmitButton>
            </form>
          </SectionCard>
        ) : null}

        {activeTab === "wealth" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <SectionCard
              title="Wealth settings"
              description="Switch on the wealth modules that genuinely apply to you. Loop then shows the relevant trackers, calculations and prompts without cluttering the app for everyone else."
            >
              <form action={saveWealthAccountSettings} className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <WealthFeatureToggle
                    name="financial_flow_student_loan_enabled"
                    label="Student loan"
                    description="Includes the outstanding balance, payroll deductions and estimated repayment end date in your wider financial position."
                    checked={Boolean(profile?.financial_flow_student_loan_enabled)}
                    setupHref="/account?tab=wealth#student-loan-details"
                    setupLabel="Add SLC details"
                    location="Account"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_mortgage"
                    label="Mortgage / property"
                    description="Enables home equity, mortgage, remortgage, affordability and move-watch calculations."
                    checked={Boolean(profile?.wealth_has_mortgage)}
                    setupHref="/mortgage"
                    setupLabel="Open house setup"
                    location="House"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_pension"
                    label="Pensions"
                    description="Adds pension pots, contribution threads and retirement projection logic to Pensions & Investments."
                    checked={Boolean(profile?.wealth_has_pension)}
                    setupHref="/investments?tab=pensions"
                    setupLabel="Add pension details"
                    location="Pensions & Investments"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_investments"
                    label="Investments"
                    description="Adds stocks, ETFs, funds, pies, price refreshes and holding threads to Pensions & Investments."
                    checked={Boolean(profile?.wealth_has_investments)}
                    setupHref="/investments"
                    setupLabel="Open investments"
                    location="Pensions & Investments"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_savings"
                    label="Savings and pots"
                    description="Adds tracked savers, goals, pots, interest and rate checks to Financial Flow."
                    checked={Boolean(profile?.wealth_has_savings)}
                    setupHref="/financial-flow?view=savings"
                    setupLabel="Open savings flow"
                    location="Financial Flow"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_credit_cards_or_loans"
                    label="Credit cards / loans"
                    description="Includes debt repayments, affordability pressure and payoff tracking without creating a separate navigation tab."
                    checked={Boolean(profile?.wealth_has_credit_cards_or_loans)}
                    setupHref="/financial-flow?view=spending"
                    setupLabel="Add repayment lines"
                    location="Financial Flow"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_childcare_costs"
                    label="Childcare costs"
                    description="Includes nursery, wraparound and activity costs in Financial Flow when they apply to your household."
                    checked={Boolean(profile?.wealth_has_childcare_costs)}
                    setupHref="/spending"
                    setupLabel="Add childcare costs"
                    location="Financial Flow"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_car_finance"
                    label="Car finance / lease"
                    description="Includes PCP or lease commitments and LoopWatch renewal or replacement checks."
                    checked={Boolean(profile?.wealth_has_car_finance)}
                    setupHref="/loopwatch"
                    setupLabel="Add car context"
                    location="LoopWatch"
                  />
                  <WealthFeatureToggle
                    name="wealth_has_business_income"
                    label="Business income / dividends"
                    description="Includes dividends, director income and irregular income in Financial Flow and projections."
                    checked={Boolean(profile?.wealth_has_business_income)}
                    setupHref="/income"
                    setupLabel="Add income details"
                    location="Income"
                  />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <label className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block text-sm font-black text-slate-950">Show names in finance pages</span>
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">Off by default. Financial Flow uses photos or safe child characters instead of names.</span>
                    </span>
                    <input name="financial_flow_show_person_names" type="checkbox" defaultChecked={Boolean(profile?.financial_flow_show_person_names)} className={checkboxClass} />
                  </label>
                  <label className="mt-5 block">
                    <span className="text-sm font-black text-slate-700">Child profile display</span>
                    <select name="child_profile_avatar_mode" defaultValue={profile?.child_profile_avatar_mode || "safe_characters"} className={inputClass}>
                      <option value="safe_characters">Safe characters / icons</option>
                      <option value="uploaded_images">Uploaded images where supplied</option>
                      <option value="anonymous_tokens">Anonymous tokens only</option>
                    </select>
                  </label>
                </div>
                <div className={`rounded-3xl border p-5 ${householdLivingProfile?.id ? "border-emerald-200 bg-emerald-50/80" : "border-orange-200 bg-orange-50/70"}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className={`text-sm font-black ${householdLivingProfile?.id ? "text-emerald-950" : "text-orange-950"}`}>Home assumptions for household guidance</p>
                      <p className={`mt-1 text-xs font-bold leading-5 ${householdLivingProfile?.id ? "text-emerald-900" : "text-orange-900"}`}>Household-administered guidance used to estimate likely energy, gas, water and variable spending bands. House/property data or provider integrations can replace these assumptions later.</p>
                    </div>
                    <span className={`rounded-full bg-white px-3 py-1 text-[11px] font-black ${householdLivingProfile?.id ? "text-emerald-700" : "text-orange-700"}`}>{householdLivingProfile?.id ? "Saved household value" : "Optional"}</span>
                  </div>
                  <input type="hidden" name="household_living_profile_id" value={householdLivingProfile?.id || ""} />
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label><span className="text-sm font-black text-slate-700">Property kind</span><select name="home_property_kind" defaultValue={householdLivingProfile?.property_kind || "house"} className={inputClass}><option value="house">House</option><option value="flat">Flat / apartment</option><option value="bungalow">Bungalow</option><option value="other">Other</option></select></label>
                    <label><span className="text-sm font-black text-slate-700">Property style</span><select name="home_property_style" defaultValue={householdLivingProfile?.property_style || "unknown"} className={inputClass}><option value="unknown">Not sure yet</option><option value="detached">Detached</option><option value="semi_detached">Semi-detached</option><option value="terrace">Terraced</option><option value="flat">Flat / apartment</option><option value="bungalow">Bungalow</option></select></label>
                    <label><span className="text-sm font-black text-slate-700">Tenure</span><select name="home_tenure" defaultValue={householdLivingProfile?.tenure || "unknown"} className={inputClass}><option value="unknown">Not set</option><option value="own_mortgage">Own with mortgage</option><option value="own_outright">Own outright</option><option value="rent">Rent</option><option value="living_with_family">Living with family</option></select></label>
                    <label><span className="text-sm font-black text-slate-700">Bedrooms</span><input name="home_bedrooms" type="number" min="0" max="20" defaultValue={householdLivingProfile?.bedrooms || ""} className={inputClass} placeholder="3" /></label>
                    <label><span className="text-sm font-black text-slate-700">Occupants override</span><input name="home_occupants_override" type="number" min="1" max="30" defaultValue={householdLivingProfile?.occupants_override || ""} className={inputClass} placeholder="Use household size" /></label>
                    <label><span className="text-sm font-black text-slate-700">Heating</span><select name="home_heating_type" defaultValue={householdLivingProfile?.heating_type || "gas"} className={inputClass}><option value="gas">Gas</option><option value="electric">Electric</option><option value="heat_pump">Heat pump</option><option value="oil">Oil</option><option value="other">Other</option></select></label>
                    <label><span className="text-sm font-black text-slate-700">EPC rating</span><input name="home_epc_rating" defaultValue={householdLivingProfile?.epc_rating || ""} className={inputClass} placeholder="C" /></label>
                  </div>
                </div>
                <SubmitButton>Save wealth settings</SubmitButton>
              </form>

              {profile?.financial_flow_student_loan_enabled ? (
                <div id="student-loan-details" className="mt-8 border-t border-slate-200 pt-7">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Account-only setup</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">Student loan details</h3>
                      <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Add the balance from your Student Loans Company account here. LOOP uses it in Financial Flow and projections, but it does not need its own navigation page.</p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">Manual SLC balance</span>
                  </div>
                  <div className="space-y-4">
                    {(studentLoanAccounts && studentLoanAccounts.length ? studentLoanAccounts : [null]).map((loan: any, index: number) => (
                      <form key={loan?.id || `new-student-loan-${index}`} action={upsertStudentLoanAccount} className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-5 md:grid-cols-2">
                        {loan?.id ? <input type="hidden" name="id" value={loan.id} /> : null}
                        <label>
                          <span className="text-sm font-black text-slate-700">Person</span>
                          <select name="person_id" defaultValue={loan?.person_id || adults[0]?.id || ""} className={inputClass}>
                            <option value="">Not assigned yet</option>
                            {adults.map((person: any) => <option key={person.id} value={person.id}>{person.name}</option>)}
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">Student loan plan</span>
                          <select name="plan" defaultValue={loan?.plan || "plan_1"} className={inputClass}>
                            <option value="plan_1">Plan 1</option>
                            <option value="plan_2">Plan 2</option>
                            <option value="plan_4">Plan 4</option>
                            <option value="plan_5">Plan 5</option>
                            <option value="postgraduate">Postgraduate loan</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">Outstanding balance</span>
                          <input name="current_balance" type="number" min="0" step="0.01" defaultValue={loan?.current_balance ?? ""} className={inputClass} placeholder="Copy from SLC" required />
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">Balance checked on</span>
                          <input name="balance_date" type="date" defaultValue={loan?.balance_date || new Date().toISOString().slice(0, 10)} className={inputClass} required />
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">Interest rate %</span>
                          <input name="interest_rate" type="number" min="0" step="0.01" defaultValue={loan?.interest_rate ?? ""} className={inputClass} placeholder="Optional" />
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">Payslip deduction per month</span>
                          <input name="payroll_monthly_override" type="number" min="0" step="0.01" defaultValue={loan?.payroll_monthly_override ?? ""} className={inputClass} placeholder="Optional override" />
                        </label>
                        <label className="md:col-span-2">
                          <span className="text-sm font-black text-slate-700">Notes</span>
                          <input name="notes" defaultValue={loan?.notes || ""} className={inputClass} placeholder="SLC login checked, payslip deduction or refund query" />
                        </label>
                        <div className="md:col-span-2">
                          <SubmitButton>{loan?.id ? "Update student loan" : "Save student loan"}</SubmitButton>
                        </div>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}
            </SectionCard>
            <div className="space-y-6">
              <SectionCard title="What this changes" description="These toggles control whether specialist UI, calculations and background checks appear anywhere else in Loop.">
                <div className="space-y-4 text-sm font-bold text-slate-600">
                  <p><strong className="text-slate-950">Toggles, not navigation tabs.</strong> Switching something on enables its calculations and setup prompts. Student loans, cars, childcare and debt remain inside Account, Financial Flow or LoopWatch rather than creating extra top-level pages.</p>
                  <p><strong className="text-slate-950">Cleaner household sharing.</strong> Admins can manage access, but only the person who owns a record decides whether to share or hide it.</p>
                  <p><strong className="text-slate-950">Core navigation stays simple.</strong> Savings and pots live in Financial Flow. Pension and investment data share one Pensions & Investments workspace.</p>
                  <p><strong className="text-slate-950">More data means better guidance.</strong> The more relevant modules you enable and fill in, the better LOOP can model affordability, savings capacity, pension pressure and wealth growth.</p>
                </div>
              </SectionCard>
              <SectionCard title="Bank and provider relationships" description="Tell Loop where you already bank so savings-rate, ISA and eligibility logic can make better recommendations. Tracked savings accounts add providers automatically; this is the manual admin area.">
                <SavingsProviderRelationships
                  institutions={FINANCIAL_INSTITUTIONS}
                  heldProviders={(heldProviderRows || []).map((provider: any) => ({ provider_slug: provider.provider_slug, provider_name: provider.provider_name, relationship_type: provider.relationship_type }))}
                  saveAction={saveFinancialProviderRelationship}
                />
              </SectionCard>
            </div>
          </div>
        ) : null}

        {activeTab === "jobs" ? (
          <AccountJobsPanel people={people.map((person: any) => ({ id: person.id, name: person.name, relationship: person.relationship }))} jobs={employmentJobs} />
        ) : null}

        {activeTab === "security" ? (
          <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
            <SectionCard
              title="Password reset"
              description="Send a branded 8 digit reset code when the server admin key is configured. Without that key, this falls back to Supabase's normal recovery link so reset still works."
            >
              <form
                action={sendPasswordResetEmail}
                className="rounded-3xl border border-slate-200/80 bg-white/80 p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-black text-slate-950">Send reset code</p>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      No household user can view another person’s password.
                    </p>
                  </div>
                </div>
                <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
                  Send password reset code
                </button>
              </form>
            </SectionCard>
            <SectionCard
              title="Two-factor authentication"
              description="Use a TOTP authenticator app for this user account."
            >
              <MfaManager />
            </SectionCard>
            <SectionCard
              title="Local email test"
              description="Uses SMTP/Gmail settings when EMAIL_PROVIDER=smtp. This is for testing digests/invites while running on localhost."
            >
              <form
                action={sendAccountTestEmail}
                className="rounded-3xl border border-slate-200/80 bg-white/80 p-5"
              >
                <label>
                  <span className="text-sm font-black text-slate-700">
                    Send test to
                  </span>
                  <input
                    name="to"
                    type="email"
                    defaultValue={user.email || ""}
                    className={inputClass}
                  />
                </label>
                <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
                  Send test email
                </button>
                <p className="mt-3 text-xs font-bold text-slate-500">
                  This tests your local SMTP/Resend sender. Password resets use
                  the custom 8 digit code flow when a Supabase admin key is set,
                  otherwise they use the native Supabase recovery email.
                </p>
              </form>
            </SectionCard>
            <SectionCard
              title="Recent security/account events"
              description="A lightweight log of account and notification changes."
            >
              <div className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-sm font-bold text-slate-500">
                    No events recorded yet.
                  </p>
                ) : null}
                {events.map((event: any, index: number) => (
                  <div
                    key={`${event.created_at}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {String(event.event_type).replaceAll("_", " ")}
                        </p>
                        <p className="text-xs font-bold text-slate-500">
                          {new Date(event.created_at).toLocaleString("en-GB")}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <SectionCard
            title="Email and notification settings"
            description="Choose how often the app should nudge you with useful financial, renewal and health insights."
          >
            <form
              action={saveNotificationPreferences}
              className="grid gap-5 lg:grid-cols-3"
            >
              {[
                [
                  "finance_digest_enabled",
                  "Finance insights",
                  "Spending patterns, savings forecasts and affordability nudges.",
                ],
                [
                  "health_digest_enabled",
                  "Food & health insights",
                  "Meal planning, shopping lists and macro/micro reminders.",
                ],
                [
                  "renewal_reminders_enabled",
                  "Bill renewal reminders",
                  "Broadband, insurance, mobile and subscription deal checks.",
                ],
                [
                  "weekly_email_enabled",
                  "Weekly email",
                  "A short progress email.",
                ],
                [
                  "monthly_email_enabled",
                  "Monthly email",
                  "A deeper household forecast.",
                ],
                [
                  "in_app_enabled",
                  "In-app notifications",
                  "Show insights in the Notifications page.",
                ],
                [
                  "push_notifications_enabled",
                  "Push notifications later",
                  "Placeholder for PWA/native-app push after deployment.",
                ],
              ].map(([name, title, description]) => (
                <label
                  key={name}
                  className="flex gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-4"
                >
                  <input
                    name={name}
                    type="checkbox"
                    defaultChecked={
                      preferences?.[name as keyof typeof preferences] ?? true
                    }
                    className={`${checkboxClass} mt-1`}
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-950">
                      {title}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
              <div className="grid gap-4 rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4 lg:col-span-3 md:grid-cols-4">
                <label>
                  <span className="text-sm font-black text-slate-700">
                    Preferred day
                  </span>
                  <select
                    name="preferred_send_day"
                    defaultValue={preferences?.preferred_send_day || "Monday"}
                    className={inputClass}
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day) => (
                      <option key={day}>{day}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-black text-slate-700">
                    Preferred time
                  </span>
                  <input
                    name="preferred_send_time"
                    type="time"
                    defaultValue={preferences?.preferred_send_time || "08:00"}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="text-sm font-black text-slate-700">
                    Quiet from
                  </span>
                  <input
                    name="quiet_hours_start"
                    type="time"
                    defaultValue={preferences?.quiet_hours_start || "21:00"}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="text-sm font-black text-slate-700">
                    Quiet until
                  </span>
                  <input
                    name="quiet_hours_end"
                    type="time"
                    defaultValue={preferences?.quiet_hours_end || "07:00"}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="lg:col-span-3">
                <SubmitButton>Save notification preferences</SubmitButton>
              </div>
            </form>
          </SectionCard>
        ) : null}

        {false && activeTab === "sharing" ? (
          <div className="space-y-6">
            <SectionCard
              title="My households"
              description="Use Loop individually, then create or join a household when you want shared planning. Switching household changes the shared dashboard context; your private records remain owned by you."
            >
              <div
                className={`grid gap-4 ${userHouseholds.length <= 1 ? "grid-cols-1" : "lg:grid-cols-2"}`}
              >
                {userHouseholds.length === 0 ? (
                  <p className="text-sm font-bold text-slate-500">
                    You are not in a household yet. Create one below.
                  </p>
                ) : null}
                {userHouseholds.map((member: any) => {
                  const h = member.app_households || {};
                  const active = h.id && h.id === householdId;
                  return (
                    <form
                      key={member.id}
                      action={switchActiveHousehold}
                      className={`group rounded-[2.25rem] border p-0 transition hover:-translate-y-0.5 hover:shadow-xl ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}
                    >
                      <input
                        type="hidden"
                        name="household_id"
                        value={h.id || member.household_id}
                      />
                      <button
                        type="submit"
                        className="grid w-full gap-4 rounded-[2.25rem] p-6 text-left sm:grid-cols-[auto_1fr_auto] sm:items-center"
                      >
                        {h.image_url ? (
                          <img
                            src={h.image_url}
                            alt=""
                            className="h-16 w-16 rounded-3xl object-cover shadow-sm"
                          />
                        ) : (
                          <span
                            className={`grid h-16 w-16 place-items-center rounded-3xl text-xl font-black ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}
                          >
                            {String(h.name || "H")
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-lg font-black">
                            {h.name || "Unnamed household"}
                          </span>
                          <span
                            className={`mt-1 block text-xs font-bold ${active ? "text-white/70" : "text-slate-500"}`}
                          >
                            Members: {active ? members.length : "open to view"}{" "}
                            · Your status:{" "}
                            {member.permission_tier || member.role || "member"}
                          </span>
                          <span
                            className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-black ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}
                          >
                            {active
                              ? "Open active household"
                              : "Switch household"}
                          </span>
                        </span>
                        {active ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                            Active
                          </span>
                        ) : null}
                      </button>
                    </form>
                  );
                })}
              </div>
            </SectionCard>

            {userHouseholds.length === 0 ? (
              <SectionCard
                title="Create a household"
                description="Create your first shared household when you are ready. Once you have a household, this form collapses away so the page stays clean."
              >
                <form
                  action={createNewHousehold}
                  className="grid gap-4 md:grid-cols-3"
                >
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Household name
                    </span>
                    <input
                      name="household_name"
                      className={inputClass}
                      placeholder="The Charlton Household"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Timezone
                    </span>
                    <input
                      name="timezone"
                      defaultValue={profile?.timezone || "Europe/London"}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Currency
                    </span>
                    <input
                      name="currency"
                      defaultValue={profile?.currency || "GBP"}
                      className={inputClass}
                    />
                  </label>
                  <div className="md:col-span-3">
                    <ProfileImageFileInput
                      name="household_image"
                      className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <SubmitButton>Create household</SubmitButton>
                  </div>
                </form>
              </SectionCard>
            ) : (
              <details
                id="create-household"
                className="rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-sm"
              >
                <summary className="cursor-pointer text-sm font-black text-slate-700">
                  + Create another household
                </summary>
                <form
                  action={createNewHousehold}
                  className="mt-4 grid gap-4 md:grid-cols-3"
                >
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Household name
                    </span>
                    <input
                      name="household_name"
                      className={inputClass}
                      placeholder="Second household"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Timezone
                    </span>
                    <input
                      name="timezone"
                      defaultValue={profile?.timezone || "Europe/London"}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-black text-slate-700">
                      Currency
                    </span>
                    <input
                      name="currency"
                      defaultValue={profile?.currency || "GBP"}
                      className={inputClass}
                    />
                  </label>
                  <div className="md:col-span-3">
                    <ProfileImageFileInput
                      name="household_image"
                      className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <SubmitButton>Create household</SubmitButton>
                  </div>
                </form>
              </details>
            )}

            {householdId ? (
              <SectionCard
                title="Household invites and QR links"
                description="Invites now live inside the active household. Open the household page to invite someone, refresh QR links or remove members."
              >
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/household"
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
                  >
                    Open household
                  </Link>
                  {canShareHousehold ? (
                    <Link
                      href="/household#invite"
                      className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
                    >
                      Invite from household
                    </Link>
                  ) : null}
                </div>
              </SectionCard>
            ) : null}

            {canManagePermissions ? (
              <SectionCard
                title="Household members, roles and permission tiers"
                description="Admin rights and permission controls now sit with Households & sharing, because they only affect the active household context."
              >
                <div className="space-y-4">
                  {members.length === 0 ? (
                    <p className="text-sm font-bold text-slate-500">
                      No household members found yet.
                    </p>
                  ) : null}
                  {members.map((member: any) => (
                    <form
                      key={member.id}
                      action={saveHouseholdPermissions}
                      className="rounded-3xl border border-slate-200 bg-white p-5"
                    >
                      <input type="hidden" name="member_id" value={member.id} />
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px_150px] xl:items-end">
                        <div className="min-w-0">
                          <p className="break-all font-black text-slate-950">
                            {member.email || member.user_id}
                          </p>
                          <p className="text-xs font-bold text-slate-500">
                            Current: {member.role || "member"} ·{" "}
                            {member.permission_tier || "member"}
                          </p>
                        </div>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Role
                          </span>
                          <select
                            name="role"
                            defaultValue={member.role || "member"}
                            className={inputClass}
                          >
                            <option value="owner">Owner</option>
                            <option value="parent_admin">Parent/admin</option>
                            <option value="member">Member</option>
                            <option value="child">Child</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-black text-slate-700">
                            Tier
                          </span>
                          <select
                            name="permission_tier"
                            defaultValue={member.permission_tier || "member"}
                            className={inputClass}
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="parent">Parent</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                            <option value="child_managed">Child managed</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {[
                          ["can_manage_people", "Manage people"],
                          ["can_manage_child_profiles", "Manage children"],
                          [
                            "can_view_household_income",
                            "View household income",
                          ],
                          ["can_manage_household_costs", "Manage costs"],
                          ["can_manage_integrations", "Manage integrations"],
                        ].map(([name, label]) => (
                          <label
                            key={name}
                            className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name={name}
                              defaultChecked={Boolean(member[name])}
                            />{" "}
                            {label}
                          </label>
                        ))}
                      </div>
                      <div className="mt-4">
                        <button
                          disabled={!canManagePermissions}
                          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Save permissions
                        </button>
                      </div>
                    </form>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : null}

        {activeTab === "plan" ? (
          <div className="space-y-6">
            <SectionCard
              title="Your plan"
              description="This is pulled from the tier database, so you can test upgrade logic before payment gateway enforcement is turned on."
            >
              <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
                <div className="rounded-3xl bg-slate-950 p-6 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
                    Current tier
                  </p>
                  <h2 className="mt-2 text-4xl font-black">
                    {myPlanData?.current_plan?.name || "Free"}
                  </h2>
                  <p className="mt-2 text-sm font-semibold text-white/70">
                    {myPlanData?.current_plan?.description ||
                      "Core beta access and manual tracking."}
                  </p>
                  <Link
                    href="/account/plan"
                    className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950"
                  >
                    Open full plan page
                  </Link>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(myPlanData?.features || [])
                    .slice(0, 8)
                    .map((feature: any) => (
                      <div
                        key={feature.feature_key}
                        className="rounded-3xl bg-white p-4 shadow-sm"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          {feature.category}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <h3 className="font-black text-slate-950">
                            {feature.name}
                          </h3>
                          <Pill tone={feature.enabled ? "green" : "slate"}>
                            {feature.enabled ? "On" : "Off"}
                          </Pill>
                        </div>
                        {feature.limit_value ? (
                          <p className="mt-2 text-xs font-bold text-slate-500">
                            Limit: {feature.limit_value}{" "}
                            {feature.limit_period !== "none"
                              ? `/ ${feature.limit_period}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Compare tiers"
              description="The table below is built from the tier/feature database so changes in Admin are reflected here."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.2em] text-slate-400">
                      <th className="py-3">Plan</th>
                      <th>Price</th>
                      <th>AI</th>
                      <th>Health</th>
                      <th>Wealth / investments</th>
                      <th>Upgrade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planComparison.map((plan: any) => {
                      const features = plan.features || [];
                      const ai =
                        features
                          .filter((f: any) => f.category === "AI" && f.enabled)
                          .map((f: any) => f.name)
                          .slice(0, 3)
                          .join(", ") || "Limited";
                      const health =
                        features
                          .filter(
                            (f: any) => f.category === "Health" && f.enabled,
                          )
                          .map((f: any) => f.name)
                          .slice(0, 3)
                          .join(", ") || "Not included";
                      const wealth =
                        features
                          .filter(
                            (f: any) => f.category === "Wealth" && f.enabled,
                          )
                          .map((f: any) => f.name)
                          .slice(0, 3)
                          .join(", ") || "Not included";
                      return (
                        <tr key={plan.slug} className="border-b align-top">
                          <td className="py-4">
                            <p className="font-black text-slate-950">
                              {plan.name}
                            </p>
                            {plan.slug === currentPlanSlug ? (
                              <Pill tone="green">Current</Pill>
                            ) : null}
                          </td>
                          <td className="py-4 font-bold">
                            £
                            {(
                              Number(plan.monthly_price_pence || 0) / 100
                            ).toFixed(2)}{" "}
                            / mo
                          </td>
                          <td className="py-4 text-slate-600">{ai}</td>
                          <td className="py-4 text-slate-600">{health}</td>
                          <td className="py-4 text-slate-600">{wealth}</td>
                          <td className="py-4">
                            <Link
                              href="/account/plan"
                              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {planComparison.length === 0 ? (
                  <p className="py-6 text-sm font-bold text-slate-500">
                    Run the v27.58/v27.59 tier SQL to populate plan comparison
                    data.
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "integrations" ? (
          providerIntegrationEntitlement.canSeeTab ? (
            <div className="space-y-6">
              <SectionCard
                title={providerIntegrationEntitlement.label}
                description={providerIntegrationEntitlement.reason}
              >
                <div
                  className={`rounded-3xl border p-5 text-sm font-bold ${providerIntegrationEntitlement.canConnectProvider ? "border-emerald-100 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}
                >
                  {providerIntegrationEntitlement.canConnectProvider
                    ? "You can add and manage provider integrations from Investments and Account. Existing provider imports remain reversible."
                    : "New provider connections are locked on this tier. You can still remove existing provider access and restore archived manual records."}
                </div>
              </SectionCard>
              <SectionCard
                title="Connected investment providers"
                description="Manage provider access from your account. Removing a provider archives imported SnapTrade accounts and restores any manual investment inputs that were archived during import."
              >
                <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm font-bold text-blue-950">
                  <p className="font-black">Trading 212 GIA and ISA logic</p>
                  <p className="mt-1">
                    One SnapTrade connection can return multiple broker accounts
                    when those accounts sit under the same broker credentials.
                    If Trading 212/SnapTrade returns both a GIA and a Stocks &
                    Shares ISA, LOOP shows both separately and lets you import
                    either or both. If the broker/API only returns one wrapper
                    for a key, connect another key and LOOP will still dedupe by
                    provider, wrapper, account number and external account ID.
                  </p>
                </div>
                <div className="mt-5 space-y-3">
                  {snapTradeConnections.map((connection) => {
                    const active = ![
                      "archived",
                      "deleted",
                      "removed",
                      "disconnected",
                    ].includes(String(connection.status || "").toLowerCase());
                    return (
                      <div
                        key={connection.id}
                        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-600 text-sm font-black text-white">
                                ST
                              </span>
                              <div>
                                <p className="text-lg font-black text-slate-950">
                                  SnapTrade
                                </p>
                                <p className="text-xs font-bold text-slate-500">
                                  {connection.external_connection_id
                                    ? `Connection ${connection.external_connection_id}`
                                    : "Registered user connection"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Pill tone={active ? "green" : "amber"}>
                                {connection.status || "connected"}
                              </Pill>
                              {connection.last_synced_at ? (
                                <Pill>{`synced ${String(connection.last_synced_at).slice(0, 10)}`}</Pill>
                              ) : (
                                <Pill>not synced yet</Pill>
                              )}
                            </div>
                            {connection.notes ? (
                              <p className="mt-3 max-w-3xl text-sm font-bold text-slate-500">
                                {connection.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href="/investments"
                              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
                            >
                              Open investments
                            </Link>
                            <form
                              action={removeSnapTradeConnectionAndRestoreManual}
                            >
                              <input
                                type="hidden"
                                name="connection_id"
                                value={connection.id}
                              />
                              <input
                                type="hidden"
                                name="external_connection_id"
                                value={connection.external_connection_id || ""}
                              />
                              <button className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700">
                                <Unplug className="h-4 w-4" /> Remove access
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!snapTradeConnections.length ? (
                    <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">
                      No SnapTrade provider connection is saved yet. Connect
                      from the Investments page when your tier allows
                      realtime/provider sync.
                    </p>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Imported broker accounts"
                description="These are LOOP investment pots created from SnapTrade. You can hide one without deleting the provider connection; LOOP will restore linked manual inputs where a migration record exists."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {snapTradeImportedAccounts.map((account) => {
                    const active =
                      String(account.record_status || "active") !== "archived";
                    return (
                      <div
                        key={account.id}
                        className="rounded-3xl border border-slate-200 bg-white p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                                ST
                              </span>
                              <p className="font-black text-slate-950">
                                {account.label}
                              </p>
                            </div>
                            <p className="mt-1 text-sm font-bold text-slate-500">
                              {account.provider || "Provider"} ·{" "}
                              {account.account_type || "investment"} ·{" "}
                              {account.external_account_id ||
                                "no external account id"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Pill tone={active ? "green" : "amber"}>
                                {active ? "active" : "hidden"}
                              </Pill>
                              {account.sync_status ? (
                                <Pill>{account.sync_status}</Pill>
                              ) : null}
                            </div>
                          </div>
                          {active ? (
                            <form action={hideSnapTradeImportedAccount}>
                              <input
                                type="hidden"
                                name="account_id"
                                value={account.id}
                              />
                              <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
                                Hide / restore manual
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {!snapTradeImportedAccounts.length ? (
                    <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">
                      No broker accounts have been imported yet.
                    </p>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Archived manual investment inputs"
                description="Manual pots archived during a SnapTrade import are kept here. Restore them when you remove access, downgrade, or simply prefer to track manually again."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {archivedManualInvestmentAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="rounded-3xl border border-amber-200 bg-amber-50 p-5"
                    >
                      <p className="font-black text-slate-950">
                        {account.label}
                      </p>
                      <p className="mt-1 text-sm font-bold text-amber-900">
                        {account.provider || "Manual"} ·{" "}
                        {account.account_type || "investment"}
                      </p>
                      <p className="mt-2 text-xs font-bold text-amber-800">
                        {account.archive_reason ||
                          account.provider_migration_status ||
                          "Archived manual input"}
                      </p>
                      <form
                        action={restoreArchivedManualInvestmentAccount}
                        className="mt-4"
                      >
                        <input
                          type="hidden"
                          name="account_id"
                          value={account.id}
                        />
                        <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                          <RotateCcw className="h-4 w-4" /> Restore manual
                          tracking
                        </button>
                      </form>
                    </div>
                  ))}
                  {!archivedManualInvestmentAccounts.length ? (
                    <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">
                      No archived manual investment pots yet.
                    </p>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          ) : (
            <div className="space-y-6">
              <SectionCard
                title="Integrations locked"
                description="Provider integrations are only shown to tiers with broker/realtime market-data access."
              >
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-950">
                  Your current plan can still use manual investments and
                  delayed/manual values. Upgrade to a tier with provider
                  integrations to connect SnapTrade or another broker.
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/account?tab=plan"
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
                  >
                    View plan / upgrade
                  </Link>
                  <Link
                    href="/investments"
                    className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
                  >
                    Back to manual investments
                  </Link>
                </div>
              </SectionCard>
            </div>
          )
        ) : null}

        {false && activeTab === "permissions" ? (
          <div className="space-y-6">
            <SectionCard
              title="Admin rights & permission tiers"
              description="This controls household-level visibility, account administration and who can manage child profiles. Sensitive values remain person-owned by default."
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <Crown className="h-5 w-5 text-orange-500" />
                    <h3 className="font-black text-slate-950">Owner</h3>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    Can manage household settings, people, costs, permissions
                    and integrations.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <UsersRound className="h-5 w-5 text-slate-700" />
                    <h3 className="font-black text-slate-950">
                      Parent / admin
                    </h3>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    Can manage children and household costs, depending on
                    toggles.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <LockKeyhole className="h-5 w-5 text-slate-700" />
                    <h3 className="font-black text-slate-950">
                      Member / child
                    </h3>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    Controls their own account, with household visibility
                    explicitly granted.
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Household members"
              description="Promote adults to parent/admin tiers only when they should help manage the household. Normal users do not see admin/platform/integration pages."
            >
              <div className="space-y-4">
                {members.length === 0 ? (
                  <p className="text-sm font-bold text-slate-500">
                    No household members found yet.
                  </p>
                ) : null}
                {members.map((member: any) => (
                  <form
                    key={member.id}
                    action={saveHouseholdPermissions}
                    className="rounded-3xl border border-slate-200 bg-white p-5"
                  >
                    <input type="hidden" name="member_id" value={member.id} />
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <p className="font-black text-slate-950">
                          {member.email || member.user_id}
                        </p>
                        <p className="text-xs font-bold text-slate-500">
                          Current: {member.role || "member"} ·{" "}
                          {member.permission_tier || "member"}
                        </p>
                      </div>
                      <label>
                        <span className="text-sm font-black text-slate-700">
                          Role
                        </span>
                        <select
                          name="role"
                          defaultValue={member.role || "member"}
                          className={inputClass}
                        >
                          <option value="owner">Owner</option>
                          <option value="parent_admin">Parent/admin</option>
                          <option value="member">Member</option>
                          <option value="child">Child</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </label>
                      <label>
                        <span className="text-sm font-black text-slate-700">
                          Tier
                        </span>
                        <select
                          name="permission_tier"
                          defaultValue={member.permission_tier || "member"}
                          className={inputClass}
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="parent">Parent</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                          <option value="child_managed">Child managed</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      {[
                        ["can_manage_people", "Manage people"],
                        ["can_manage_child_profiles", "Manage children"],
                        ["can_view_household_income", "View household income"],
                        ["can_manage_household_costs", "Manage costs"],
                        ["can_manage_integrations", "Manage integrations"],
                      ].map(([name, label]) => (
                        <label
                          key={name}
                          className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700"
                        >
                          <input
                            type="checkbox"
                            name={name}
                            defaultChecked={Boolean(member[name])}
                          />{" "}
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-4">
                      <button
                        disabled={!canManagePermissions}
                        className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save permissions
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Parent / child allocation"
              description="Parents can be assigned to children. This supports the long-term model where children mature into their own accounts at 18 with history preserved."
            >
              <div className="space-y-4">
                {children.length === 0 ? (
                  <p className="text-sm font-bold text-slate-500">
                    No child profiles found.
                  </p>
                ) : null}
                {children.map((child) => {
                  const selected = new Set(
                    guardianLinks
                      .filter((link) => link.child_person_id === child.id)
                      .map((link) => link.guardian_person_id),
                  );
                  return (
                    <form
                      key={child.id}
                      action={assignChildGuardians}
                      className="rounded-3xl border border-sky-100 bg-sky-50/40 p-5"
                    >
                      <input type="hidden" name="child_id" value={child.id} />
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-black text-slate-950">
                            {child.name}
                          </p>
                          <p className="text-xs font-bold text-slate-500">
                            {child.email || "No linked email yet"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {adults.map((adult) => (
                            <label
                              key={adult.id}
                              className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700"
                            >
                              <input
                                type="checkbox"
                                name="guardian_person_id"
                                value={adult.id}
                                defaultChecked={selected.has(adult.id)}
                              />{" "}
                              {adult.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
                        Save guardians
                      </button>
                    </form>
                  );
                })}
              </div>
            </SectionCard>

            {access.isAdmin ? (
              <SectionCard
                title="Creator-only admin links"
                description="Email design, digest previews, platform checks and integrations sit behind creator/admin access."
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <Link
                    href="/admin"
                    className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"
                  >
                    <Mail className="mb-3 h-5 w-5" /> Email/admin insight engine
                  </Link>
                  <Link
                    href="/platform"
                    className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"
                  >
                    <ShieldCheck className="mb-3 h-5 w-5" /> Platform readiness
                  </Link>
                  <Link
                    href="/integrations"
                    className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"
                  >
                    <BellRing className="mb-3 h-5 w-5" /> Integrations & tokens
                  </Link>
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
