import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// When a section is switched off, ask one plain question instead of opening
// the settings page.
const SECTIONS: Record<string, { column: string; title: string; body: string; next: string }> = {
  mortgage: { column: "wealth_has_mortgage", title: "Track your home in LOOP?", body: "See your home's value, your mortgage, and when your deal ends — with a reminder before your rate changes.", next: "/mortgage" },
  pensions: { column: "wealth_has_pension", title: "Track your pensions in LOOP?", body: "See what your pensions are worth, what goes in each month and what they could be worth when you retire.", next: "/investments" },
  investments: { column: "wealth_has_investments", title: "Track your investments in LOOP?", body: "ISAs, shares and funds, with prices updated daily.", next: "/investments" },
  savings: { column: "wealth_has_savings", title: "Track your savings in LOOP?", body: "Balances, interest, pots for your goals, and a nudge when a better rate is out there.", next: "/accounts" },
  studentLoan: { column: "financial_flow_student_loan_enabled", title: "Track your student loan?", body: "See the balance and what comes off your pay each month.", next: "/income" },
  childcare: { column: "wealth_has_childcare_costs", title: "Track childcare costs?", body: "Nursery, childminders and clubs, with funded hours and Tax-Free Childcare worked out.", next: "/spending" },
  carFinance: { column: "wealth_has_car_finance", title: "Track car finance?", body: "Monthly payments and when the agreement ends.", next: "/spending" },
  debt: { column: "wealth_has_credit_cards_or_loans", title: "Track credit cards and loans?", body: "Balances and monthly payments in one place.", next: "/net-worth" },
};

async function switchOn(formData: FormData) {
  "use server";
  const key = String(formData.get("feature") || "");
  const section = SECTIONS[key];
  if (!section) redirect("/account?tab=wealth");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("app_user_profiles").upsert({ user_id: user.id, [section.column]: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/", "layout");
  redirect(section.next);
}

export default async function EnablePage({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  const section = SECTIONS[feature];
  if (!section) redirect("/account?tab=wealth");
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <section className="rounded-[18px] border border-[var(--line)] bg-white p-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink)]">{section.title}</h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">{section.body}</p>
        <form action={switchOn} className="mt-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="feature" value={feature} />
          <button className="rounded-full bg-[var(--pine)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--pine-strong)]">Yes, switch it on</button>
          <Link href="/dashboard" className="rounded-full px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]">Not now</Link>
        </form>
        <p className="mt-6 text-xs text-[var(--muted)]">You can switch sections on or off any time in Account → Wealth.</p>
      </section>
    </main>
  );
}
