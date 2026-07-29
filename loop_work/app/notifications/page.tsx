import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CheckCircle2, HeartPulse, Info, LineChart, MailCheck, Sparkles, Trash2, UserCheck } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { NotificationAutoRefresh } from "@/components/notifications/NotificationAutoRefresh";
import { createClient } from "@/lib/supabase/server";
import { acceptNotificationRequest, createWeeklyPreview, declineNotificationRequest, dismissNotification, markNotificationRead } from "./actions";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function categoryOf(notification: any): "wealth" | "lifestyle" | "household" | "system" {
  if (notification.category) return notification.category;
  const type = String(notification.notification_type || "").toLowerCase();
  if (type.includes("nutrition") || type.includes("food") || type.includes("meal") || type.includes("health")) return "lifestyle";
  if (type.includes("investment") || type.includes("stock") || type.includes("finance") || type.includes("money") || type.includes("renewal") || type.includes("mortgage")) return "wealth";
  if (type.includes("household") || type.includes("invite") || type.includes("profile") || type.includes("allocation")) return "household";
  return "system";
}

function tone(status: string, severity: string, category: string) {
  if (status === "read" || status === "accepted") return "border-slate-200 bg-white/80";
  if (severity === "urgent") return "border-red-200 bg-red-50/80";
  if (severity === "warning") return "border-orange-200 bg-orange-50/80";
  if (severity === "success") return "border-emerald-200 bg-emerald-50/80";
  if (category === "wealth") return "border-blue-100 bg-blue-50/80";
  if (category === "lifestyle") return "border-emerald-100 bg-emerald-50/80";
  return "border-slate-200 bg-white/80";
}

function iconFor(notification: any) {
  const category = categoryOf(notification);
  const type = String(notification.notification_type || "").toLowerCase();
  if (type.includes("invite")) return UserCheck;
  if (type.includes("investment") || category === "wealth") return LineChart;
  if (category === "lifestyle") return HeartPulse;
  if (notification.status === "read") return CheckCircle2;
  return Info;
}

function priority(notification: any) {
  const type = String(notification.notification_type || "").toLowerCase();
  if (type.includes("household_invite") || type.includes("profile_claim")) return 0;
  if (type.includes("allocation") || type.includes("approval")) return 1;
  if (notification.severity === "urgent") return 2;
  if (notification.severity === "warning") return 3;
  return 5;
}

const tabs = [
  { key: "all", label: "All" },
  { key: "wealth", label: "Wealth" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "household", label: "Household" },
] as const;

export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};
  const activeTab = tabs.some((tab) => tab.key === params.tab) ? params.tab! : "all";
  await supabase.rpc("app_cleanup_household_invite_state", { p_user_id: user.id });
  const { data: rawNotifications } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(120);

  const notifications = (rawNotifications || [])
    .sort((a: any, b: any) => priority(a) - priority(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const filtered = activeTab === "all" ? notifications : notifications.filter((item: any) => categoryOf(item) === activeTab);
  const unread = notifications.filter((n: any) => n.status === "unread").length;
  const urgent = notifications.filter((n: any) => n.severity === "urgent" || n.severity === "warning").length;
  const inviteCount = notifications.filter((n: any) => String(n.notification_type || "").includes("household_invite") && n.status === "unread").length;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <BellRing className="h-4 w-4" /> Notification hub
            </div>
            <h1 className="text-4xl font-black tracking-tight">Useful nudges, not noise</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-white/70">Household approvals, wealth snapshots and lifestyle insights land here first. Accept one-time household invites from the top, then dismiss weekly insights when they’ve been useful.</p>
          </div>
          <form action={createWeeklyPreview}>
            <button className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950"><Sparkles className="h-4 w-4" /> Generate weekly preview</button>
          </form>
        </div>
      </section>

      <NotificationAutoRefresh />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Unread" value={String(unread)} helper="Items waiting for you" />
        <StatCard title="Needs attention" value={String(urgent)} helper="Warnings/urgent nudges" />
        <StatCard title="Household invites" value={String(inviteCount)} helper="One-time approvals" />
        <StatCard title="Total active" value={String(notifications.length)} helper="Not dismissed" />
      </div>

      <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const href = tab.key === "all" ? "/notifications" : `/notifications?tab=${tab.key}`;
          const count = tab.key === "all" ? notifications.length : notifications.filter((item: any) => categoryOf(item) === tab.key).length;
          const active = activeTab === tab.key;
          return <Link key={tab.key} href={href} className={`rounded-full px-4 py-2 text-sm font-black ${active ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>{tab.label} <span className="ml-1 opacity-70">{count}</span></Link>;
        })}
      </div>

      <SectionCard title={activeTab === "all" ? "Latest notifications" : `${tabs.find((tab) => tab.key === activeTab)?.label} notifications`} description="Approvals sit first; weekly insight cards can be opened, switched by period where relevant, then dismissed.">
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
              Nothing in this channel yet. Weekly previews and household approvals will appear here automatically.
            </div>
          ) : null}
          {filtered.map((notification: any) => {
            const category = categoryOf(notification);
            const Icon = iconFor(notification);
            const type = String(notification.notification_type || "").toLowerCase();
            const approval = type.includes("allocation") || type.includes("approval") || type.includes("profile_claim");
            const invite = type.includes("household_invite");
            const period = notification.period_key || "week";
            const hasPeriodToggle = type.includes("investment") || type.includes("weekly_progress") || type.includes("weekly_insight");
            return (
              <article key={notification.id} className={`rounded-3xl border p-5 ${tone(notification.status, notification.severity, category)}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-black text-slate-950">{notification.title}</h2>
                        {invite ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black uppercase text-amber-700">Invite — action needed</span> : null}
                        {approval ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black uppercase text-emerald-700">Needs decision</span> : null}
                        <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-black uppercase text-slate-500">{category}</span>
                        <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-black uppercase text-slate-500">{notification.severity}</span>
                      </div>
                      {notification.body ? <p className="mt-2 text-sm font-medium text-slate-600">{notification.body}</p> : null}
                      {hasPeriodToggle ? <div className="mt-3 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-white/80 px-3 py-1 text-slate-500">View:</span>{["week", "month", "year"].map((key) => <Link key={key} href={`${notification.cta_href || "/dashboard"}${notification.cta_href?.includes("?") ? "&" : "?"}period=${key}`} className={`rounded-full px-3 py-1 ${period === key ? "bg-slate-950 text-white" : "bg-white text-slate-600"}`}>{key}</Link>)}</div> : null}
                      <p className="mt-2 text-xs font-bold text-slate-400">{new Date(notification.created_at).toLocaleString("en-GB")}</p>
                      {notification.cta_href ? <Link href={notification.cta_href} className="mt-3 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">{notification.cta_label || "Open"}</Link> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {approval && notification.status !== "read" ? (
                      <>
                        <Link href={`/notifications/${notification.id}`} className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">Review details</Link>
                        <form action={acceptNotificationRequest}><input type="hidden" name="id" value={notification.id} /><button className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-black text-white"><MailCheck className="mr-1 inline h-4 w-4" /> Keep / accept</button></form>
                        <form action={declineNotificationRequest}><input type="hidden" name="id" value={notification.id} /><button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Decline</button></form>
                      </>
                    ) : null}
                    {notification.status !== "read" ? (
                      <form action={markNotificationRead}>
                        <input type="hidden" name="id" value={notification.id} />
                        <button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Mark read</button>
                      </form>
                    ) : null}
                    <form action={dismissNotification}>
                      <input type="hidden" name="id" value={notification.id} />
                      <button className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-white px-3 py-2 text-xs font-black text-red-600"><Trash2 className="h-4 w-4" /> Dismiss</button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </main>
  );
}
