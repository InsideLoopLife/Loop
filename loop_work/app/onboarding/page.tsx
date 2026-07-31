import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Home,
  LineChart,
  PiggyBank,
  ReceiptText,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding, skipOnboarding } from "./actions";

async function countRows(supabase: any, table: string, userId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count || 0;
}

async function safeRows(
  supabase: any,
  table: string,
  userId: string,
  options?: { columns?: string; limit?: number },
) {
  const { data, error } = await supabase
    .from(table)
    .select(options?.columns || "*")
    .eq("user_id", userId)
    .limit(options?.limit || 6);
  if (error) return [];
  return data || [];
}

async function maybeSingleProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

type SetupSubItem = {
  label: string;
  done: boolean;
  detail?: string;
  href?: string;
  optional?: boolean;
};

type SetupItem = {
  label: string;
  detail: string;
  href: string;
  done: boolean;
  icon: any;
  required: boolean;
  subItems: SetupSubItem[];
};

function anyRowHasValue(rows: any[], keys: string[]) {
  return rows.some((row) =>
    keys.some((key) => {
      const value = row?.[key];
      if (value === null || value === undefined || value === "") return false;
      if (typeof value === "number") return Number.isFinite(value) && value !== 0;
      return true;
    }),
  );
}

function itemProgress(item: SetupItem) {
  const done = item.subItems.filter((subItem) => subItem.done).length;
  return { done, total: item.subItems.length };
}

function SubChecklist({ subItems }: { subItems: SetupSubItem[] }) {
  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
      {subItems.map((subItem) => (
        <div key={subItem.label} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2">
          {subItem.done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-black ${subItem.done ? "text-slate-700" : "text-slate-950"}`}>
              {subItem.label}
              {subItem.optional ? <span className="ml-2 text-xs font-black uppercase tracking-wide text-slate-400">optional</span> : null}
            </p>
            {subItem.detail ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{subItem.detail}</p> : null}
          </div>
          {subItem.href && !subItem.done ? (
            <Link href={subItem.href} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-950 hover:text-white">
              Go
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SetupCard({ item }: { item: SetupItem }) {
  const Icon = item.icon;
  const progress = itemProgress(item);
  const stillToDo = progress.total - progress.done;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-950 text-white"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-black text-slate-950">
            {item.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
            {item.label}
          </span>
          <span className="mt-1 block text-sm font-semibold text-slate-500">{item.detail}</span>
          <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {item.required ? "Recommended first" : "Skippable"}
          </span>
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <details className="group min-w-0">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            {progress.done}/{progress.total} done
            <span className={stillToDo ? "text-amber-700" : "text-emerald-700"}>{stillToDo ? `${stillToDo} left` : "complete"}</span>
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <SubChecklist subItems={item.subItems} />
        </details>
        <Link href={item.href} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 md:justify-self-end">
          Open section <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    profile,
    payEvents,
    payEventRows,
    plannedItems,
    plannedItemRows,
    spendingCategories,
    investmentAccounts,
    investmentAccountRows,
    investmentHoldings,
    pensionAccounts,
    pensionAccountRows,
    pensionFunds,
    legacyMortgages,
    homes,
    homeRows,
    homeMortgageDeals,
    homeValuationSources,
    movingHomeSearches,
    households,
    people,
    integrations,
  ] = await Promise.all([
    maybeSingleProfile(supabase, user.id),
    countRows(supabase, "pay_events", user.id).catch(() => 0),
    safeRows(supabase, "pay_events", user.id, { limit: 5 }).catch(() => []),
    countRows(supabase, "planned_items", user.id).catch(() => 0),
    safeRows(supabase, "planned_items", user.id, { limit: 5 }).catch(() => []),
    countRows(supabase, "spending_categories", user.id).catch(() => 0),
    countRows(supabase, "investment_accounts", user.id).catch(() => 0),
    safeRows(supabase, "investment_accounts", user.id, { limit: 5 }).catch(() => []),
    countRows(supabase, "investment_holdings", user.id).catch(() => 0),
    countRows(supabase, "pension_accounts", user.id).catch(() => 0),
    safeRows(supabase, "pension_accounts", user.id, { limit: 5 }).catch(() => []),
    countRows(supabase, "pension_funds", user.id).catch(() => 0),
    countRows(supabase, "mortgage_profiles", user.id).catch(() => 0),
    countRows(supabase, "homes", user.id).catch(() => 0),
    safeRows(supabase, "homes", user.id, { limit: 5 }).catch(() => []),
    countRows(supabase, "home_mortgage_deals", user.id).catch(() => 0),
    countRows(supabase, "home_valuation_sources", user.id).catch(() => 0),
    countRows(supabase, "property_move_queries", user.id).catch(() => 0),
    Promise.resolve(supabase.from("app_household_members").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active").then((r: any) => r.count || 0)).catch(() => 0),
    countRows(supabase, "people", user.id).catch(() => 0),
    countRows(supabase, "integration_connections", user.id).catch(() => 0),
  ]);

  if (profile?.onboarding_completed_at || profile?.onboarding_skipped_at) redirect("/dashboard");

  const hasProfileName = Boolean(profile?.display_name || profile?.full_name);
  const hasProfilePhoto = Boolean(profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture);
  const hasPhone = Boolean(profile?.phone_number || profile?.phone);
  const hasTimezone = Boolean(profile?.timezone || profile?.default_timezone || profile?.locale);
  const hasSalaryBasis = anyRowHasValue(payEventRows as any[], ["gross_annual_salary", "monthly_take_home_override", "net_amount", "amount"]);
  const hasActiveIncome = (payEventRows as any[]).some((row) => !row.effective_until || new Date(row.effective_until) >= new Date());
  const hasBillsWithValue = anyRowHasValue(plannedItemRows as any[], ["monthly_cost", "amount"]);
  const hasInvestmentCashOrProvider = anyRowHasValue(investmentAccountRows as any[], ["cash_available", "provider_cash_available", "external_provider", "external_account_id"]);
  const hasPensionSettings = anyRowHasValue(pensionAccountRows as any[], ["contribution_frequency", "contribution_method", "monthly_contribution", "employee_contribution_percent", "employer_contribution_percent", "current_value"]);
  const hasHomeValue = anyRowHasValue(homeRows as any[], ["property_value", "purchase_price", "estimated_value_mid", "target_purchase_price"]);

  const items: SetupItem[] = [
    {
      label: "Complete your account",
      detail: "Name, photo, number, timezone and basic profile details first.",
      href: "/account",
      done: Boolean(user.email_confirmed_at) && hasProfileName,
      icon: UserRound,
      required: false,
      subItems: [
        { label: "Email verified", done: Boolean(user.email_confirmed_at), detail: user.email || "Confirm your sign-in email.", href: "/account?tab=security" },
        { label: "Name added", done: hasProfileName, detail: "Used for household, emails and profile cards.", href: "/account?tab=info" },
        { label: "Profile photo added", done: hasProfilePhoto, detail: "Makes household and account cards easier to scan.", href: "/account?tab=info", optional: true },
        { label: "Phone or contact detail added", done: hasPhone, detail: "Optional, but useful for richer account completeness.", href: "/account?tab=info", optional: true },
        { label: "Timezone / preferences set", done: hasTimezone, detail: "Helps reminders, dates and recurring jobs display correctly.", href: "/account?tab=info", optional: true },
      ],
    },
    {
      label: "Add a salary",
      detail: "Unlocks realistic income, affordability and monthly cashflow.",
      href: "/income",
      done: payEvents > 0,
      icon: WalletCards,
      required: true,
      subItems: [
        { label: "Income record added", done: payEvents > 0, detail: payEvents ? `${payEvents} income record${payEvents === 1 ? "" : "s"} found.` : "Add salary, pay or monthly take-home.", href: "/income" },
        { label: "Salary / take-home value stored", done: hasSalaryBasis, detail: "Needed for affordability and savings surplus logic.", href: "/income" },
        { label: "Active income period", done: hasActiveIncome, detail: "Effective dates let LOOP handle job changes, maternity and gaps.", href: "/income", optional: true },
      ],
    },
    {
      label: "Add your first bill/category",
      detail: "Start the spending calendar and renewal watch.",
      href: "/spending",
      done: plannedItems > 0,
      icon: ReceiptText,
      required: true,
      subItems: [
        { label: "First bill or planned cost added", done: plannedItems > 0, detail: plannedItems ? `${plannedItems} planned item${plannedItems === 1 ? "" : "s"} found.` : "Add mortgage, utilities, insurance or regular costs.", href: "/spending" },
        { label: "Bill amount / monthly cost captured", done: hasBillsWithValue, detail: "Powers monthly buffer and affordability calculations.", href: "/spending" },
        { label: "Spending category created", done: spendingCategories > 0, detail: "Categories help later charts and budget comparisons.", href: "/spending", optional: true },
      ],
    },
    {
      label: "Create or join a household",
      detail: "Optional for shared planning and child profiles.",
      href: "/account?tab=sharing",
      done: households > 0,
      icon: Home,
      required: false,
      subItems: [
        { label: "Household linked", done: households > 0, detail: households ? "You are attached to at least one active household." : "Create or accept a household invite.", href: "/account?tab=sharing" },
        { label: "People / family profiles added", done: people > 0, detail: "Useful for household budgets, child profiles and ownership allocation.", href: "/account?tab=sharing", optional: true },
        { label: "Permissions reviewed", done: households > 0, detail: "Review sharing rules before inviting others.", href: "/account?tab=sharing", optional: true },
      ],
    },
    {
      label: "Add an investment",
      detail: "Optional, but powers wealth trends and free-tier lookup.",
      href: "/investments",
      done: investmentAccounts > 0,
      icon: LineChart,
      required: false,
      subItems: [
        { label: "Investment pot added", done: investmentAccounts > 0, detail: investmentAccounts ? `${investmentAccounts} investment pot${investmentAccounts === 1 ? "" : "s"} found.` : "Create a manual pot or connect a broker.", href: "/investments" },
        { label: "Holdings or assets added", done: investmentHoldings > 0, detail: investmentHoldings ? `${investmentHoldings} holding${investmentHoldings === 1 ? "" : "s"} found.` : "Add stocks, funds, ETFs or imported positions.", href: "/investments" },
        { label: "Broker/cash details linked", done: hasInvestmentCashOrProvider || integrations > 0, detail: "Improves cash, ISA and provider refresh behaviour.", href: "/integrations", optional: true },
      ],
    },
    {
      label: "Add your pension",
      detail: "Optional. Helps long-term net worth and retirement view.",
      href: "/investments",
      done: pensionAccounts > 0,
      icon: PiggyBank,
      required: false,
      subItems: [
        { label: "Pension pot added", done: pensionAccounts > 0, detail: pensionAccounts ? `${pensionAccounts} pension pot${pensionAccounts === 1 ? "" : "s"} found.` : "Add workplace, private or defined benefit pension.", href: "/investments" },
        { label: "Funds / scheme rules added", done: pensionFunds > 0 || hasPensionSettings, detail: "Needed for provider value, fund mix or DB scheme logic.", href: "/investments" },
        { label: "Contribution settings reviewed", done: hasPensionSettings, detail: "Pay-in frequency and pause/end dates keep projections realistic.", href: "/investments", optional: true },
      ],
    },
    {
      label: "Add a house",
      detail: "Optional. Pulls property value/debt into long-term wealth and affordability.",
      href: "/mortgage",
      done: homes > 0 || legacyMortgages > 0,
      icon: Home,
      required: false,
      subItems: [
        { label: "Current home added", done: homes > 0 || legacyMortgages > 0, detail: homes ? `${homes} home record${homes === 1 ? "" : "s"} found.` : "Add current home or mortgage/rate record.", href: "/mortgage" },
        { label: "Home value / purchase price captured", done: hasHomeValue, detail: "Used for equity, LTV and moving-home comparisons.", href: "/mortgage" },
        { label: "Mortgage or rate attached", done: homeMortgageDeals > 0 || legacyMortgages > 0, detail: "Required for renewal watch and remortgage comparisons.", href: "/mortgage", optional: true },
        { label: "Valuation source added", done: homeValuationSources > 0, detail: "Helps LOOP avoid relying on one property value.", href: "/mortgage", optional: true },
        { label: "Moving-home search saved", done: movingHomeSearches > 0, detail: "Optional: compare listings without changing your current-home view.", href: "/mortgage?tab=moving", optional: true },
      ],
    },
  ];

  const requiredDone = items.filter((i) => i.required).every((i) => i.done);
  const doneCount = items.filter((i) => i.done).length;
  const subDoneCount = items.reduce((sum, item) => sum + itemProgress(item).done, 0);
  const subTotalCount = items.reduce((sum, item) => sum + itemProgress(item).total, 0);

  if (doneCount === items.length && subDoneCount === subTotalCount) {
    await supabase.from("app_user_profiles").upsert({
      user_id: user.id,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    redirect("/dashboard");
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 md:px-6">
        <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/25 blur-3xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">First run checklist</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Set up the bits that make LOOP useful.</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-white/70">You can skip optional sections and come back later. Expand any card to see exactly what LOOP has found and what still needs doing.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/80">
              <p>Progress</p>
              <p className="mt-1 text-3xl font-black text-white">{doneCount}/{items.length}</p>
              <p className="mt-1 text-xs font-black text-white/60">{subDoneCount}/{subTotalCount} checks</p>
            </div>
          </div>
        </section>

        <SectionCard title="Recommended setup order" description="Start with the personal account setup, then add only the financial sections that actually apply to you. Expand each section to see the smaller checks that are already complete.">
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <SetupCard key={item.label} item={item} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <form action={completeOnboarding}><button disabled={!requiredDone} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Finish setup</button></form>
            <form action={skipOnboarding}><button className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">Skip for now</button></form>
          </div>
        </SectionCard>
      </main>
    </>
  );
}
