import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { HelpAskClient } from "@/components/help/HelpAskClient";

const helpCards = [
  { q: "How do I import a recipe?", a: "Go to LoopHealth → Add recipe → Import recipe. Paste a URL or image URL. The app reads page evidence, uses the saved OpenAI token when available, then lets you accept/edit ingredients before saving." },
  { q: "Why is a food automatically saved?", a: "Quick searched or URL-imported foods are saved as reusable meal cards so next time they appear with a star and can be logged faster." },
  { q: "How do I compare nutrients?", a: "Open LoopHealth and click the daily score or ‘Examine all nutrients’. You’ll see macros, minerals and vitamins compared against current default adult targets." },
  { q: "Where are Apple Health settings?", a: "LoopHealth → Health settings. Native Apple Health sync is a future app setting and will be used for BMR, activity and exercise-aware calorie guidance." },
];

export default async function HelpPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Account help</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">Ask how Loop works</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">Ask plain-English questions about how to use Loop. When your saved OpenAI token is available, it answers from the feature documentation; otherwise it falls back to built-in help.</p>
        <HelpAskClient />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {helpCards.map((card) => <article key={card.q} className="rounded-[2rem] bg-white p-5 shadow-lg"><h2 className="text-lg font-black text-slate-950">{card.q}</h2><p className="mt-2 text-sm font-semibold text-slate-600">{card.a}</p></article>)}
      </section>
    </main>
  </>;
}
