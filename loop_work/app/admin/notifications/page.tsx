import { createClient } from "@/lib/supabase/server";
import { runAdminChecks, updateAlertStatus } from "./actions";
import { AdminTabs } from "@/components/admin/AdminTabs";

const labels: Record<string, string> = {
  deals: "Deals",
  user_issues: "User issues",
  products: "Products",
  investment_manual: "Investment coverage",
  investment_snaptrade: "SnapTrade",
  system_continuity: "System continuity",
  uptime: "Uptime",
  households: "Households",
  auth: "Auth",
  cron: "Cron",
  security: "Security",
  assets: "Homes & cars",
  other: "Other",
};

function severityClass(severity: string) {
  if (severity === "critical") return "bg-rose-100 text-rose-900";
  if (severity === "high") return "bg-amber-100 text-amber-900";
  if (severity === "medium") return "bg-sky-100 text-sky-900";
  return "bg-slate-100 text-slate-700";
}

export default async function AdminNotificationsPage({ searchParams }: { searchParams?: Promise<{ area?: string }> }) {
  const params = await searchParams;
  const area = params?.area;
  const supabase = await createClient();

  const { data: summary } = await supabase.rpc("loop_admin_attention_summary");

  let query = supabase
    .from("loop_admin_alerts")
    .select("*")
    .in("status", ["open", "watching", "needs_admin_review", "in_progress"])
    .order("last_seen_at", { ascending: false })
    .limit(120);

  if (area) query = query.eq("area", area);

  const { data: alerts } = await query;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Notifications dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          One place for deals, user issues, product quality, investments, uptime and system continuity.
        </p>
        <form action={runAdminChecks} className="mt-4">
          <button className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950">Run checks now</button>
        </form>
      </section>

      <AdminTabs />

      <section className="grid gap-3 md:grid-cols-4">
        {(summary || []).map((item: any) => (
          <a key={item.area} href={`/admin/notifications?area=${item.area}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{labels[item.area] || item.area}</p>
            <p className="mt-1 text-3xl font-black">{item.open_count}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">High: {item.high_count} · Critical: {item.critical_count}</p>
          </a>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <a href="/admin/products/quality" className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 font-black text-emerald-950">Open product quality tiles</a>
        <a href="/admin/investment-coverage" className="rounded-3xl border border-sky-100 bg-sky-50 p-4 font-black text-sky-950">Open investment coverage</a>
        <a href="/admin/uptime" className="rounded-3xl border border-amber-100 bg-amber-50 p-4 font-black text-amber-950">Open uptime checker</a>
      </section>

      <section className="space-y-3">
        {(alerts || []).map((alert) => (
          <article key={alert.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{labels[alert.area] || alert.area}</p>
                <h2 className="mt-1 text-xl font-black">{alert.title}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{alert.summary || alert.detail}</p>
                {alert.detail ? <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{alert.detail}</p> : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${severityClass(alert.severity)}`}>{alert.severity}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {alert.action_url ? <a href={alert.action_url} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Open area</a> : null}
              <form action={updateAlertStatus} className="flex gap-2">
                <input type="hidden" name="alert_id" value={alert.id} />
                <select name="status" defaultValue={alert.status} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-black">
                  <option value="open">Open</option>
                  <option value="watching">Watching</option>
                  <option value="needs_admin_review">Needs admin review</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white">Save</button>
              </form>
            </div>
          </article>
        ))}

        {!alerts?.length ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center font-black text-slate-400">
            No open alerts in this area.
          </div>
        ) : null}
      </section>
    </main>
  );
}
