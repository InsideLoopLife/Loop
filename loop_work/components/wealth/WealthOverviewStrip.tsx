import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buildWealthSummary } from "@/lib/wealth/summary";
import { formatMoney } from "@/lib/format/money";

function Tile({ href, title, value, helper }: { href: string; title: string; value: string; helper: string }) {
  return (
    <Link href={href} className="rounded-[1.5rem] bg-slate-50 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
      <span className="block text-xs font-black uppercase tracking-wide text-slate-400">{title}</span>
      <span className="mt-1 block text-xl font-black text-slate-950">{value}</span>
      <span className="mt-1 block text-xs font-bold text-slate-500">{helper}</span>
    </Link>
  );
}

export async function WealthOverviewStrip() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const summary = await buildWealthSummary(supabase, user.id);
  return (
    <section className="mx-auto mt-4 w-[95vw] max-w-none px-4 sm:px-6 lg:px-8">
      <div className="grid gap-2 rounded-[2rem] border border-white/70 bg-white/85 p-2 shadow-xl md:grid-cols-2 xl:grid-cols-5">
        <Tile href="/dashboard" title="This month" value={formatMoney(summary.flow)} helper={`${formatMoney(summary.income)} in · ${formatMoney(summary.outgoings)} out`} />
        <Tile href="/accounts" title="Accounts" value={formatMoney(summary.assets - summary.propertyAssets - summary.pensionValue - summary.investmentValue)} helper={`${summary.manualAccounts} manual account row(s)`} />
        <Tile href="/net-worth" title="Net worth" value={formatMoney(summary.netWorth)} helper={`${formatMoney(summary.assets)} assets · ${formatMoney(summary.liabilities)} debts`} />
        <Tile href="/mortgage" title="Property / mortgage" value={formatMoney(summary.propertyAssets - summary.mortgageDebt)} helper={`${formatMoney(summary.propertyAssets)} property · ${formatMoney(summary.mortgageDebt)} debt`} />
        <Tile href="/investments" title="Investments + pension" value={formatMoney(summary.investmentValue + summary.pensionValue)} helper={`${formatMoney(summary.pensionValue)} pension · ${formatMoney(summary.investmentValue)} investments`} />
      </div>
    </section>
  );
}
