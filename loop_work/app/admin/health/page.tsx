import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { getAdminAccess } from "@/lib/admin/access";

export default async function Page() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/health")}`);
  if (!access.isAdmin) redirect("/admin");
  return (
    <main className="mx-auto max-w-[2000px] space-y-6 px-4 py-8 md:px-6">
      <AdminTabs />
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Health admin</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/70">Nutrition, product data and health modules grouped together.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <a href="/admin/products/quality" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Nutrition products</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Product, ingredients and meal-card data quality.</p>
        </a>
        <a href="/nutrition" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Nutrition overview</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">User-facing health dashboard.</p>
        </a>
        <a href="/nutrition/food-log" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Food log</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Meal timeline and household logging.</p>
        </a>
        <a href="/nutrition/recipes" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <h2 className="text-2xl font-black text-slate-950">Recipes</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Recipe and cooking method logic.</p>
        </a>
      </section>
    </main>
  );
}
