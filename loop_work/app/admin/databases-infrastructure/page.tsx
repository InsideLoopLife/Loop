import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Database, ServerCog, ShieldAlert } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { RuntimeFixButton } from "@/components/admin/RuntimeFixButton";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { buildRuntimeReadiness } from "@/lib/platform/production-readiness";
import { getAdminModelSettings } from "@/lib/admin/runtime-suggestions";

function statusClass(status: string) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function safeCount(value: unknown) {
  return String(Number(value || 0));
}

export default async function AdminDatabasesInfrastructurePage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/databases-infrastructure")}`);

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-red-950">Admin access is not enabled</h1>
              <p className="mt-2 text-sm font-bold text-red-700">You are signed in as {access.user.email || "unknown email"}.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const supabase = createBestAdminClient() || await createClient();
  const readiness = buildRuntimeReadiness(process.env);
  const modelSettings = getAdminModelSettings(process.env);
  const { data: snapshot, error } = await supabase.rpc("loop_admin_dashboard_snapshot");
  const counts = snapshot?.counts || {};
  const database = snapshot?.database || {};
  const passing = readiness.filter((item) => item.status === "pass").length;

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <ServerCog className="h-4 w-4" /> Admin databases / infrastructure
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Database and infrastructure health</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">This keeps database object checks, environment readiness and AI model config separate from the user-facing tabs.</p>
          </div>
          <Link href="/admin" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Back to admin</Link>
        </div>
      </section>

      <AdminTabs />

      {error ? <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">{error.message}</section> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Auth users" value={safeCount(counts.auth_users)} helper="from admin snapshot" />
        <StatCard title="Profiles" value={safeCount(counts.linked_profiles)} helper="linked app profiles" />
        <StatCard title="Products" value={safeCount(counts.products)} helper="nutrition/product DB" />
        <StatCard title="Open alerts" value={safeCount(counts.open_alerts)} helper="admin notifications" />
        <StatCard title="Runtime checks" value={`${passing}/${readiness.length}`} helper="env/config readiness" />
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Database objects" description="These are the database/RPC flags returned by the live dashboard snapshot.">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(database).map(([key, ok]) => (
              <article key={key} className={`rounded-3xl border p-4 ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <div className="flex items-start gap-3"><Database className="h-5 w-5" /><div><p className="font-black">{key}</p><p className="mt-1 text-sm font-bold opacity-85">{ok ? "available" : "missing / needs migration"}</p></div></div>
              </article>
            ))}
            {!Object.keys(database).length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500 sm:col-span-2">No database snapshot was returned. Check the `loop_admin_dashboard_snapshot` RPC.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Environment and infrastructure" description="Runtime settings that affect auth, cron, alerts, email and AI-backed admin help.">
          <div className="grid gap-3">
            {readiness.map((item) => (
              <article key={item.key} className={`rounded-3xl border p-4 ${statusClass(item.status)}`}>
                <div className="flex items-start gap-3"><Activity className="h-5 w-5" /><div className="min-w-0 flex-1"><p className="font-black">{item.title}</p><p className="mt-1 text-sm font-bold opacity-85">{item.detail}</p>{item.action ? <p className="mt-2 text-xs font-black opacity-80">Action: {item.action}</p> : null}</div>{item.status !== "pass" ? <RuntimeFixButton title={item.title} status={item.status} detail={item.detail} action={item.action} /> : null}</div>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="AI model lanes" description="Admin runtime suggestions now have their own model lane, without changing nutrition/product import models.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Runtime issues</p><p className="mt-1 font-black text-slate-950">{modelSettings.runtimeIssueModel}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Help</p><p className="mt-1 font-black text-slate-950">{modelSettings.helpModel}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Research</p><p className="mt-1 font-black text-slate-950">{modelSettings.researchModel}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Vision</p><p className="mt-1 font-black text-slate-950">{modelSettings.visionModel}</p></div>
          <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">OpenAI key</p><p className="mt-1 font-black text-slate-950">{modelSettings.hasOpenAiKey ? "configured" : "missing"}</p></div>
        </div>
      </SectionCard>
    </main>
  );
}
