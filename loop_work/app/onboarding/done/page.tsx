import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SETUP_EXTRAS } from "@/lib/onboarding/setup-options";

export const metadata = { title: "You're set up" };

export default async function OnboardingDonePage({ searchParams }: { searchParams: Promise<{ next?: string; problems?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { next, problems } = await searchParams;
  const chosen = new Set(String(next || "").split(",").filter(Boolean));
  const nextSteps = SETUP_EXTRAS.filter((extra) => chosen.has(extra.key));
  const failed = String(problems || "").split("|").filter(Boolean);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10 md:py-16">
      <div className="mx-auto max-w-xl">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,.5)] md:p-10">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">You're set up</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">LOOP has your basics and is already working out your monthly picture.</p>

          {failed.length ? (
            <div className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-bold text-amber-900">
              We couldn't save {failed.join(", ")}. You can add {failed.length === 1 ? "it" : "them"} from the menu — nothing else was affected.
            </div>
          ) : null}

          <Link href="/dashboard" className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800">
            Go to my home <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {nextSteps.length ? (
          <section className="mt-6 space-y-3">
            <h2 className="px-1 text-sm font-black uppercase tracking-[0.18em] text-slate-500">Next, when you're ready</h2>
            {nextSteps.map((step) => (
              <Link key={step.key} href={step.href} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 transition hover:border-slate-950">
                <span>
                  <span className="block text-sm font-black text-slate-900">Add {step.label.charAt(0).toLowerCase()}{step.label.slice(1)}</span>
                  <span className="block text-xs font-semibold text-slate-500">{step.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
