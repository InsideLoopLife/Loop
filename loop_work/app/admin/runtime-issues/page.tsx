import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Bot, ShieldAlert } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { RuntimeFixButton } from "@/components/admin/RuntimeFixButton";
import { SectionCard } from "@/components/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { buildRuntimeReadiness } from "@/lib/platform/production-readiness";
import { getAdminModelSettings, suggestionForRuntimeIssue } from "@/lib/admin/runtime-suggestions";

function severityClass(severity: string | null | undefined) {
  if (severity === "critical") return "bg-rose-100 text-rose-900";
  if (severity === "high") return "bg-amber-100 text-amber-900";
  if (severity === "medium") return "bg-sky-100 text-sky-900";
  return "bg-slate-100 text-slate-700";
}

function runtimeStatusClass(status: string) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export default async function AdminRuntimeIssuesPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/runtime-issues")}`);

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span><div><h1 className="text-2xl font-black text-red-950">Admin access is not enabled</h1><p className="mt-2 text-sm font-bold text-red-700">You are signed in as {access.user.email || "unknown email"}.</p></div></div>
        </section>
      </main>
    );
  }

  const supabase = createBestAdminClient() || await createClient();
  const readiness = buildRuntimeReadiness(process.env);
  const models = getAdminModelSettings(process.env);
  const [{ data: alerts }, { data: targets }] = await Promise.all([
    supabase.from("loop_admin_alerts").select("*").in("status", ["open", "watching", "needs_admin_review", "in_progress"]).order("last_seen_at", { ascending: false }).limit(80),
    supabase.from("loop_uptime_targets").select("*").order("created_at", { ascending: false }).limit(80),
  ]);
  const failingChecks = readiness.filter((item) => item.status !== "pass");

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80"><Bot className="h-4 w-4" /> Admin runtime issues</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Runtime issues with suggested fixes</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">Issues are grouped away from notifications so AI/model-assisted diagnosis can evolve without touching the main admin dashboard.</p>
          </div>
          <Link href="/admin/uptime" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Open uptime targets</Link>
        </div>
      </section>

      <AdminTabs />

      <SectionCard title="AI runtime model" description="Use LOOP_RUNTIME_ISSUE_AI_MODEL to override the model for this page only.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Runtime model</p><p className="mt-1 text-lg font-black text-slate-950">{models.runtimeIssueModel}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">OpenAI key</p><p className="mt-1 text-lg font-black text-slate-950">{models.hasOpenAiKey ? "configured" : "missing"}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Fallback</p><p className="mt-1 text-lg font-black text-slate-950">{models.helpModel}</p></div>
        </div>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <SectionCard title="Open runtime/admin alerts" description="Each alert includes a deterministic suggestion now; this can later call the runtime AI model for deeper diagnosis.">
          <div className="space-y-3">
            {(alerts || []).map((alert: any) => (
              <article key={alert.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{alert.area || "runtime"}</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{alert.title}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">{alert.summary || alert.detail}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${severityClass(alert.severity)}`}>{alert.severity || "low"}</span>
                </div>
                <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50 p-4 text-sm font-bold text-sky-950">
                  <p className="mb-1 flex items-center gap-2 font-black"><Bot className="h-4 w-4" /> Suggested check</p>
                  <p>{suggestionForRuntimeIssue(alert)}</p>
                </div>
                {alert.action_url ? <Link href={alert.action_url} className="mt-4 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Open affected area</Link> : null}
              </article>
            ))}
            {!alerts?.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-500">No open runtime alerts found.</p> : null}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Config warnings" description="Non-passing runtime readiness checks.">
            <div className="space-y-3">
              {failingChecks.map((item) => (
                <article key={item.key} className={`rounded-3xl border p-4 ${runtimeStatusClass(item.status)}`}>
                  <div className="flex items-start gap-3"><AlertTriangle className="h-5 w-5" /><div className="min-w-0 flex-1"><p className="font-black">{item.title}</p><p className="mt-1 text-sm font-bold opacity-85">{item.detail}</p>{item.action ? <p className="mt-2 text-xs font-black opacity-80">Action: {item.action}</p> : null}</div><RuntimeFixButton title={item.title} status={item.status} detail={item.detail} action={item.action} /></div>
                </article>
              ))}
              {!failingChecks.length ? <p className="rounded-3xl bg-emerald-50 p-4 text-sm font-black text-emerald-900">All runtime readiness checks are passing.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Uptime targets" description="Existing uptime checker targets stay available here without removing the /admin/uptime route.">
            <div className="space-y-3">
              {(targets || []).slice(0, 8).map((target: any) => (
                <article key={target.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">{target.area}</p><p className="font-black text-slate-950">{target.target_name}</p><p className="text-xs font-bold text-slate-500">{target.target_url}</p></div><div className="text-right"><p className="font-black text-slate-950">{target.last_status || "not checked"}</p><p className="text-xs text-slate-500">{target.last_latency_ms ? `${target.last_latency_ms}ms` : ""}</p></div></div>
                </article>
              ))}
              {!targets?.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No uptime targets configured.</p> : null}
            </div>
          </SectionCard>
        </div>
      </section>
    </main>
  );
}
