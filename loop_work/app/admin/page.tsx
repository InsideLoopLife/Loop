import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BellRing, CheckCircle2, Crown, Database, KeyRound, Mail, ShieldAlert, ShieldCheck, Sparkles, UserCog, UsersRound, XCircle } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { buildRuntimeReadiness, ReadinessItem } from "@/lib/platform/production-readiness";
import { createDigestPreview, createInsightNotification, saveEmailTemplate, sendTestDigest, runCustomerEntitlementCheck, updateUserPaymentTier } from "./actions";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";

import { AdminTabs } from "@/components/admin/AdminTabs";
function inputClass() {
  return "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
}

function statusClass(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-700";
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="h-5 w-5" />;
  if (status === "warn") return <ShieldAlert className="h-5 w-5" />;
  return <XCircle className="h-5 w-5" />;
}

async function safeCount(client: any, table: string) {
  try {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
    return { table, count: count ?? 0, status: error ? "fail" as const : "pass" as const, error: error?.message || null };
  } catch (error: any) {
    return { table, count: 0, status: "fail" as const, error: error?.message || "Table check failed" };
  }
}

async function safeSelect<T = any>(promise: PromiseLike<{ data: T | null; error?: any }>, fallback: T): Promise<T> {
  try {
    const result = await promise;
    return result.error ? fallback : (result.data || fallback);
  } catch {
    return fallback;
  }
}

function readinessScore(items: ReadinessItem[]) {
  const pass = items.filter((item) => item.status === "pass").length;
  return `${pass}/${items.length}`;
}

export default async function AdminPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin")}`);

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-red-950">Admin access is not enabled for this account</h1>
              <p className="mt-2 text-sm font-bold text-red-700">This admin area is locked to: {access.allowedEmails.join(", ")}. You are signed in as {access.user.email || "unknown email"}.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/admin/setup" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Admin setup</Link>
                <Link href="/login?next=/admin" className="rounded-full bg-white px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-200">Switch account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const supabase = createBestAdminClient() || await createClient();
  const readiness = buildRuntimeReadiness(process.env);
  const dbTables = [
    "app_user_profiles",
    "app_households",
    "app_household_members",
    "people",
    "app_notifications",
    "app_admin_users",
    "pay_events",
    "planned_items",
    "food_meals",
    "food_logs",
    "investment_pots",
    "investment_holdings",
    "app_customer_entitlement_checks",
    "app_market_data_usage",
  ];

  const [tableHealth, templates, runs, notifications, users, adminRows, prefs] = await Promise.all([
    Promise.all(dbTables.map((table) => safeCount(supabase, table))),
    safeSelect<any[]>(supabase.from("app_email_templates").select("*").order("category").order("name"), []),
    safeSelect<any[]>(supabase.from("app_email_runs").select("*").order("created_at", { ascending: false }).limit(10), []),
    safeSelect<any[]>(supabase.from("app_notifications").select("id, status, severity, title, created_at, category, channel, action_status").order("created_at", { ascending: false }).limit(10), []),
    safeSelect<any[]>(supabase.from("app_user_profiles").select("user_id, display_name, email, household_id, updated_at, payment_tier, payment_tier_status, payment_tier_override, billing_provider, billing_customer_id, billing_subscription_id, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled, tier_checked_at, tier_check_note").order("updated_at", { ascending: false }).limit(80), []),
    safeSelect<any[]>(supabase.from("app_admin_users").select("email, role, status, created_at").order("created_at", { ascending: true }).limit(20), []),
    safeSelect<any[]>(supabase.from("app_notification_preferences").select("user_id, finance_digest_enabled, health_digest_enabled, in_app_enabled, push_notifications_enabled").limit(80), []),
  ]);

  const defaultUserId = access.user.id;
  const defaultEmail = access.user.email || "";
  const dbPassing = tableHealth.filter((row) => row.status === "pass").length;
  const failedTables = tableHealth.filter((row) => row.status === "fail");
  const currentAdminRow = adminRows.find((row) => String(row.email || "").toLowerCase() === String(defaultEmail).toLowerCase());
  const inAppUsers = prefs.filter((pref) => pref.in_app_enabled !== false).length;
  const financeDigestUsers = prefs.filter((pref) => pref.finance_digest_enabled !== false).length;
  const healthDigestUsers = prefs.filter((pref) => pref.health_digest_enabled !== false).length;
  const realtimeUsers = users.filter((user: any) => investmentDataEntitlementForProfile(user).canUseRealtimePrices).length;
  const paidTierUsers = users.filter((user: any) => ["starter", "plus", "pro", "realtime", "enterprise"].includes(String(user.payment_tier || user.payment_tier_override || ""))).length;

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <Crown className="h-4 w-4" /> Admin control centre
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Users, permissions and system health</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">A user-first admin page for checking who can access what, whether database-backed features are working, and whether notifications/insights are ready before you put Loop live.</p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/75">
            <p>Signed in as <span className="text-white">{defaultEmail}</span></p>
            <p className="mt-1">Access via <span className="text-white">{access.reason}</span></p>
            <p className="mt-1">Allowed admin email <span className="text-white">{access.allowedEmails.join(", ")}</span></p>
          </div>
        </div>
      </section>

      <AdminTabs />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Runtime checks" value={readinessScore(readiness)} helper="environment/config" />
        <StatCard title="Database tables" value={`${dbPassing}/${tableHealth.length}`} helper="queryable tables" />
        <StatCard title="Profiles" value={String(users.length)} helper={`${paidTierUsers} paid/overridden`} />
        <StatCard title="Market data" value={String(realtimeUsers)} helper="realtime-enabled users" />
        <StatCard title="Admin account" value={currentAdminRow?.role || "creator"} helper={currentAdminRow?.status || "allow-list"} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <SectionCard title="User access and permissions" description="This keeps the admin page focused on users first: who exists, what household they belong to, and what notification channels are enabled.">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">In-app enabled</p><p className="mt-1 text-3xl font-black text-slate-950">{inAppUsers}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Wealth digest</p><p className="mt-1 text-3xl font-black text-slate-950">{financeDigestUsers}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Lifestyle digest</p><p className="mt-1 text-3xl font-black text-slate-950">{healthDigestUsers}</p></div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Household</th><th className="p-3">Updated</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.slice(0, 12).map((user) => <tr key={user.user_id}><td className="p-3"><p className="font-black text-slate-950">{user.display_name || user.email || "Unknown"}</p><p className="text-xs font-semibold text-slate-500">{user.email || user.user_id}</p></td><td className="p-3 text-xs font-bold text-slate-600">{user.household_id || "—"}</td><td className="p-3 text-xs font-bold text-slate-500">{user.updated_at ? new Date(user.updated_at).toLocaleDateString("en-GB") : "—"}</td></tr>)}
                {!users.length ? <tr><td className="p-4 text-sm font-bold text-slate-500" colSpan={3}>No profiles found yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Customer tiers and market-data checks" description="Use this when a payment tier does not sync automatically, or before enabling a paid realtime share-data provider for a user.">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Paid/overridden</p><p className="mt-1 text-3xl font-black text-slate-950">{paidTierUsers}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Realtime enabled</p><p className="mt-1 text-3xl font-black text-slate-950">{realtimeUsers}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Provider checks</p><p className="mt-1 text-3xl font-black text-slate-950">Manual</p></div>
          </div>
          <div className="space-y-3">
            {users.slice(0, 10).map((user: any) => {
              const entitlement = investmentDataEntitlementForProfile(user);
              return <article key={`tier-${user.user_id}`} className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-black text-slate-950">{user.display_name || user.email || user.user_id}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{user.email || "No email"} · customer {user.billing_customer_id || "not linked"}</p>
                    <p className="mt-2 text-sm font-black text-slate-700">{entitlement.label} · {entitlement.paymentTier}/{entitlement.paymentStatus}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{entitlement.reason}</p>
                    {user.tier_checked_at ? <p className="mt-1 text-xs font-bold text-slate-400">Last checked {new Date(user.tier_checked_at).toLocaleString("en-GB")} · {user.tier_check_note || "reviewed"}</p> : null}
                  </div>
                  <form action={updateUserPaymentTier} className="grid min-w-[560px] gap-2 md:grid-cols-6">
                    <input type="hidden" name="target_user_id" value={user.user_id} />
                    <input type="hidden" name="email" value={user.email || ""} />
                    <label className="md:col-span-1"><span className="text-xs font-black text-slate-500">Plan</span><select name="payment_tier" defaultValue={user.payment_tier || "free"} className={inputClass()}><option value="free">Free</option><option value="starter">Starter</option><option value="plus">Plus</option><option value="pro">Pro</option><option value="realtime">Realtime</option><option value="enterprise">Enterprise</option></select></label>
                    <label className="md:col-span-1"><span className="text-xs font-black text-slate-500">Status</span><select name="payment_tier_status" defaultValue={user.payment_tier_status || "inactive"} className={inputClass()}><option value="active">Active</option><option value="trialing">Trialing</option><option value="manual_review">Manual review</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="inactive">Inactive</option></select></label>
                    <label className="md:col-span-1"><span className="text-xs font-black text-slate-500">Data</span><select name="market_data_tier" defaultValue={user.market_data_tier || "manual"} className={inputClass()}><option value="manual">Manual</option><option value="delayed">Delayed</option><option value="enhanced_delayed">Enhanced delayed</option><option value="realtime">Realtime</option></select></label>
                    <label className="md:col-span-1"><span className="text-xs font-black text-slate-500">Provider</span><select name="market_data_provider_status" defaultValue={user.market_data_provider_status || "not_configured"} className={inputClass()}><option value="not_configured">Not configured</option><option value="connected">Connected</option><option value="degraded">Degraded</option><option value="disabled">Disabled</option></select></label>
                    <label className="md:col-span-1"><span className="text-xs font-black text-slate-500">Realtime?</span><select name="market_data_realtime_enabled" defaultValue={user.market_data_realtime_enabled ? "true" : "false"} className={inputClass()}><option value="false">No</option><option value="true">Yes</option></select></label>
                    <div className="flex items-end"><button className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white">Save</button></div>
                  </form>
                  <form action={runCustomerEntitlementCheck} className="flex items-end">
                    <input type="hidden" name="target_user_id" value={user.user_id} />
                    <button className="rounded-2xl bg-blue-50 px-4 py-3 text-xs font-black text-blue-700 ring-1 ring-blue-100">Run check</button>
                  </form>
                </div>
              </article>;
            })}
          </div>
        </SectionCard>

        <SectionCard title="Admin security" description="Admin access is restricted by email first, then by the admin table where available.">
          <div className="space-y-3">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><ShieldCheck className="mb-2 h-5 w-5" /> Only allow-listed admin emails can pass /admin. Current allow-list: {access.allowedEmails.join(", ")}.</div>
            {adminRows.map((row) => <div key={row.email} className="rounded-3xl border border-slate-200 bg-white p-4"><p className="font-black text-slate-950">{row.email}</p><p className="mt-1 text-sm font-bold text-slate-500">{row.role} · {row.status}</p></div>)}
            {!adminRows.length ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">No app_admin_users row found yet. /admin still allows the configured email, but run the migration/setup for a proper DB role.</div> : null}
            <Link href="/admin/setup" className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"><KeyRound className="h-4 w-4" /> Admin password setup</Link>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Runtime readiness" description="Environment and infrastructure settings that affect security, access, scheduled jobs and email.">
          <div className="grid gap-3">
            {readiness.map((item) => <article key={item.key} className={`rounded-3xl border p-4 ${statusClass(item.status)}`}><div className="flex items-start gap-3"><StatusIcon status={item.status} /><div><p className="font-black">{item.title}</p><p className="mt-1 text-sm font-bold opacity-85">{item.detail}</p>{item.action ? <p className="mt-2 text-xs font-black opacity-80">Action: {item.action}</p> : null}</div></div></article>)}
          </div>
        </SectionCard>

        <SectionCard title="Database status" description="Quick table-level checks so you can spot missing migrations before a feature silently fails.">
          <div className="grid gap-3 sm:grid-cols-2">
            {tableHealth.map((row) => <article key={row.table} className={`rounded-3xl border p-4 ${statusClass(row.status)}`}><div className="flex items-start gap-3"><Database className="h-5 w-5" /><div><p className="font-black">{row.table}</p><p className="mt-1 text-sm font-bold opacity-85">{row.status === "pass" ? `${row.count} row(s)` : row.error}</p></div></div></article>)}
          </div>
          {failedTables.length ? <p className="mt-4 rounded-3xl bg-red-50 p-4 text-sm font-black text-red-700">Missing/blocked tables detected: {failedTables.map((row) => row.table).join(", ")}. Run the latest migrations before deploying.</p> : null}
        </SectionCard>
      </section>

      <SectionCard title="Create a useful nudge" description="Send an in-app notification to yourself or a selected user. Use this to test wealth, lifestyle and household approval flows.">
        <form action={createInsightNotification} className="grid gap-4 lg:grid-cols-4">
          <label><span className="text-sm font-black text-slate-700">User</span><select name="target_user_id" defaultValue={defaultUserId} className={inputClass()}><option value={defaultUserId}>Me ({defaultEmail})</option>{users.map((user: any) => <option key={user.user_id} value={user.user_id}>{user.display_name || user.email || user.user_id}</option>)}</select></label>
          <label><span className="text-sm font-black text-slate-700">Type</span><select name="notification_type" className={inputClass()}><option value="finance_insight">Wealth insight</option><option value="nutrition_weekly_insight">Lifestyle nutrition</option><option value="household_approval_request">Household approval</option><option value="renewal_reminder">Bill renewal</option></select></label>
          <label><span className="text-sm font-black text-slate-700">Severity</span><select name="severity" className={inputClass()}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="urgent">Urgent</option></select></label>
          <label><span className="text-sm font-black text-slate-700">Link</span><input name="cta_href" placeholder="/notifications" className={inputClass()} /></label>
          <label className="lg:col-span-2"><span className="text-sm font-black text-slate-700">Title</span><input name="title" placeholder="You have a household request to review" required className={inputClass()} /></label>
          <label className="lg:col-span-2"><span className="text-sm font-black text-slate-700">Body</span><input name="body" placeholder="A food allocation or household invite needs your approval." className={inputClass()} /></label>
          <div className="lg:col-span-4"><button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"><BellRing className="mr-2 inline h-4 w-4" />Create notification</button></div>
        </form>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <SectionCard title="Recent notifications" description="Last notifications created by app events, admin actions or future scheduled jobs.">
          <div className="space-y-3">
            {notifications.map((notification: any) => <article key={notification.id} className="rounded-3xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{notification.title}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{notification.category || notification.notification_type || "notification"} · {notification.status} · {notification.severity}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{notification.channel || "in_app"}</span></div></article>)}
            {!notifications.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No notifications found yet.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Email templates and digest checks" description="Keep digest formatting here, but the main admin focus is user permissions and system health.">
          <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-3">
              {templates.slice(0, 6).map((template: any) => <article key={template.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{template.name}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{template.category} · {template.cadence}</p><p className="mt-2 text-sm font-medium text-slate-600">{template.subject}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${template.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{template.enabled ? "Enabled" : "Off"}</span></div><div className="mt-4 flex flex-wrap gap-2"><form action={createDigestPreview}><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="target_user_id" value={defaultUserId} /><input type="hidden" name="target_email" value={defaultEmail} /><button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Preview</button></form><form action={sendTestDigest}><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="target_user_id" value={defaultUserId} /><input type="hidden" name="target_email" value={defaultEmail} /><button className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white"><Mail className="h-4 w-4" /> Test email</button></form></div></article>)}
              {!templates.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No email templates found.</p> : null}
            </div>
            <form action={saveEmailTemplate} className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5">
              <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-500" /><h3 className="font-black text-slate-950">Add/edit template</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <label><span className="text-sm font-black text-slate-700">Template key</span><input name="template_key" required placeholder="weekly_custom_digest" className={inputClass()} /></label>
                <label><span className="text-sm font-black text-slate-700">Name</span><input name="name" required placeholder="Weekly custom digest" className={inputClass()} /></label>
                <label><span className="text-sm font-black text-slate-700">Category</span><select name="category" className={inputClass()}><option value="finance">Wealth</option><option value="health">Lifestyle</option><option value="household">Household</option><option value="platform">Platform</option></select></label>
                <label><span className="text-sm font-black text-slate-700">Cadence</span><select name="cadence" className={inputClass()}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="event">Event</option><option value="manual">Manual</option></select></label>
                <label className="md:col-span-2"><span className="text-sm font-black text-slate-700">Subject</span><input name="subject" required placeholder="Your Loop weekly update" className={inputClass()} /></label>
                <label className="md:col-span-2"><span className="text-sm font-black text-slate-700">Body markdown</span><textarea name="body_markdown" required rows={6} className={`${inputClass()} min-h-[180px]`} placeholder="Hi {{first_name}}, here is your update..." /></label>
                <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" name="enabled" defaultChecked /> Enabled</label>
              </div>
              <button className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Save template</button>
            </form>
          </div>
        </SectionCard>
      </section>
    </main>
  );
}
