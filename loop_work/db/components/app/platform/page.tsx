import { redirect } from "next/navigation";
import { ShieldCheck, Database, Download, FileClock, LockKeyhole, ServerCog, UsersRound } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { addPlatformNote, initialisePlatformHousehold, markPlatformNoteDone, requestDataExport } from "./actions";
import { buildRuntimeReadiness, platformModelItems, type ReadinessStatus } from "@/lib/platform/production-readiness";

function statusClasses(status: ReadinessStatus) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function prettyDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function safeCount(supabase: Awaited<ReturnType<typeof createClient>>, table: string, userId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return null;
  return count || 0;
}

export default async function PlatformPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const readiness = buildRuntimeReadiness(process.env);

  const { data: householdMembership, error: membershipError } = await supabase
    .from("app_household_members")
    .select("household_id, role, app_households(name, timezone, currency, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { data: auditLogs } = membershipError
    ? { data: [] }
    : await supabase
        .from("app_audit_log")
        .select("id, table_name, record_id, action, changed_columns, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

  const { data: exportJobs } = membershipError
    ? { data: [] }
    : await supabase
        .from("app_export_jobs")
        .select("id, export_type, status, requested_at, completed_at, expires_at")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(6);

  const { data: notes } = membershipError
    ? { data: [] }
    : await supabase
        .from("app_platform_notes")
        .select("id, title, body, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);

  const [bankRows, plannedRows, pensionRows, investmentRows, mortgageRows] = await Promise.all([
    safeCount(supabase, "bank_transactions", user.id),
    safeCount(supabase, "planned_items", user.id),
    safeCount(supabase, "pension_funds", user.id),
    safeCount(supabase, "investment_holdings", user.id),
    safeCount(supabase, "mortgages", user.id),
  ]);

  const platformReady = !membershipError;
  const household = Array.isArray(householdMembership?.app_households)
    ? householdMembership?.app_households[0]
    : householdMembership?.app_households;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-8 p-4 pb-16 md:p-6">
        <section className="relative overflow-hidden rounded-[2.4rem] bg-slate-950 p-7 text-white shadow-[0_32px_100px_-54px_rgba(6,18,37,.95)] md:p-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-orange-500/25 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.4fr_.8fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
                <ShieldCheck className="h-4 w-4" /> Platform hardening
              </div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">Privacy, scale and production readiness</h1>
              <p className="mt-4 max-w-3xl text-base font-medium text-slate-300 md:text-lg">
                This page turns the prototype into a more scalable private platform: household tenancy, audit logging, data export jobs, formal migrations and deployment checks.
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
              <p className="text-sm font-bold text-slate-300">Current household layer</p>
              <p className="mt-2 text-3xl font-black tracking-tight">{household?.name || "Not initialised"}</p>
              <p className="mt-2 text-sm text-slate-300">
                {platformReady
                  ? householdMembership?.household_id
                    ? `${household?.currency || "GBP"} · ${household?.timezone || "Europe/London"} · ${householdMembership.role}`
                    : "Run the setup action below to attach this account to a household."
                  : "Run db/v21_platform_schema.sql first."}
              </p>
            </div>
          </div>
        </section>

        {!platformReady ? (
          <section className="rounded-[2rem] border border-red-200 bg-red-50 p-5 text-red-800">
            <h2 className="text-lg font-black">Platform schema not installed yet</h2>
            <p className="mt-2 text-sm font-semibold">
              Run <code className="rounded bg-white px-2 py-1">db/v21_platform_schema.sql</code> in Supabase SQL Editor, then refresh this page.
            </p>
            <p className="mt-2 text-xs font-medium">Supabase error: {membershipError?.message}</p>
          </section>
        ) : null}

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard title="Bank rows" value={bankRows === null ? "—" : String(bankRows)} helper="Imported transactions" />
          <StatCard title="Planned items" value={plannedRows === null ? "—" : String(plannedRows)} helper="Recurring income/costs" />
          <StatCard title="Pension funds" value={pensionRows === null ? "—" : String(pensionRows)} helper="Tracked fund pots" />
          <StatCard title="Investments" value={investmentRows === null ? "—" : String(investmentRows)} helper="Holdings tracked" />
          <StatCard title="Mortgages" value={mortgageRows === null ? "—" : String(mortgageRows)} helper="Deals/balances" />
        </div>

        <SectionCard title="First-time platform setup" description="Run this once after the V21 migration. It creates the default household record that future shared access and exports will use.">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5">
              <p className="text-sm font-black text-slate-950">Default household</p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Existing data remains available through the current user-owned tables. The household layer is a forward-compatible wrapper for adding Bethany/shared access later without weakening privacy controls.
              </p>
            </div>
            <form action={initialisePlatformHousehold}>
              <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/20">
                Initialise household
              </button>
            </form>
          </div>
        </SectionCard>

        <SectionCard title="Runtime readiness" description="These checks are based on environment variables and deployment settings we can safely inspect from the server.">
          <div className="grid gap-3 lg:grid-cols-2">
            {readiness.map((item) => (
              <article key={item.key} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-black text-slate-950">{item.title}</h3>
                    <p className="mt-1 text-sm font-medium text-slate-600">{item.detail}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClasses(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                {item.action ? <p className="mt-3 text-xs font-bold text-slate-500">{item.action}</p> : null}
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Core data model" description="The refactor now targets a clearer scalable shape instead of lots of disconnected pages.">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {platformModelItems.map((item) => (
              <article key={item.title} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
                  {item.title.includes("Household") ? <UsersRound className="h-5 w-5" /> : item.title.includes("audit") ? <FileClock className="h-5 w-5" /> : item.title.includes("Export") ? <Download className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                </div>
                <h3 className="font-black text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm font-medium text-slate-600">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
          <SectionCard title="Audit trail" description="Raw financial values are not copied into this log. It stores table, record id, action, changed columns and row hashes.">
            <div className="space-y-3">
              {(auditLogs || []).length === 0 ? (
                <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-500">
                  No audited changes yet. After running the V21 schema, edits to sensitive tables will begin appearing here.
                </p>
              ) : (
                (auditLogs || []).map((log: any) => (
                  <div key={log.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">{log.action} · {log.table_name}</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">{prettyDate(log.created_at)} · {log.record_id || "record"}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                        {(log.changed_columns || []).slice(0, 4).join(", ") || "tracked"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Exports and data rights" description="This creates export-job requests now; a background worker can be attached before hosting production data.">
            <form action={requestDataExport} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
              <label className="text-sm font-black text-slate-700">Request export</label>
              <div className="mt-3 flex gap-2">
                <select name="export_type" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                  <option value="full_json">Full JSON export</option>
                  <option value="financial_csv">Financial CSV export</option>
                  <option value="audit_csv">Audit CSV export</option>
                </select>
                <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Request</button>
              </div>
            </form>
            <div className="mt-4 space-y-3">
              {(exportJobs || []).length === 0 ? (
                <p className="text-sm font-medium text-slate-500">No export requests yet.</p>
              ) : (
                (exportJobs || []).map((job: any) => (
                  <div key={job.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">{job.export_type.replaceAll("_", " ")}</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">Requested {prettyDate(job.requested_at)}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{job.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Platform notes" description="Use this to track hardening tasks before staging/production, without mixing them into feature pages.">
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <form action={addPlatformNote} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
              <label className="block text-sm font-black text-slate-700">Task title</label>
              <input name="title" placeholder="e.g. Disable public Supabase sign-ups" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <label className="mt-4 block text-sm font-black text-slate-700">Notes</label>
              <textarea name="body" rows={4} placeholder="Why this matters / what to check" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button className="mt-4 rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white">Add note</button>
            </form>
            <div className="space-y-3">
              {(notes || []).length === 0 ? (
                <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-500">No platform notes yet.</p>
              ) : (
                (notes || []).map((note: any) => (
                  <article key={note.id} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-slate-950">{note.title}</p>
                        {note.body ? <p className="mt-1 text-sm font-medium text-slate-600">{note.body}</p> : null}
                        <p className="mt-2 text-xs font-medium text-slate-400">{prettyDate(note.created_at)}</p>
                      </div>
                      {note.status === "done" ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Done</span>
                      ) : (
                        <form action={markPlatformNoteDone}>
                          <input type="hidden" name="id" value={note.id} />
                          <button className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-200">Mark done</button>
                        </form>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Next infrastructure steps" description="The app is still private-prototype friendly, but the structure now points towards staging and production.">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["1", "Create staging", "Separate Supabase project and hosted preview environment with fake data only."],
              ["2", "Move migrations", "Adopt Supabase CLI migrations from the supabase/migrations folder."],
              ["3", "Add workers", "Attach background jobs for exports, assumptions checks and future market/banking refreshes."],
            ].map(([step, title, body]) => (
              <div key={step} className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">{step}</span>
                <h3 className="mt-4 font-black text-slate-950">{title}</h3>
                <p className="mt-2 text-sm font-medium text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </main>
    </>
  );
}
