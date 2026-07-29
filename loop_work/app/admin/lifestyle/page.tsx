import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { getAdminAccess } from "@/lib/admin/access";

export default async function Page() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/lifestyle")}`);
  if (!access.isAdmin) redirect("/admin");
  return (
    <main className="mx-auto max-w-[2000px] space-y-6 px-4 py-8 md:px-6">
      <AdminTabs />
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Lifestyle admin</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/70">Lifestyle/routine modules and future product setup.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <a href="/lifestyle" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Lifestyle dashboard</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">User-facing lifestyle area.</p>
        </a>
        <a href="/admin/future-integrations" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Future integrations</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Lifestyle and premium setup checklist.</p>
        </a>
        <a href="/admin/notifications" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Notifications</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Nudges and reminders that support lifestyle workflows.</p>
        </a>
      </section>
    </main>
  );
}
