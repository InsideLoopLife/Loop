import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { BatchProductImportClient } from "@/components/nutrition/BatchProductImportClient";

export default async function NutritionBatchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth batch checker</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Batch product, ingredient and menu import</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">Use this for large sources like drink brands, supermarket ranges or restaurants. LoopHealth checks saved/shared data first, then UK product sources and AI/web research where needed.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/nutrition/cards" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Card library</Link><Link href="/nutrition" className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20">Daily log</Link></div>
        </div>
      </section>
      <BatchProductImportClient />
    </main>
  </>;
}
