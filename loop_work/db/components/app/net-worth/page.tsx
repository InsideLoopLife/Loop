import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { calculateProjectedMortgageBalance } from "@/lib/calculations/mortgage";
import { NetWorthClient } from "@/components/net-worth/NetWorthClient";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

type Asset = { id: string; person_id: string | null; name: string; value: number; type: string; source_type?: string | null };
type Liability = { id: string; person_id: string | null; name: string; balance: number; type: string; source_type?: string | null };
type Person = { id: string; name: string; relationship: string };
type Home = { id: string; label: string; property_value: number; estimated_value_low: number | null; estimated_value_mid: number | null; estimated_value_high: number | null };
type Owner = { home_id: string; person_id: string };
type Valuation = { home_id: string; valuation_mid: number | null; valuation_amount: number | null; confidence: string | null };
type Deal = { id: string; home_id: string | null; lender: string | null; balance: number; balance_as_of_date: string | null; interest_rate: number; term_years: number; monthly_payment_override: number | null; repayment_type: string | null; start_date: string };
type PensionAccount = { id: string; person_id: string | null; label: string; provider: string; current_value: number };
type PensionFund = { pension_account_id: string; current_value: number; units: number | null; unit_price: number | null };
type InvestmentAccount = { id: string; person_id: string | null; label: string; provider: string; account_type: string };
type InvestmentHolding = { investment_account_id: string; asset_name: string; units: number; latest_price: number };

function valuationForHome(home: Home, valuations: Valuation[]) {
  if (Number(home.estimated_value_mid ?? 0) > 0) return Number(home.estimated_value_mid);
  if (Number(home.property_value ?? 0) > 0) return Number(home.property_value);
  const values = valuations.filter((v) => v.home_id === home.id).map((v) => Number(v.valuation_mid ?? v.valuation_amount ?? 0)).filter(Boolean);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function projectedBalance(deal: Deal) {
  return calculateProjectedMortgageBalance({
    openingBalance: Number(deal.balance),
    annualInterestRate: Number(deal.interest_rate),
    termYears: Number(deal.term_years),
    balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
    monthlyPayment: deal.monthly_payment_override,
    repaymentType: deal.repayment_type ?? "repayment",
  }).projectedBalance;
}

export default async function NetWorthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [{ data: manualAssets }, { data: manualLiabilities }, { data: people }, { data: homes }, { data: owners }, { data: valuations }, { data: deals }, { data: pensionAccounts }, { data: pensionFunds }, { data: investmentAccounts }, { data: investmentHoldings }] = await Promise.all([
    supabase.from("assets").select("id, person_id, name, value, type, source_type").or(visibleDataOrFilter(householdContext)).order("created_at", { ascending: false }).returns<Asset[]>(),
    supabase.from("liabilities").select("id, person_id, name, balance, type, source_type").or(visibleDataOrFilter(householdContext)).order("created_at", { ascending: false }).returns<Liability[]>(),
    supabase.from("people").select("id, name, relationship").or(visibleDataOrFilter(householdContext)).or("account_status.is.null,account_status.neq.duplicate_merged").order("relationship").returns<Person[]>(),
    supabase.from("homes").select("id, label, property_value, estimated_value_low, estimated_value_mid, estimated_value_high").or(visibleDataOrFilter(householdContext)).returns<Home[]>(),
    supabase.from("home_owners").select("home_id, person_id").or(visibleDataOrFilter(householdContext)).returns<Owner[]>(),
    supabase.from("home_valuation_sources").select("home_id, valuation_mid, valuation_amount, confidence").or(visibleDataOrFilter(householdContext)).returns<Valuation[]>(),
    supabase.from("home_mortgage_deals").select("id, home_id, lender, balance, balance_as_of_date, interest_rate, term_years, monthly_payment_override, repayment_type, start_date").or(visibleDataOrFilter(householdContext)).returns<Deal[]>(),
    supabase.from("pension_accounts").select("id, person_id, label, provider, current_value").or(visibleDataOrFilter(householdContext)).returns<PensionAccount[]>(),
    supabase.from("pension_funds").select("pension_account_id, current_value, units, unit_price").or(visibleDataOrFilter(householdContext)).returns<PensionFund[]>(),
    supabase.from("investment_accounts").select("id, person_id, label, provider, account_type").or(visibleDataOrFilter(householdContext)).returns<InvestmentAccount[]>(),
    supabase.from("investment_holdings").select("investment_account_id, asset_name, units, latest_price").or(visibleDataOrFilter(householdContext)).returns<InvestmentHolding[]>(),
  ]);

  const autoAssets: Asset[] = (homes ?? []).flatMap<Asset>((home) => {
    const value = valuationForHome(home, valuations ?? []);
    const ownerRows = (owners ?? []).filter((owner) => owner.home_id === home.id);
    if (ownerRows.length === 0) return [{ id: `home-${home.id}`, person_id: null, name: `${home.label} property value`, value, type: "property", source_type: "property" }];
    return ownerRows.map((owner) => ({ id: `home-${home.id}-${owner.person_id}`, person_id: owner.person_id, name: `${home.label} property share`, value: value / ownerRows.length, type: "property", source_type: "property" }));
  });



  const pensionAssets: Asset[] = (pensionAccounts ?? []).map((account) => {
    const funds = (pensionFunds ?? []).filter((fund) => fund.pension_account_id === account.id);
    const fundValue = funds.reduce((sum, fund) => {
      const value = Number(fund.current_value || 0) || Number(fund.units || 0) * Number(fund.unit_price || 0);
      return sum + value;
    }, 0);
    return {
      id: `pension-${account.id}`,
      person_id: account.person_id,
      name: `${account.provider} · ${account.label}`,
      value: fundValue || Number(account.current_value || 0),
      type: "pension",
      source_type: "pension",
    };
  });

  const investmentAssets: Asset[] = (investmentAccounts ?? []).map((account) => {
    const holdings = (investmentHoldings ?? []).filter((holding) => holding.investment_account_id === account.id);
    const value = holdings.reduce((sum, holding) => sum + Number(holding.units || 0) * Number(holding.latest_price || 0), 0);
    return {
      id: `investment-${account.id}`,
      person_id: account.person_id,
      name: `${account.provider} · ${account.label}`,
      value,
      type: "investment",
      source_type: "investment",
    };
  });

  const autoLiabilities: Liability[] = (deals ?? []).flatMap<Liability>((deal) => {
    const balance = projectedBalance(deal);
    const ownerRows = (owners ?? []).filter((owner) => owner.home_id === deal.home_id);
    const home = (homes ?? []).find((item) => item.id === deal.home_id);
    if (ownerRows.length === 0) return [{ id: `mortgage-${deal.id}`, person_id: null, name: `${deal.lender || "Mortgage"}${home ? ` on ${home.label}` : ""}`, balance, type: "mortgage", source_type: "mortgage" }];
    return ownerRows.map((owner) => ({ id: `mortgage-${deal.id}-${owner.person_id}`, person_id: owner.person_id, name: `${deal.lender || "Mortgage"}${home ? ` on ${home.label}` : ""}`, balance: balance / ownerRows.length, type: "mortgage", source_type: "mortgage" }));
  });

  return (
    <>
      <Nav />
      <NetWorthClient people={people ?? []} assets={[...autoAssets, ...pensionAssets, ...investmentAssets, ...(manualAssets ?? [])]} liabilities={[...autoLiabilities, ...(manualLiabilities ?? [])]} />
    </>
  );
}
