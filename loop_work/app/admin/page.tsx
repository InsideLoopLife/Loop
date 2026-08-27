import Link from "next/link";
import { ArrowRight, Bot, Boxes, CircleDollarSign, PlugZap, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { requireAdminAccess } from "@/lib/admin/access";
import { AdminTabs } from "@/components/admin/AdminTabs";

const jobs = [
  { title: "Plans & pricing", description: "Choose what Free, Extra, Plus and Pro include, set allowances and control upgrade behaviour.", href: "/admin/tiers", icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-800" },
  { title: "Features catalogue", description: "Understand every feature in plain English, see which plans include it and separate customer features from internal controls.", href: "/admin/features", icon: Boxes, tone: "bg-sky-50 text-sky-800" },
  { title: "User access", description: "Review customers, change plans, handle overrides and understand why someone can or cannot use a feature.", href: "/admin/users", icon: UsersRound, tone: "bg-violet-50 text-violet-800" },
  { title: "AI & usage", description: "Manage customer AI allowances, model routing and the guardrails that stop usage cleanly when a limit is reached.", href: "/admin/tiers", icon: Bot, tone: "bg-fuchsia-50 text-fuchsia-800" },
  { title: "Integrations", description: "Check connected-provider capability, broker imports and the health of external services.", href: "/admin/investments", icon: PlugZap, tone: "bg-orange-50 text-orange-800" },
  { title: "Product health", description: "Open operational, runtime and security checks when something is not behaving as expected.", href: "/admin/notifications", icon: ShieldCheck, tone: "bg-slate-100 text-slate-800" },
];

export default async function AdminPage() {
  await requireAdminAccess();

  return (
    <main className="mx-auto w-[95vw] max-w-[1800px] space-y-8 px-4 py-8 md:px-6">
      <section className="overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)] md:p-9">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white/75">
            <Sparkles className="h-4 w-4" />
            LOOP admin
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">What do you want to manage?</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/65 md:text-base">
            The old dashboard mixed system health, users, plans and product controls together. Admin now starts with the job you are trying to do.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => {
          const Icon = job.icon;
          return (
            <Link key={job.title} href={job.href} className="group rounded-[2rem] border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-950/5">
              <div className="flex items-start justify-between gap-5">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${job.tone}`}><Icon className="h-6 w-6" /></span>
                <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700" />
              </div>
              <h2 className="mt-5 text-xl font-black text-slate-950">{job.title}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{job.description}</p>
            </Link>
          );
        })}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-black text-slate-950">All admin areas</p>
        <p className="mt-1 text-xs font-bold text-slate-500">Use these cards when you need a more specialist part of LOOP.</p>
        <div className="mt-4"><AdminTabs /></div>
      </section>
    </main>
  );
}
