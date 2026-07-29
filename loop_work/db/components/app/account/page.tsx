import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, Crown, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound, UsersRound, Unplug, RotateCcw } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { MfaManager } from "@/components/account/MfaManager";
import { ProfileImageFileInput } from "@/components/ProfileImageFileInput";
import { AjaxProfileImageInput } from "@/components/AjaxProfileImageInput";
import { LiveAvatar } from "@/components/LiveAvatar";
import { SafeAvatar } from "@/components/SafeAvatar";
import {
  assignChildGuardians,
  saveHouseholdPermissions,
  saveHouseholdSettings,
  saveNotificationPreferences,
  savePersonalIdentityProfile,
  sendPasswordResetEmail,
  sendAccountTestEmail,
  createHouseholdShareInvite,
  createNewHousehold,
  switchActiveHousehold,
  hideSnapTradeImportedAccount,
  restoreArchivedManualInvestmentAccount,
  removeSnapTradeConnectionAndRestoreManual,
} from "./actions";
import { getAdminAccess } from "@/lib/admin/access";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";
const checkboxClass = "h-4 w-4 rounded border-slate-300 text-slate-950";
const tabs = [
  ["info", "Account information"],
  ["security", "Account security"],
  ["notifications", "Email & notifications"],
  ["sharing", "Households & sharing"],
  ["plan", "Plan"],
  ["integrations", "Integrations"],
] as const;

function tabHref(tab: string) {
  return `/account?tab=${tab}`;
}

function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${map[tone]}`}>{children}</span>;
}

export default async function AccountPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};
  const activeTab = tabs.some(([key]) => key === params.tab) ? params.tab! : "info";
  const householdContext = await getActiveHouseholdContext(supabase, user);

  const { data: membership } = await supabase
    .from("app_household_members")
    .select("id, household_id, role, permission_tier, can_manage_people, can_manage_child_profiles, can_view_household_income, can_manage_household_costs, can_manage_integrations")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let householdId = membership?.household_id || null;

  const [profileResult, preferencesResult, eventsResult, householdResult, membersResult, peopleResult, guardianResult, shareInviteResult, membershipsResult] = await Promise.all([
    supabase.from("app_user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_security_events").select("event_type, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    householdId ? supabase.from("app_households").select("*").eq("id", householdId).maybeSingle() : Promise.resolve({ data: null }),
    householdId ? supabase.from("app_household_members").select("*").eq("household_id", householdId).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from("people").select("id, name, relationship, email, linked_user_id, account_status, avatar_url").or(visibleDataOrFilter(householdContext)).or("account_status.is.null,account_status.neq.duplicate_merged").order("relationship").order("name"),
    supabase.from("person_guardians").select("child_person_id, guardian_person_id").or(visibleDataOrFilter(householdContext)),
    householdId ? supabase.from("household_join_invites").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
    supabase.from("app_household_members").select("*, app_households(id, name, currency, timezone, image_url)").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: true }),
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
      supabase.from("app_households").select("*").eq("id", householdId).maybeSingle(),
      supabase.from("app_household_members").select("*").eq("household_id", householdId).order("created_at", { ascending: true }),
      supabase.from("household_join_invites").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(8),
    ]);
    household = activeHousehold.data as any;
    members = (activeMembers.data || []) as any[];
    shareInvites = (activeInvites.data || []) as any[];
  }
  const activeMembership = (userHouseholds.find((m: any) => (m.app_households?.id || m.household_id) === householdId) || membership) as any;
  const adults = people.filter((person) => person.relationship !== "child");
  const children = people.filter((person) => person.relationship === "child");
  const access = await getAdminAccess();
  const canManagePermissions = access.isAdmin || activeMembership?.permission_tier === "owner" || activeMembership?.permission_tier === "admin";
  const canShareHousehold = canManagePermissions || Boolean(activeMembership?.can_manage_people);
  const verificationStatus = user.email_confirmed_at ? "email verified" : profile?.identity_verification_status || "unverified";
  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  const [myPlanResult, planComparisonResult] = await Promise.all([
    supabase.rpc("app_get_my_plan"),
    supabase.rpc("app_get_plan_comparison"),
  ]);
  const myPlanData = (myPlanResult.data || null) as any;
  const planComparison = (Array.isArray(planComparisonResult.data) ? planComparisonResult.data : []) as any[];
  const currentPlanSlug = myPlanData?.current_plan?.slug || "free";

  const [snapTradeConnectionsResult, snapTradeImportedAccountsResult, archivedManualInvestmentAccountsResult] = await Promise.all([
    supabase
      .from("integration_connections")
      .select("id, provider, connection_type, status, external_connection_id, notes, last_synced_at, updated_at, review_status")
      .eq("user_id", user.id)
      .eq("provider", "SnapTrade")
      .order("updated_at", { ascending: false }),
    supabase
      .from("investment_accounts")
      .select("id, label, provider, account_type, external_connection_id, external_account_id, sync_status, last_provider_sync_at, record_status, provider_migration_status")
      .eq("user_id", user.id)
      .eq("external_provider", "snaptrade")
      .order("updated_at", { ascending: false }),
    supabase
      .from("investment_accounts")
      .select("id, label, provider, account_type, archive_reason, archived_at, superseded_by_account_id, provider_migration_status")
      .eq("user_id", user.id)
      .eq("record_status", "archived")
      .or("external_provider.is.null,external_provider.neq.snaptrade")
      .order("archived_at", { ascending: false }),
  ]);
  const snapTradeConnections = (snapTradeConnectionsResult.data || []) as any[];
  const snapTradeImportedAccounts = (snapTradeImportedAccountsResult.data || []) as any[];
  const archivedManualInvestmentAccounts = (archivedManualInvestmentAccountsResult.data || []) as any[];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <LiveAvatar initialUrl={profile?.avatar_url} name={profile?.display_name || profile?.full_name || user.email} className="h-16 w-16 rounded-3xl ring-2 ring-white/20" fallbackClassName="bg-white/10 text-2xl text-white" />
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
                  <ShieldCheck className="h-4 w-4" /> Account centre
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-4xl font-black tracking-tight">{profile?.full_name || profile?.display_name || "Your account"}</h1>
                  <Link href="/account?tab=info#profile-identity" className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/80 hover:bg-white/20">Edit name/photo</Link>
                </div>
                <p className="mt-1 text-sm font-medium text-white/70">{user.email} · {household?.name || "Personal household"}</p>
              </div>
            </div>
            <div className="grid gap-2 rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/80 sm:min-w-72">
              <div className="flex justify-between gap-3"><span>Household role</span><span className="text-white">{activeMembership?.role || "owner"}</span></div>
              <div className="flex justify-between gap-3"><span>Permission tier</span><span className="text-white">{activeMembership?.permission_tier || "owner"}</span></div>
              <div className="flex justify-between gap-3"><span>Verification</span><span className="text-white">{verificationStatus}</span></div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-slate-200 bg-white/80 p-2 shadow-sm">
          {tabs.map(([key, label]) => (
            <Link key={key} href={tabHref(key)} className={`rounded-full px-4 py-2 text-sm font-black transition ${activeTab === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
          ))}
        </div>

        {activeTab === "info" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <div id="profile-identity" className="scroll-mt-28"><SectionCard title="Personal account information" description="This is the information controlled by the signed-in user. Passwords, sessions and MFA are controlled by Supabase Auth, not household profiles.">
              <form action={savePersonalIdentityProfile} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label><span className="text-sm font-black text-slate-700">Full name</span><input name="full_name" defaultValue={profile?.full_name || ""} className={inputClass} placeholder="Daniel Charlton" /></label>
                  <label><span className="text-sm font-black text-slate-700">Display name</span><input name="display_name" defaultValue={profile?.display_name || ""} className={inputClass} placeholder="Daniel" /></label>
                  <AjaxProfileImageInput initialUrl={profile?.avatar_url} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`} />
                  <label><span className="text-sm font-black text-slate-700">Phone number</span><input name="phone_number" defaultValue={profile?.phone_number || ""} className={inputClass} placeholder="Optional" /></label>
                  <label><span className="text-sm font-black text-slate-700">Timezone</span><input name="timezone" defaultValue={profile?.timezone || "Europe/London"} className={inputClass} /></label>
                  <label><span className="text-sm font-black text-slate-700">Currency</span><input name="currency" defaultValue={profile?.currency || "GBP"} className={inputClass} /></label>
                  <label><span className="text-sm font-black text-slate-700">DOB / age display</span><select name="date_display_format" defaultValue={profile?.date_display_format || "age_and_date"} className={inputClass}><option value="age_and_date">Age + date</option><option value="age">Age only</option><option value="long">Long date</option><option value="ddmmyyyy">dd/mm/yyyy</option></select></label>
                  <label><span className="text-sm font-black text-slate-700">People image mode</span><select name="default_person_image_mode" defaultValue={profile?.default_person_image_mode || "avatar_url"} className={inputClass}><option value="avatar_url">Use uploaded images</option><option value="initials">Initials only</option></select></label>
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
                    <p className="text-sm font-black text-emerald-950">Health baseline</p>
                    <p className="mt-1 text-xs font-bold text-emerald-800">Used later to make energy, protein, hydration and micronutrient targets more personal. Keep it optional for beta.</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <label><span className="text-sm font-black text-slate-700">Height (cm)</span><input name="health_height_cm" type="number" step="0.1" defaultValue={profile?.health_height_cm || ""} className={inputClass} placeholder="185" /></label>
                      <label><span className="text-sm font-black text-slate-700">Weight (kg)</span><input name="health_weight_kg" type="number" step="0.1" defaultValue={profile?.health_weight_kg || ""} className={inputClass} placeholder="82" /></label>
                      <label><span className="text-sm font-black text-slate-700">Sex for targets</span><select name="health_sex" defaultValue={profile?.health_sex || "not_set"} className={inputClass}><option value="not_set">Prefer not to say / later</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Activity level</span><select name="health_activity_level" defaultValue={profile?.health_activity_level || "not_set"} className={inputClass}><option value="not_set">Not set</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="athlete">Athlete/high training</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Goal</span><select name="health_goal" defaultValue={profile?.health_goal || "general"} className={inputClass}><option value="general">General health</option><option value="fat_loss">Fat loss</option><option value="muscle_gain">Muscle gain</option><option value="maintenance">Maintenance</option><option value="pregnancy_breastfeeding_context">Pregnancy/breastfeeding context</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Training load</span><input name="health_training_load" defaultValue={profile?.health_training_load || ""} className={inputClass} placeholder="e.g. 3 gym sessions/week" /></label>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <p className="text-sm font-black text-slate-950">Financial Flow display</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">Controls how the Spending / Financial Flow timeline shows people, dates and recurring bill images.</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <label><span className="text-sm font-black text-slate-700">Person marker</span><select name="spending_person_display_mode" defaultValue={profile?.spending_person_display_mode || "both"} className={inputClass}><option value="both">Image + name</option><option value="image">Image only</option><option value="name">Name only</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Line date format</span><select name="spending_date_format" defaultValue={profile?.spending_date_format || "day_month_ordinal"} className={inputClass}><option value="day_month_ordinal">1st Sept</option><option value="day_of_month">1st of Sept</option><option value="month_day">Sept 1st</option><option value="short_numeric">01/09/2026</option><option value="iso">2026-09-01</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Bill images</span><select name="spending_bill_logo_mode" defaultValue={profile?.spending_bill_logo_mode || "auto"} className={inputClass}><option value="auto">Show / AI-enrich</option><option value="off">Hide bill images</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Money display</span><select name="money_display_precision" defaultValue={profile?.money_display_precision || "exact"} className={inputClass}><option value="exact">Show pounds and pence</option><option value="rounded">Round to whole pounds</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Overview homepage</span><select name="dashboard_home_view" defaultValue={profile?.dashboard_home_view || "breakdown"} className={inputClass}><option value="breakdown">Breakdown first</option><option value="financial_flow">Financial Flow first</option></select></label>
                    </div>
                  </div>
                </div>
                <SubmitButton>Save personal account</SubmitButton>
                <p className="mt-3 text-xs font-bold text-slate-500">Saving also links/syncs your Self person card with this account email, name and image.</p>
              </form>
            </SectionCard></div>

            {canManagePermissions ? <SectionCard title="Household identity" description="This is an owner/admin setting for naming the household and controlling its defaults. Normal members keep their own account settings separate.">
              <form action={saveHouseholdSettings} className="space-y-4">
                <input type="hidden" name="existing_household_image_url" value={household?.image_url || ""} />
                <label><span className="text-sm font-black text-slate-700">Household name</span><input name="household_name" defaultValue={household?.name || "Charlton household"} className={inputClass} placeholder="The Charlton Household" /></label>
                <ProfileImageFileInput name="household_image" className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`} />
                {household?.image_url ? <p className="text-xs font-bold text-slate-500">Current household image is saved. Upload a new one only if you want to replace it.</p> : null}
                <label><span className="text-sm font-black text-slate-700">Timezone</span><input name="timezone" defaultValue={household?.timezone || profile?.timezone || "Europe/London"} className={inputClass} /></label>
                <label><span className="text-sm font-black text-slate-700">Currency</span><input name="currency" defaultValue={household?.currency || profile?.currency || "GBP"} className={inputClass} /></label>
                <div className="rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                  <p className="text-slate-950">Invite model</p>
                  <p className="mt-1">Adults can own their own accounts. Children can stay managed by parents/guardians until handover at 18.</p>
                </div>
                <SubmitButton>Save household settings</SubmitButton>
              </form>
            </SectionCard> : <SectionCard title="Household identity" description="Only household owners/admins can rename the household."><p className="text-sm font-bold text-slate-500">Current household: {household?.name || "Personal household"}</p></SectionCard>}
          </div>
        ) : null}

        {activeTab === "security" ? (
          <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
            <SectionCard title="Password reset" description="Send a branded 8 digit reset code when the server admin key is configured. Without that key, this falls back to Supabase's normal recovery link so reset still works.">
              <form action={sendPasswordResetEmail} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
                <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white"><KeyRound className="h-5 w-5" /></span><div><p className="font-black text-slate-950">Send reset code</p><p className="mt-1 text-sm font-medium text-slate-500">No household user can view another person’s password.</p></div></div>
                <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Send password reset code</button>
              </form>
            </SectionCard>
            <SectionCard title="Two-factor authentication" description="Use a TOTP authenticator app for this user account."><MfaManager /></SectionCard>
            <SectionCard title="Local email test" description="Uses SMTP/Gmail settings when EMAIL_PROVIDER=smtp. This is for testing digests/invites while running on localhost.">
              <form action={sendAccountTestEmail} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
                <label><span className="text-sm font-black text-slate-700">Send test to</span><input name="to" type="email" defaultValue={user.email || ""} className={inputClass} /></label>
                <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Send test email</button>
                <p className="mt-3 text-xs font-bold text-slate-500">This tests your local SMTP/Resend sender. Password resets use the custom 8 digit code flow when a Supabase admin key is set, otherwise they use the native Supabase recovery email.</p>
              </form>
            </SectionCard>
            <SectionCard title="Recent security/account events" description="A lightweight log of account and notification changes.">
              <div className="space-y-3">{events.length === 0 ? <p className="text-sm font-bold text-slate-500">No events recorded yet.</p> : null}{events.map((event: any, index: number) => (<div key={`${event.created_at}-${index}`} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700"><UserRound className="h-5 w-5" /></span><div><p className="text-sm font-black text-slate-950">{String(event.event_type).replaceAll("_", " ")}</p><p className="text-xs font-bold text-slate-500">{new Date(event.created_at).toLocaleString("en-GB")}</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{event.status}</span></div>))}</div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <SectionCard title="Email and notification settings" description="Choose how often the app should nudge you with useful financial, renewal and health insights.">
            <form action={saveNotificationPreferences} className="grid gap-5 lg:grid-cols-3">
              {[["finance_digest_enabled", "Finance insights", "Spending patterns, savings forecasts and affordability nudges."], ["health_digest_enabled", "Food & health insights", "Meal planning, shopping lists and macro/micro reminders."], ["renewal_reminders_enabled", "Bill renewal reminders", "Broadband, insurance, mobile and subscription deal checks."], ["weekly_email_enabled", "Weekly email", "A short progress email."], ["monthly_email_enabled", "Monthly email", "A deeper household forecast."], ["in_app_enabled", "In-app notifications", "Show insights in the Notifications page."], ["push_notifications_enabled", "Push notifications later", "Placeholder for PWA/native-app push after deployment."]].map(([name, title, description]) => (<label key={name} className="flex gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-4"><input name={name} type="checkbox" defaultChecked={preferences?.[name as keyof typeof preferences] ?? true} className={`${checkboxClass} mt-1`} /><span><span className="block text-sm font-black text-slate-950">{title}</span><span className="mt-1 block text-xs font-bold text-slate-500">{description}</span></span></label>))}
              <div className="grid gap-4 rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4 lg:col-span-3 md:grid-cols-4"><label><span className="text-sm font-black text-slate-700">Preferred day</span><select name="preferred_send_day" defaultValue={preferences?.preferred_send_day || "Monday"} className={inputClass}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day) => <option key={day}>{day}</option>)}</select></label><label><span className="text-sm font-black text-slate-700">Preferred time</span><input name="preferred_send_time" type="time" defaultValue={preferences?.preferred_send_time || "08:00"} className={inputClass} /></label><label><span className="text-sm font-black text-slate-700">Quiet from</span><input name="quiet_hours_start" type="time" defaultValue={preferences?.quiet_hours_start || "21:00"} className={inputClass} /></label><label><span className="text-sm font-black text-slate-700">Quiet until</span><input name="quiet_hours_end" type="time" defaultValue={preferences?.quiet_hours_end || "07:00"} className={inputClass} /></label></div>
              <div className="lg:col-span-3"><SubmitButton>Save notification preferences</SubmitButton></div>
            </form>
          </SectionCard>
        ) : null}


        {activeTab === "sharing" ? (
          <div className="space-y-6">
            <SectionCard title="My households" description="Use Loop individually, then create or join a household when you want shared planning. Switching household changes the shared dashboard context; your private records remain owned by you.">
              <div className={`grid gap-4 ${userHouseholds.length <= 1 ? "grid-cols-1" : "lg:grid-cols-2"}`}>
                {userHouseholds.length === 0 ? <p className="text-sm font-bold text-slate-500">You are not in a household yet. Create one below.</p> : null}
                {userHouseholds.map((member: any) => {
                  const h = member.app_households || {};
                  const active = h.id && h.id === householdId;
                  return <form key={member.id} action={switchActiveHousehold} className={`group rounded-[2.25rem] border p-0 transition hover:-translate-y-0.5 hover:shadow-xl ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}>
                    <input type="hidden" name="household_id" value={h.id || member.household_id} />
                    <button type="submit" className="grid w-full gap-4 rounded-[2.25rem] p-6 text-left sm:grid-cols-[auto_1fr_auto] sm:items-center">
                      {h.image_url ? <img src={h.image_url} alt="" className="h-16 w-16 rounded-3xl object-cover shadow-sm" /> : <span className={`grid h-16 w-16 place-items-center rounded-3xl text-xl font-black ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>{String(h.name || "H").slice(0,1).toUpperCase()}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-black">{h.name || "Unnamed household"}</span>
                        <span className={`mt-1 block text-xs font-bold ${active ? "text-white/70" : "text-slate-500"}`}>Members: {active ? members.length : "open to view"} · Your status: {member.permission_tier || member.role || "member"}</span>
                        <span className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-black ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>{active ? "Open active household" : "Switch household"}</span>
                      </span>
                      {active ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Active</span> : null}
                    </button>
                  </form>;
                })}
              </div>
            </SectionCard>


            {userHouseholds.length === 0 ? (
              <SectionCard title="Create a household" description="Create your first shared household when you are ready. Once you have a household, this form collapses away so the page stays clean.">
                <form action={createNewHousehold} className="grid gap-4 md:grid-cols-3">
                  <label><span className="text-sm font-black text-slate-700">Household name</span><input name="household_name" className={inputClass} placeholder="The Charlton Household" /></label>
                  <label><span className="text-sm font-black text-slate-700">Timezone</span><input name="timezone" defaultValue={profile?.timezone || "Europe/London"} className={inputClass} /></label>
                  <label><span className="text-sm font-black text-slate-700">Currency</span><input name="currency" defaultValue={profile?.currency || "GBP"} className={inputClass} /></label>
                  <div className="md:col-span-3"><ProfileImageFileInput name="household_image" className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`} /></div>
                  <div className="md:col-span-3"><SubmitButton>Create household</SubmitButton></div>
                </form>
              </SectionCard>
            ) : (
              <details id="create-household" className="rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-sm">
                <summary className="cursor-pointer text-sm font-black text-slate-700">+ Create another household</summary>
                <form action={createNewHousehold} className="mt-4 grid gap-4 md:grid-cols-3">
                  <label><span className="text-sm font-black text-slate-700">Household name</span><input name="household_name" className={inputClass} placeholder="Second household" /></label>
                  <label><span className="text-sm font-black text-slate-700">Timezone</span><input name="timezone" defaultValue={profile?.timezone || "Europe/London"} className={inputClass} /></label>
                  <label><span className="text-sm font-black text-slate-700">Currency</span><input name="currency" defaultValue={profile?.currency || "GBP"} className={inputClass} /></label>
                  <div className="md:col-span-3"><ProfileImageFileInput name="household_image" className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white`} /></div>
                  <div className="md:col-span-3"><SubmitButton>Create household</SubmitButton></div>
                </form>
              </details>
            )}

            {householdId ? (
              <SectionCard title="Household invites and QR links" description="Invites now live inside the active household. Open the household page to invite someone, refresh QR links or remove members.">
                <div className="flex flex-wrap gap-3">
                  <Link href="/household" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Open household</Link>
                  {canShareHousehold ? <Link href="/household#invite" className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">Invite from household</Link> : null}
                </div>
              </SectionCard>
            ) : null}

            {canManagePermissions ? (
              <SectionCard title="Household members, roles and permission tiers" description="Admin rights and permission controls now sit with Households & sharing, because they only affect the active household context.">
                <div className="space-y-4">
                  {members.length === 0 ? <p className="text-sm font-bold text-slate-500">No household members found yet.</p> : null}
                  {members.map((member: any) => (
                    <form key={member.id} action={saveHouseholdPermissions} className="rounded-3xl border border-slate-200 bg-white p-5">
                      <input type="hidden" name="member_id" value={member.id} />
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px_150px] xl:items-end">
                        <div className="min-w-0"><p className="break-all font-black text-slate-950">{member.email || member.user_id}</p><p className="text-xs font-bold text-slate-500">Current: {member.role || "member"} · {member.permission_tier || "member"}</p></div>
                        <label><span className="text-sm font-black text-slate-700">Role</span><select name="role" defaultValue={member.role || "member"} className={inputClass}><option value="owner">Owner</option><option value="parent_admin">Parent/admin</option><option value="member">Member</option><option value="child">Child</option><option value="viewer">Viewer</option></select></label>
                        <label><span className="text-sm font-black text-slate-700">Tier</span><select name="permission_tier" defaultValue={member.permission_tier || "member"} className={inputClass}><option value="owner">Owner</option><option value="admin">Admin</option><option value="parent">Parent</option><option value="member">Member</option><option value="viewer">Viewer</option><option value="child_managed">Child managed</option></select></label>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["can_manage_people", "Manage people"], ["can_manage_child_profiles", "Manage children"], ["can_view_household_income", "View household income"], ["can_manage_household_costs", "Manage costs"], ["can_manage_integrations", "Manage integrations"]].map(([name, label]) => (<label key={name} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700"><input type="checkbox" name={name} defaultChecked={Boolean(member[name])} /> {label}</label>))}</div>
                      <div className="mt-4"><button disabled={!canManagePermissions} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Save permissions</button></div>
                    </form>
                  ))}
                </div>
              </SectionCard>
            ) : null}

          </div>
        ) : null}


        {activeTab === "plan" ? (
          <div className="space-y-6">
            <SectionCard title="Your plan" description="This is pulled from the tier database, so you can test upgrade logic before payment gateway enforcement is turned on.">
              <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
                <div className="rounded-3xl bg-slate-950 p-6 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Current tier</p>
                  <h2 className="mt-2 text-4xl font-black">{myPlanData?.current_plan?.name || "Free"}</h2>
                  <p className="mt-2 text-sm font-semibold text-white/70">{myPlanData?.current_plan?.description || "Core beta access and manual tracking."}</p>
                  <Link href="/account/plan" className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Open full plan page</Link>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(myPlanData?.features || []).slice(0, 8).map((feature: any) => (
                    <div key={feature.feature_key} className="rounded-3xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{feature.category}</p>
                      <div className="mt-1 flex items-center justify-between gap-3"><h3 className="font-black text-slate-950">{feature.name}</h3><Pill tone={feature.enabled ? "green" : "slate"}>{feature.enabled ? "On" : "Off"}</Pill></div>
                      {feature.limit_value ? <p className="mt-2 text-xs font-bold text-slate-500">Limit: {feature.limit_value} {feature.limit_period !== "none" ? `/ ${feature.limit_period}` : ""}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Compare tiers" description="The table below is built from the tier/feature database so changes in Admin are reflected here.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-[0.2em] text-slate-400"><th className="py-3">Plan</th><th>Price</th><th>AI</th><th>Health</th><th>Wealth / investments</th><th>Upgrade</th></tr></thead>
                  <tbody>
                    {planComparison.map((plan: any) => {
                      const features = plan.features || [];
                      const ai = features.filter((f: any) => f.category === "AI" && f.enabled).map((f: any) => f.name).slice(0, 3).join(", ") || "Limited";
                      const health = features.filter((f: any) => f.category === "Health" && f.enabled).map((f: any) => f.name).slice(0, 3).join(", ") || "Not included";
                      const wealth = features.filter((f: any) => f.category === "Wealth" && f.enabled).map((f: any) => f.name).slice(0, 3).join(", ") || "Not included";
                      return <tr key={plan.slug} className="border-b align-top"><td className="py-4"><p className="font-black text-slate-950">{plan.name}</p>{plan.slug === currentPlanSlug ? <Pill tone="green">Current</Pill> : null}</td><td className="py-4 font-bold">£{(Number(plan.monthly_price_pence || 0) / 100).toFixed(2)} / mo</td><td className="py-4 text-slate-600">{ai}</td><td className="py-4 text-slate-600">{health}</td><td className="py-4 text-slate-600">{wealth}</td><td className="py-4"><Link href="/account/plan" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">View</Link></td></tr>;
                    })}
                  </tbody>
                </table>
                {planComparison.length === 0 ? <p className="py-6 text-sm font-bold text-slate-500">Run the v27.58/v27.59 tier SQL to populate plan comparison data.</p> : null}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "integrations" ? (
          <div className="space-y-6">
            <SectionCard title="Connected investment providers" description="Manage provider access from your account. Removing a provider archives imported SnapTrade accounts and restores any manual investment inputs that were archived during import.">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm font-bold text-blue-950">
                <p className="font-black">Trading 212 GIA and ISA logic</p>
                <p className="mt-1">One SnapTrade connection can return multiple broker accounts when those accounts sit under the same broker credentials. If Trading 212/SnapTrade returns both a GIA and a Stocks & Shares ISA, LOOP shows both separately and lets you import either or both. If the broker/API only returns one wrapper for a key, connect another key and LOOP will still dedupe by provider, wrapper, account number and external account ID.</p>
              </div>
              <div className="mt-5 space-y-3">
                {snapTradeConnections.map((connection) => {
                  const active = !["archived", "deleted", "removed", "disconnected"].includes(String(connection.status || "").toLowerCase());
                  return (
                    <div key={connection.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-600 text-sm font-black text-white">ST</span>
                            <div>
                              <p className="text-lg font-black text-slate-950">SnapTrade</p>
                              <p className="text-xs font-bold text-slate-500">{connection.external_connection_id ? `Connection ${connection.external_connection_id}` : "Registered user connection"}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Pill tone={active ? "green" : "amber"}>{connection.status || "connected"}</Pill>
                            {connection.last_synced_at ? <Pill>{`synced ${String(connection.last_synced_at).slice(0, 10)}`}</Pill> : <Pill>not synced yet</Pill>}
                          </div>
                          {connection.notes ? <p className="mt-3 max-w-3xl text-sm font-bold text-slate-500">{connection.notes}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href="/investments" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Open investments</Link>
                          <form action={removeSnapTradeConnectionAndRestoreManual}>
                            <input type="hidden" name="connection_id" value={connection.id} />
                            <input type="hidden" name="external_connection_id" value={connection.external_connection_id || ""} />
                            <button className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700"><Unplug className="h-4 w-4" /> Remove access</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!snapTradeConnections.length ? <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">No SnapTrade provider connection is saved yet. Connect from the Investments page when your tier allows realtime/provider sync.</p> : null}
              </div>
            </SectionCard>

            <SectionCard title="Imported broker accounts" description="These are LOOP investment pots created from SnapTrade. You can hide one without deleting the provider connection; LOOP will restore linked manual inputs where a migration record exists.">
              <div className="grid gap-4 lg:grid-cols-2">
                {snapTradeImportedAccounts.map((account) => {
                  const active = String(account.record_status || "active") !== "archived";
                  return (
                    <div key={account.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">ST</span><p className="font-black text-slate-950">{account.label}</p></div>
                          <p className="mt-1 text-sm font-bold text-slate-500">{account.provider || "Provider"} · {account.account_type || "investment"} · {account.external_account_id || "no external account id"}</p>
                          <div className="mt-3 flex flex-wrap gap-2"><Pill tone={active ? "green" : "amber"}>{active ? "active" : "hidden"}</Pill>{account.sync_status ? <Pill>{account.sync_status}</Pill> : null}</div>
                        </div>
                        {active ? <form action={hideSnapTradeImportedAccount}><input type="hidden" name="account_id" value={account.id} /><button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Hide / restore manual</button></form> : null}
                      </div>
                    </div>
                  );
                })}
                {!snapTradeImportedAccounts.length ? <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">No broker accounts have been imported yet.</p> : null}
              </div>
            </SectionCard>

            <SectionCard title="Archived manual investment inputs" description="Manual pots archived during a SnapTrade import are kept here. Restore them when you remove access, downgrade, or simply prefer to track manually again.">
              <div className="grid gap-4 lg:grid-cols-2">
                {archivedManualInvestmentAccounts.map((account) => (
                  <div key={account.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                    <p className="font-black text-slate-950">{account.label}</p>
                    <p className="mt-1 text-sm font-bold text-amber-900">{account.provider || "Manual"} · {account.account_type || "investment"}</p>
                    <p className="mt-2 text-xs font-bold text-amber-800">{account.archive_reason || account.provider_migration_status || "Archived manual input"}</p>
                    <form action={restoreArchivedManualInvestmentAccount} className="mt-4">
                      <input type="hidden" name="account_id" value={account.id} />
                      <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"><RotateCcw className="h-4 w-4" /> Restore manual tracking</button>
                    </form>
                  </div>
                ))}
                {!archivedManualInvestmentAccounts.length ? <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-500">No archived manual investment pots yet.</p> : null}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {false && activeTab === "permissions" ? (
          <div className="space-y-6">
            <SectionCard title="Admin rights & permission tiers" description="This controls household-level visibility, account administration and who can manage child profiles. Sensitive values remain person-owned by default.">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><Crown className="h-5 w-5 text-orange-500" /><h3 className="font-black text-slate-950">Owner</h3></div><p className="mt-2 text-sm font-bold text-slate-500">Can manage household settings, people, costs, permissions and integrations.</p></div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-slate-700" /><h3 className="font-black text-slate-950">Parent / admin</h3></div><p className="mt-2 text-sm font-bold text-slate-500">Can manage children and household costs, depending on toggles.</p></div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5 text-slate-700" /><h3 className="font-black text-slate-950">Member / child</h3></div><p className="mt-2 text-sm font-bold text-slate-500">Controls their own account, with household visibility explicitly granted.</p></div>
              </div>
            </SectionCard>

            <SectionCard title="Household members" description="Promote adults to parent/admin tiers only when they should help manage the household. Normal users do not see admin/platform/integration pages.">
              <div className="space-y-4">
                {members.length === 0 ? <p className="text-sm font-bold text-slate-500">No household members found yet.</p> : null}
                {members.map((member: any) => (
                  <form key={member.id} action={saveHouseholdPermissions} className="rounded-3xl border border-slate-200 bg-white p-5">
                    <input type="hidden" name="member_id" value={member.id} />
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="md:col-span-2"><p className="font-black text-slate-950">{member.email || member.user_id}</p><p className="text-xs font-bold text-slate-500">Current: {member.role || "member"} · {member.permission_tier || "member"}</p></div>
                      <label><span className="text-sm font-black text-slate-700">Role</span><select name="role" defaultValue={member.role || "member"} className={inputClass}><option value="owner">Owner</option><option value="parent_admin">Parent/admin</option><option value="member">Member</option><option value="child">Child</option><option value="viewer">Viewer</option></select></label>
                      <label><span className="text-sm font-black text-slate-700">Tier</span><select name="permission_tier" defaultValue={member.permission_tier || "member"} className={inputClass}><option value="owner">Owner</option><option value="admin">Admin</option><option value="parent">Parent</option><option value="member">Member</option><option value="viewer">Viewer</option><option value="child_managed">Child managed</option></select></label>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-5">{[["can_manage_people", "Manage people"], ["can_manage_child_profiles", "Manage children"], ["can_view_household_income", "View household income"], ["can_manage_household_costs", "Manage costs"], ["can_manage_integrations", "Manage integrations"]].map(([name, label]) => (<label key={name} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700"><input type="checkbox" name={name} defaultChecked={Boolean(member[name])} /> {label}</label>))}</div>
                    <div className="mt-4"><button disabled={!canManagePermissions} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Save permissions</button></div>
                  </form>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Parent / child allocation" description="Parents can be assigned to children. This supports the long-term model where children mature into their own accounts at 18 with history preserved.">
              <div className="space-y-4">
                {children.length === 0 ? <p className="text-sm font-bold text-slate-500">No child profiles found.</p> : null}
                {children.map((child) => {
                  const selected = new Set(guardianLinks.filter((link) => link.child_person_id === child.id).map((link) => link.guardian_person_id));
                  return <form key={child.id} action={assignChildGuardians} className="rounded-3xl border border-sky-100 bg-sky-50/40 p-5"><input type="hidden" name="child_id" value={child.id} /><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-black text-slate-950">{child.name}</p><p className="text-xs font-bold text-slate-500">{child.email || "No linked email yet"}</p></div><div className="flex flex-wrap gap-2">{adults.map((adult) => <label key={adult.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700"><input type="checkbox" name="guardian_person_id" value={adult.id} defaultChecked={selected.has(adult.id)} /> {adult.name}</label>)}</div></div><button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Save guardians</button></form>;
                })}
              </div>
            </SectionCard>

            {access.isAdmin ? <SectionCard title="Creator-only admin links" description="Email design, digest previews, platform checks and integrations sit behind creator/admin access."><div className="grid gap-3 md:grid-cols-3"><Link href="/admin" className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"><Mail className="mb-3 h-5 w-5" /> Email/admin insight engine</Link><Link href="/platform" className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"><ShieldCheck className="mb-3 h-5 w-5" /> Platform readiness</Link><Link href="/integrations" className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm font-black text-slate-900 hover:bg-slate-50"><BellRing className="mb-3 h-5 w-5" /> Integrations & tokens</Link></div></SectionCard> : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
