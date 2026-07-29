import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { BalanceHistoryChart } from "@/components/BalanceHistoryChart";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format/money";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { addFinancialAccount, deleteFinancialAccount, snapshotToday, updateFinancialAccount } from "./actions";

type FinancialAccount = {
  id: string;
  name: string;
  provider: string | null;
  account_type: string;
  current_balance: number;
  is_liability: boolean;
  last_synced_at: string | null;
};

type Snapshot = {
  snapshot_date: string;
  balance: number;
  financial_accounts: { is_liability: boolean } | null;
};

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select("id, name, provider, account_type, current_balance, is_liability, last_synced_at")
      .or(visibleDataOrFilter(householdContext))
      .order("created_at", { ascending: false })
      .returns<FinancialAccount[]>(),
    supabase
      .from("account_balance_snapshots")
      .select("snapshot_date, balance, financial_accounts(is_liability)")
      .or(visibleDataOrFilter(householdContext))
      .order("snapshot_date", { ascending: true })
      .returns<Snapshot[]>(),
  ]);

  const accountRows = accounts ?? [];
  const assets = accountRows.filter((account) => !account.is_liability).reduce((sum, account) => sum + Number(account.current_balance), 0);
  const liabilities = accountRows.filter((account) => account.is_liability).reduce((sum, account) => sum + Number(account.current_balance), 0);
  const netPosition = assets - liabilities;

  const chartByDate = new Map<string, number>();
  for (const snapshot of snapshots ?? []) {
    const direction = snapshot.financial_accounts?.is_liability ? -1 : 1;
    chartByDate.set(snapshot.snapshot_date, (chartByDate.get(snapshot.snapshot_date) ?? 0) + Number(snapshot.balance) * direction);
  }

  const chartData = Array.from(chartByDate.entries()).map(([date, balance]) => ({ date, balance }));

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Accounts & balances</h1>
          <p className="mt-1 text-slate-600">
            Add your bank, savings, pension, investment and debt balances manually for now. Later this page is where Open Banking/Open Finance feeds will land.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Assets" value={formatMoney(assets)} helper="Cash, savings, investments, pension, property" />
          <StatCard title="Liabilities" value={formatMoney(liabilities)} helper="Mortgage, loans, credit cards" />
          <StatCard title="Net position" value={formatMoney(netPosition)} helper="Assets minus liabilities" />
        </section>

        <SectionCard title="Balance history" description="This plots total tracked position over time. Click Snapshot today after updating balances.">
          <div className="mb-4">
            <form action={snapshotToday}>
              <SubmitButton>Snapshot today</SubmitButton>
            </form>
          </div>
          <BalanceHistoryChart data={chartData} />
        </SectionCard>

        <SectionCard title="Add account">
          <form action={addFinancialAccount} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <FormInput label="Account name" name="name" placeholder="Santander joint, pension, ISA, mortgage" required />
            <FormInput label="Provider" name="provider" placeholder="Santander, Nationwide, Vanguard" />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Type</span>
              <select name="account_type" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="current_account">Current account</option>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
                <option value="pension">Pension</option>
                <option value="property">Property</option>
                <option value="mortgage">Mortgage</option>
                <option value="credit_card">Credit card</option>
                <option value="loan">Loan</option>
                <option value="other">Other</option>
              </select>
            </label>
            <FormInput label="Current balance" name="current_balance" type="number" step="0.01" required />
            <div className="flex items-end"><SubmitButton>Add account</SubmitButton></div>
          </form>
        </SectionCard>

        <SectionCard title="Tracked accounts">
          <div className="grid gap-4 lg:grid-cols-2">
            {accountRows.map((account) => (
              <div key={account.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950">{account.name}</h3>
                    <p className="text-sm text-slate-500">
                      {[account.provider, account.account_type.replaceAll("_", " ")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <form action={deleteFinancialAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <button className="text-sm font-medium text-red-600">Delete</button>
                  </form>
                </div>
                <form action={updateFinancialAccount} className="mt-4 flex gap-3">
                  <input type="hidden" name="id" value={account.id} />
                  <input
                    name="current_balance"
                    type="number"
                    step="0.01"
                    defaultValue={account.current_balance}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
                  />
                  <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Update
                  </button>
                </form>
              </div>
            ))}
            {accountRows.length === 0 ? <p className="text-sm text-slate-500">No accounts yet.</p> : null}
          </div>
        </SectionCard>
      </main>
    </>
  );
}
