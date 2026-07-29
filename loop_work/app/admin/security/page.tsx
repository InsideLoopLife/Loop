import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { evaluateAdminHost } from "@/lib/admin/domain";
import { updateDeploymentCheck } from "./actions";
import { AdminTabs } from "@/components/admin/AdminTabs";

function EnvPill({ name }: { name: string }) {
  return <code className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{name}</code>;
}

export default async function AdminSecurityPage() {
  const h = await headers();
  const host = h.get("host") || "";
  const decision = evaluateAdminHost(host);
  const supabase = await createClient();

  const { data: checks } = await supabase
    .from("loop_admin_deployment_checks")
    .select("*")
    .order("sort_order", { ascending: true });

  const required = checks?.filter((check) => check.required_for_live) || [];
  const done = required.filter((check) => check.status === "done").length;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin security</p>
        <h1 className="mt-2 text-4xl font-black">Domain hardening and launch checklist</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          This page is deliberately embedded in admin so you do not need to find old notes. On localhost the guard stays relaxed; for live, enable the admin subdomain and host lock.
        </p>
      </section>

      <AdminTabs />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Current host</p>
          <h2 className="mt-1 text-2xl font-black">{decision.host || "unknown"}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">{decision.reason}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Live readiness</p>
          <h2 className="mt-1 text-2xl font-black">{done}/{required.length} required</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">Complete these before public beta/live.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Admin guard</p>
          <h2 className="mt-1 text-2xl font-black">{decision.enforceAdminHost ? "Enforced" : "Dev relaxed"}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">Use LOOP_ENFORCE_ADMIN_HOST=true when domains are live.</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-6">
        <h2 className="text-2xl font-black">Recommended live domain setup</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-4">
            <p className="text-sm font-black">User app</p>
            <code className="mt-2 block rounded-2xl bg-slate-950 p-3 text-white">app.insideloop.life or insideloop.life</code>
          </div>
          <div className="rounded-3xl bg-white p-4">
            <p className="text-sm font-black">Admin</p>
            <code className="mt-2 block rounded-2xl bg-slate-950 p-3 text-white">admin.insideloop.life</code>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">Environment variables</h2>
        <p className="mt-2 text-sm font-bold text-slate-500">Use these when you move from localhost to the real domains.</p>
        <pre className="mt-4 overflow-auto rounded-3xl bg-slate-950 p-5 text-sm text-white">{`NEXT_PUBLIC_SITE_URL=https://app.insideloop.life
NEXT_PUBLIC_ADMIN_URL=https://admin.insideloop.life
LOOP_PUBLIC_HOSTS=insideloop.life,app.insideloop.life
LOOP_ADMIN_HOSTS=admin.insideloop.life,localhost,127.0.0.1
LOOP_ALLOW_LOCAL_ADMIN=true
LOOP_ENFORCE_ADMIN_HOST=true
LOOP_ADMIN_ALLOWLIST=dan@insideloop.life
LOOP_CRON_SECRET=<long-random-secret>
LOOP_MONEY_DEAL_REFRESH_LIMIT=20
LOOP_MONEY_DEAL_REFRESH_DELAY_MS=750`}</pre>
      </section>

      <section className="space-y-3">
        {(checks || []).map((check) => (
          <article key={check.check_key} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{check.area}</p>
                <h3 className="mt-1 text-xl font-black">{check.title}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{check.description}</p>
              </div>
              <form action={updateDeploymentCheck} className="flex gap-2">
                <input type="hidden" name="check_key" value={check.check_key} />
                <select name="status" defaultValue={check.status} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-black">
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="not_applicable">N/A</option>
                </select>
                <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Save</button>
              </form>
            </div>
            <p className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{check.instructions}</p>
            {check.env_keys?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {check.env_keys.map((key: string) => <EnvPill key={key} name={key} />)}
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-amber-50 p-6">
        <h2 className="text-2xl font-black">Supabase setup notes</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm font-bold text-amber-950">
          <li>Go to Supabase Auth → URL Configuration.</li>
          <li>Set Site URL to the public app URL.</li>
          <li>Add redirect URLs for localhost, app.insideloop.life, admin.insideloop.life and any root domain you use.</li>
          <li>Keep service role key server-only. Never add it to NEXT_PUBLIC variables.</li>
          <li>Confirm admin users are set via allowlist/app metadata before public beta.</li>
        </ol>
      </section>
    </main>
  );
}
