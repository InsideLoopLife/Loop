import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle, ExternalLink, Home, Inbox, MailCheck, ShieldCheck, Sparkles } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";
import { completeFutureIntegrationTask, resetFutureIntegrationTask } from "./actions";

export const dynamic = "force-dynamic";

type Task = {
  id: string;
  product_key: string;
  task_key: string;
  title: string;
  description: string;
  section: string;
  priority: number;
  status: "todo" | "done" | "blocked" | "not_applicable";
  completed_at?: string | null;
};

const PRODUCT_META: Record<string, { title: string; subtitle: string; tier: string; icon: "inbox" | "home" | "shield" }> = {
  loop_inbox: {
    title: "LOOP Inbox / Email-to-LOOP",
    subtitle: "Postmark catch-all aliases, premium staged imports and security checks.",
    tier: "Premium",
    icon: "inbox",
  },
  mortgage_data: {
    title: "Mortgage data and renewal watch",
    subtitle: "Current-lender SVR/product-transfer rows, wider-market mortgage deals and user-facing comparisons.",
    tier: "Plus / Pro",
    icon: "shield",
  },
  valuation_automation: {
    title: "Property valuation automation",
    subtitle: "Land Registry comparables plus optional commercial AVM/provider integrations.",
    tier: "Higher licence if needed",
    icon: "home",
  },
};

async function safeSelect<T = any>(promise: PromiseLike<{ data: T | null; error?: any }>, fallback: T): Promise<T> {
  try {
    const result = await promise;
    return result.error ? fallback : (result.data || fallback);
  } catch {
    return fallback;
  }
}

function envStatus(name: string) {
  return process.env[name] ? "Set" : "Missing";
}

function statusClass(status: string) {
  return status === "Set" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100";
}

function productIcon(productKey: string) {
  const icon = PRODUCT_META[productKey]?.icon;
  if (icon === "home") return <Home className="h-7 w-7 text-orange-600" />;
  if (icon === "shield") return <ShieldCheck className="h-7 w-7 text-emerald-600" />;
  return <Inbox className="h-7 w-7 text-blue-600" />;
}

export default async function FutureIntegrationsPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/future-integrations")}`);
  if (!access.isAdmin) redirect("/admin");

  const supabase = createBestAdminClient() || await createClient();
  const productKeys = Object.keys(PRODUCT_META);
  const tasks = await safeSelect<Task[]>(
    supabase.from("app_future_integration_tasks").select("*").in("product_key", productKeys).order("priority", { ascending: true }),
    []
  );

  const todo = tasks.filter((task) => task.status === "todo");
  const done = tasks.filter((task) => task.status === "done");
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || "inbox.insideloop.life";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://YOUR_APP_DOMAIN";
  const webhookPath = `${appUrl.replace(/\/$/, "")}/api/inbound/email`;

  const todoByProduct = productKeys.map((productKey) => ({
    productKey,
    meta: PRODUCT_META[productKey],
    tasks: todo.filter((task) => task.product_key === productKey),
    done: done.filter((task) => task.product_key === productKey),
  }));

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <Sparkles className="h-4 w-4" /> Future integrations / products
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Launch checklist</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">
              Developer-centred setup board for premium LOOP products. Complete a task and it disappears from the active list; completed items stay in the audit section below.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/75">
            <p>Inbound provider <span className="text-white">Postmark</span></p>
            <p className="mt-1">Inbound domain <span className="text-white">{inboundDomain}</span></p>
            <p className="mt-1">Mortgage source mode <span className="text-white">staged data first</span></p>
          </div>
        </div>
      </section>

      <AdminTabs />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Open tasks" value={String(todo.length)} helper="visible checklist" />
        <StatCard title="Done" value={String(done.length)} helper="completed setup items" />
        <StatCard title="Mortgage source" value="Moneyfacts/API" helper="preferred source path" />
        <StatCard title="Valuation source" value="HMLR + AVM" helper="open data then premium" />
        <StatCard title="Import mode" value="Staged" helper="review before save" />
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        {todoByProduct.map(({ productKey, meta, tasks: openTasks, done: doneTasks }) => (
          <article key={productKey} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            {productIcon(productKey)}
            <h2 className="mt-3 text-xl font-black text-slate-950">{meta.title}</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{meta.subtitle}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Tier</p><p className="mt-1 text-sm font-black text-slate-950">{meta.tier}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Open</p><p className="mt-1 text-xl font-black text-slate-950">{openTasks.length}</p></div>
              <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-700">Done</p><p className="mt-1 text-xl font-black text-emerald-950">{doneTasks.length}</p></div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <SectionCard title="Product architecture" description="The setup is staged and auditable. User records should not be changed until a signed-in owner approves the result.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <MailCheck className="h-7 w-7 text-emerald-600" />
              <h3 className="mt-3 text-lg font-black text-slate-950">LOOP Inbox</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">Postmark posts parsed JSON to LOOP. The endpoint checks Basic Auth/secret, domain, alias, verified sender, premium tier, rate limits, duplicates and attachments.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <ShieldCheck className="h-7 w-7 text-orange-600" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Mortgage data</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">Use a licensed source where possible. Manual/admin rows are supported for beta, but every recommendation must keep lender, fee, LTV, source URL and checked date.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <Home className="h-7 w-7 text-blue-600" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Valuation automation</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">Start with HM Land Registry comparable sales. Add a commercial AVM/API later for postcode, EPC, council tax, floor area and confidence scoring.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <CheckCircle2 className="h-7 w-7 text-purple-600" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Check-off workflow</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">When you mark a task done, it disappears from the active list. Reset it from the completed audit if testing shows it needs more work.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Environment and webhook values" description="Use these when setting up Render and Postmark. Never paste real secrets into screenshots or support chats.">
          <div className="space-y-3">
            {["INBOUND_EMAIL_DOMAIN", "INBOUND_EMAIL_WEBHOOK_SECRET", "INBOUND_EMAIL_BASIC_USER", "INBOUND_EMAIL_BASIC_PASSWORD", "SUPABASE_SECRET_KEY", "MORTGAGE_DATA_API_KEY", "PROPERTY_DATA_API_KEY"].map((name) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <span className="text-sm font-black text-slate-800">{name}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(envStatus(name))}`}>{envStatus(name)}</span>
              </div>
            ))}
            <div className="rounded-3xl bg-slate-950 p-4 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Webhook URL</p>
              <p className="mt-2 break-all text-sm font-black">{webhookPath}</p>
              <p className="mt-2 text-xs font-semibold text-slate-400">In Postmark, use Basic Auth in the URL: https://USER:PASSWORD@domain/api/inbound/email</p>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Active setup checklist" description="Complete items as you do them. Completed items are removed from this active list so this page becomes a live launch checklist.">
        {todo.length ? (
          <div className="space-y-8">
            {todoByProduct.map(({ productKey, meta, tasks: openTasks }) => openTasks.length ? (
              <div key={productKey}>
                <h3 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{meta.title}</h3>
                <div className="grid gap-3 xl:grid-cols-2">
                  {openTasks.map((task) => (
                    <article key={task.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex gap-3">
                        <Circle className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase tracking-wide text-orange-600">{task.section}</p>
                          <p className="mt-1 text-base font-black text-slate-950">{task.title}</p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{task.description}</p>
                          <form action={completeFutureIntegrationTask} className="mt-4">
                            <input type="hidden" name="id" value={task.id} />
                            <button className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Mark done and remove</button>
                          </form>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null)}
          </div>
        ) : (
          <div className="rounded-3xl bg-emerald-50 p-6 text-sm font-black text-emerald-800">All future integration setup tasks are complete.</div>
        )}
      </SectionCard>

      <SectionCard title="Completed setup audit" description="These are hidden from the active list but kept here so you can reverse one if needed.">
        <div className="space-y-2">
          {done.length ? done.map((task) => (
            <div key={task.id} className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-black text-emerald-950">{task.title}</p>
                <p className="text-xs font-bold text-emerald-700">{PRODUCT_META[task.product_key]?.title || task.product_key} · completed {task.completed_at ? new Date(task.completed_at).toLocaleString("en-GB") : "recently"}</p>
              </div>
              <form action={resetFutureIntegrationTask}>
                <input type="hidden" name="id" value={task.id} />
                <button className="rounded-full bg-white px-4 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">Put back on list</button>
              </form>
            </div>
          )) : <p className="rounded-3xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No completed tasks yet.</p>}
        </div>
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-3">
        <Link href="/account/inbound-email" className="rounded-[2rem] border border-blue-100 bg-blue-50 p-6">
          <h2 className="text-xl font-black text-blue-950">User Email-to-LOOP page</h2>
          <p className="mt-1 text-sm font-bold text-blue-700">Test alias claiming and staged imports.</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white">Open <ExternalLink className="h-4 w-4" /></span>
        </Link>
        <Link href="/admin/wealth-watch" className="rounded-[2rem] border border-orange-100 bg-orange-50 p-6">
          <h2 className="text-xl font-black text-orange-950">Admin Wealth Watch</h2>
          <p className="mt-1 text-sm font-bold text-orange-700">Add mortgage rows, run watches and expire stale deals.</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-xs font-black text-white">Open <ExternalLink className="h-4 w-4" /></span>
        </Link>
        <Link href="/admin/property-sources" className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-6">
          <h2 className="text-xl font-black text-emerald-950">Admin Property Sources</h2>
          <p className="mt-1 text-sm font-bold text-emerald-700">Track valuation, EPC, council tax and geocoding sources.</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white">Open <ExternalLink className="h-4 w-4" /></span>
        </Link>
      </section>
    </main>
  );
}
