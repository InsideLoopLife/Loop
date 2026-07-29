import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { getAdminAccess } from "@/lib/admin/access";

export default async function Page() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/financial-flow")}`);
  if (!access.isAdmin) redirect("/admin");
  return (
    <main className="mx-auto max-w-[2000px] space-y-6 px-4 py-8 md:px-6">
      <AdminTabs />
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Financial Flow admin</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/70">Income, savings transfers and spending planner controls grouped together.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <a href="/income" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Income</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Salary, maternity, dividends and other income setup.</p>
        </a>
        <a href="/spending" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Spending planner</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Bills, subscriptions, quick categorise and renewal drop-off logic.</p>
        </a>
        <a href="/accounts" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Savings transfers</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Savings top-ups that should appear as blue financial-flow transfers.</p>
        </a>
        <a href="/admin/savings" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Savings admin</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Source/watch jobs for savings recommendations.</p>
        </a>
      </section>
    </main>
  );
}
