"use client";

import { useState } from "react";
import {
  Brain,
  FileSpreadsheet,
  Layers,
  LineChart,
  Loader2,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import {
  addInvestmentAccount,
  addInvestmentHolding,
  addPensionAccount,
  addPensionFund,
  deleteInvestmentAccount,
  deleteInvestmentHolding,
  deletePensionAccount,
  deletePensionFund,
  importInvestmentHoldingsBulk,
  refreshInvestmentHoldingPrice,
  updateInvestmentHolding,
  updatePensionFund,
} from "@/app/investments/actions";

type Person = { id: string; name: string; relationship: string };
type PensionAccount = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  pension_type: string;
  contribution_method: string;
  employee_contribution_percent: number;
  employer_contribution_percent: number;
  employer_ni_topup_percent: number;
  employer_ni_topup_enabled?: boolean;
  fixed_monthly_contribution: number;
  annual_platform_fee_percent: number;
  fixed_monthly_fee: number;
  current_value: number;
  value_as_of_date: string;
  source_url: string | null;
  notes: string | null;
};
type PensionFund = {
  id: string;
  pension_account_id: string;
  fund_name: string;
  fund_code: string | null;
  group_label: string | null;
  target_allocation_percent: number;
  monthly_contribution_percent: number;
  contribution_active: boolean;
  current_value: number;
  units: number | null;
  unit_price: number | null;
  annual_fund_fee_percent: number;
  price_as_of_date: string;
  fee_source_url: string | null;
  notes: string | null;
};
type InvestmentAccount = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  account_type: string;
  annual_platform_fee_percent: number;
  fixed_monthly_fee: number;
  notes: string | null;
};
type InvestmentHolding = {
  id: string;
  investment_account_id: string;
  asset_name: string;
  ticker: string | null;
  exchange: string | null;
  group_label: string | null;
  units: number;
  average_buy_price: number;
  latest_price: number;
  latest_price_date: string;
  currency: string;
  price_quote_unit?: string | null;
  annual_asset_fee_percent: number;
  target_allocation_percent: number;
  source_url: string | null;
  notes: string | null;
};
type InvestmentLot = {
  id: string;
  holding_id: string;
  purchase_date: string;
  units: number;
  purchase_price: number;
  price_quote_unit: string | null;
  notes: string | null;
};

type Props = {
  people: Person[];
  pensionAccounts: PensionAccount[];
  pensionFunds: PensionFund[];
  investmentAccounts: InvestmentAccount[];
  investmentHoldings: InvestmentHolding[];
  investmentLots?: InvestmentLot[];
};

type Modal =
  | { type: "pension-account" }
  | { type: "pension-fund"; accountId?: string; defaults?: Partial<PensionFund> }
  | { type: "provider-fund-search"; accountId?: string; provider?: string }
  | { type: "investment-account" }
  | { type: "investment-holding"; accountId?: string }
  | { type: "bulk-holdings"; accountId?: string }
  | { type: "edit-pension-fund"; fund: PensionFund }
  | { type: "research-pension-fund"; fund: PensionFund; provider: string }
  | { type: "edit-investment-holding"; holding: InvestmentHolding }
  | null;

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";
const today = new Date().toISOString().slice(0, 10);

function valueOfFund(fund: PensionFund) {
  if (Number(fund.current_value) > 0) return Number(fund.current_value);
  return Number(fund.units ?? 0) * Number(fund.unit_price ?? 0);
}
function holdingValue(holding: InvestmentHolding) {
  return Number(holding.units ?? 0) * Number(holding.latest_price ?? 0);
}
function holdingCost(holding: InvestmentHolding) {
  return Number(holding.units ?? 0) * Number(holding.average_buy_price ?? 0);
}
function monthlyFeeOn(value: number, annualPercent: number, fixedMonthly = 0) {
  return (value * (Number(annualPercent || 0) / 100)) / 12 + Number(fixedMonthly || 0);
}
function ownerName(people: Person[], personId: string | null) {
  if (!personId) return "Household";
  return people.find((person) => person.id === personId)?.name ?? "Person";
}
function accountTypeLabel(type: string) {
  return type === "gia" ? "GIA" : type === "isa" ? "ISA" : type === "sipp" ? "SIPP" : type === "crypto" ? "Crypto" : "Other";
}
function priceDisplayFromStored(price: number, unit?: string | null, currency = "GBP") {
  if (String(unit || "").toLowerCase() === "gbx") return `${(Number(price) * 100).toFixed(2)}p`;
  return `${currency || "GBP"} ${Number(price).toFixed(4)}`;
}
function priceDisplay(holding: InvestmentHolding) {
  const unit = String(holding.price_quote_unit || "").toLowerCase();
  if (unit === "gbx" || holding.exchange?.toUpperCase() === "LSE") return `${(Number(holding.latest_price) * 100).toFixed(2)}p`;
  return `${holding.currency || "GBP"} ${Number(holding.latest_price).toFixed(4)}`;
}
function fundColour(index: number) {
  const colours = ["bg-slate-950", "bg-blue-700", "bg-sky-300", "bg-emerald-700", "bg-orange-500", "bg-violet-600"];
  return colours[index % colours.length];
}
function PersonOptions({ people }: { people: Person[] }) {
  return <><option value="">Household / shared</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}</>;
}
function ModalShell({ title, description, children, onClose }: { title: string; description?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>{description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}</div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function AllocationBar({ funds }: { funds: PensionFund[] }) {
  const total = funds.reduce((sum, fund) => sum + valueOfFund(fund), 0);
  if (total <= 0) return <div className="h-4 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-white">
      {funds.map((fund, index) => {
        const percent = (valueOfFund(fund) / total) * 100;
        return <div key={fund.id} className={`${fundColour(index)} min-w-[4px]`} style={{ width: `${Math.max(2, percent)}%` }} title={`${fund.fund_name}: ${percent.toFixed(1)}%`} />;
      })}
    </div>
  );
}
function ProviderLogo({ provider }: { provider: string }) {
  const letter = (provider || "?").trim().slice(0, 1).toUpperCase();
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-base font-black text-white shadow-lg shadow-slate-950/15">{letter}</div>;
}

function AddPensionAccountForm({ people }: { people: Person[] }) {
  return (
    <form action={addPensionAccount} className="grid gap-4 md:grid-cols-2">
      <FormInput label="Pot label" name="label" placeholder="Company pension · Legal & General" required />
      <FormInput label="Provider" name="provider" placeholder="Legal & General" required />
      <label className="block"><span className="text-sm font-bold text-slate-700">Owner</span><select name="person_id" className={inputClass}><PersonOptions people={people} /></select></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Pension type</span><select name="pension_type" className={inputClass}><option value="work">Work pension</option><option value="private">Private pension</option></select></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Contribution method</span><select name="contribution_method" className={inputClass}><option value="salary_sacrifice">Salary sacrifice</option><option value="net_pay">Net pay</option><option value="relief_at_source">Relief at source</option><option value="none">No contributions</option></select></label>
      <FormInput label="Employee contribution %" name="employee_contribution_percent" type="number" step="0.001" />
      <FormInput label="Employer contribution %" name="employer_contribution_percent" type="number" step="0.001" />
      <label className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800"><input type="checkbox" name="employer_ni_topup_enabled" /> Employer NI saving is topped into pension</label>
      <FormInput label="Employer NI top-up %" name="employer_ni_topup_percent" type="number" step="0.001" />
      <FormInput label="Fixed monthly contribution" name="fixed_monthly_contribution" type="number" step="0.01" />
      <FormInput label="Platform fee % / year" name="annual_platform_fee_percent" type="number" step="0.0001" />
      <FormInput label="Fixed monthly fee" name="fixed_monthly_fee" type="number" step="0.01" />
      <FormInput label="Current total value" name="current_value" type="number" step="0.01" />
      <FormInput label="Value date" name="value_as_of_date" type="date" defaultValue={today} />
      <FormInput label="Fee/source URL" name="source_url" placeholder="Plan/fund charge link" />
      <FormInput label="Notes" name="notes" placeholder="Scheme notes, employer NI arrangement" />
      <div className="flex items-end"><SubmitButton>Add pension pot</SubmitButton></div>
    </form>
  );
}

function AddPensionFundForm({ accounts, defaultAccountId, defaults }: { accounts: PensionAccount[]; defaultAccountId?: string; defaults?: Partial<PensionFund> }) {
  return (
    <form action={addPensionFund} className="grid gap-4 md:grid-cols-2">
      <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Pension pot</span><select name="pension_account_id" defaultValue={defaultAccountId ?? ""} className={inputClass} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.provider}</option>)}</select></label>
      <FormInput label="Fund name" name="fund_name" defaultValue={defaults?.fund_name ?? ""} placeholder="L&G PMC Lazard Emerging Markets 3" required />
      <FormInput label="Fund code / ISIN" name="fund_code" defaultValue={defaults?.fund_code ?? ""} placeholder="Optional" />
      <FormInput label="Group label" name="group_label" defaultValue={defaults?.group_label ?? ""} placeholder="Global equity, Multi asset" />
      <FormInput label="Current value" name="current_value" type="number" step="0.01" defaultValue={defaults?.current_value ?? ""} />
      <FormInput label="Units" name="units" type="number" step="0.00000001" />
      <FormInput label="Unit price" name="unit_price" type="number" step="0.00000001" />
      <FormInput label="Value date" name="price_as_of_date" type="date" defaultValue={today} />
      <FormInput label="Current allocation target %" name="target_allocation_percent" type="number" step="0.001" defaultValue={defaults?.target_allocation_percent ?? ""} />
      <FormInput label="Monthly contribution %" name="monthly_contribution_percent" type="number" step="0.001" defaultValue={defaults?.monthly_contribution_percent ?? ""} />
      <FormInput label="Fund fee % / year" name="annual_fund_fee_percent" type="number" step="0.0001" defaultValue={defaults?.annual_fund_fee_percent ?? ""} />
      <FormInput label="Fee/source URL" name="fee_source_url" defaultValue={defaults?.fee_source_url ?? ""} placeholder="Provider fund factsheet" />
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="contribution_active" defaultChecked /> Gets monthly allocation</label>
      <FormInput label="Notes" name="notes" defaultValue={defaults?.notes ?? ""} placeholder="No monthly allocation / switch planned" />
      <div className="flex items-end"><SubmitButton>Add fund</SubmitButton></div>
    </form>
  );
}
function EditPensionFundForm({ fund }: { fund: PensionFund }) {
  return (
    <form action={updatePensionFund} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={fund.id} />
      <FormInput label="Fund name" name="fund_name" defaultValue={fund.fund_name} required />
      <FormInput label="Fund code / ISIN" name="fund_code" defaultValue={fund.fund_code ?? ""} />
      <FormInput label="Group label" name="group_label" defaultValue={fund.group_label ?? ""} />
      <FormInput label="Current value" name="current_value" type="number" step="0.01" defaultValue={fund.current_value} />
      <FormInput label="Units" name="units" type="number" step="0.00000001" defaultValue={fund.units ?? ""} />
      <FormInput label="Unit price" name="unit_price" type="number" step="0.00000001" defaultValue={fund.unit_price ?? ""} />
      <FormInput label="Value date" name="price_as_of_date" type="date" defaultValue={fund.price_as_of_date} />
      <FormInput label="Current allocation target %" name="target_allocation_percent" type="number" step="0.001" defaultValue={fund.target_allocation_percent} />
      <FormInput label="Monthly contribution %" name="monthly_contribution_percent" type="number" step="0.001" defaultValue={fund.monthly_contribution_percent} />
      <FormInput label="Fund fee % / year" name="annual_fund_fee_percent" type="number" step="0.0001" defaultValue={fund.annual_fund_fee_percent} />
      <FormInput label="Fee/source URL" name="fee_source_url" defaultValue={fund.fee_source_url ?? ""} />
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="contribution_active" defaultChecked={fund.contribution_active} /> Gets monthly allocation</label>
      <FormInput label="Notes" name="notes" defaultValue={fund.notes ?? ""} />
      <div className="flex items-end"><SubmitButton>Save fund</SubmitButton></div>
    </form>
  );
}

function AddInvestmentAccountForm({ people }: { people: Person[] }) {
  return (
    <form action={addInvestmentAccount} className="grid gap-4 md:grid-cols-2">
      <FormInput label="Pot label" name="label" placeholder="Investment · ISA · Trading 212" required />
      <FormInput label="Provider" name="provider" placeholder="Trading 212, Revolut" required />
      <label className="block"><span className="text-sm font-bold text-slate-700">Owner</span><select name="person_id" className={inputClass}><PersonOptions people={people} /></select></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Account type</span><select name="account_type" className={inputClass}><option value="gia">GIA</option><option value="isa">Stocks & Shares ISA</option><option value="sipp">SIPP</option><option value="crypto">Crypto</option><option value="other">Other</option></select></label>
      <FormInput label="Platform fee % / year" name="annual_platform_fee_percent" type="number" step="0.0001" placeholder="0 if no annual platform fee" />
      <FormInput label="Fixed monthly fee" name="fixed_monthly_fee" type="number" step="0.01" />
      <FormInput label="Notes" name="notes" placeholder="e.g. Trading 212 pie, Revolut GIA, manual until API/CSV connected" />
      <div className="flex items-end"><SubmitButton>Add investment pot</SubmitButton></div>
    </form>
  );
}
function PriceUnitField({ value, onChange, name = "price_input_unit" }: { value?: string; onChange?: (value: string) => void; name?: string }) {
  return (
    <label className="block"><span className="text-sm font-bold text-slate-700">Price input unit</span><select name={name} value={value} onChange={(event) => onChange?.(event.target.value)} className={inputClass}><option value="gbp">GBP pounds</option><option value="gbx">UK pence / GBX</option><option value="usd">USD dollars</option><option value="eur">EUR euros</option></select></label>
  );
}

type QuoteResult = null | {
  price: number;
  source: string;
  rawSymbol: string;
  assetName?: string;
  exchange?: string;
  currency?: string;
  priceQuoteUnit?: string;
  note?: string;
};
function AddInvestmentHoldingForm({ accounts, defaultAccountId }: { accounts: InvestmentAccount[]; defaultAccountId?: string }) {
  const selectedAccount = accounts.find((account) => account.id === defaultAccountId) || accounts[0];
  const [accountId, setAccountId] = useState(defaultAccountId || selectedAccount?.id || "");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [assetName, setAssetName] = useState("");
  const [priceUnit, setPriceUnit] = useState("gbx");
  const [latestPrice, setLatestPrice] = useState("");
  const [quote, setQuote] = useState<QuoteResult>(null);
  const [quoteNote, setQuoteNote] = useState("");
  const [searching, setSearching] = useState(false);
  const [entryMode, setEntryMode] = useState<"average" | "lots">("average");
  const account = accounts.find((item) => item.id === accountId);

  async function searchTicker() {
    if (!ticker.trim()) return;
    setSearching(true);
    setQuoteNote("");
    setQuote(null);
    try {
      const response = await fetch("/api/investments/quote-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, exchange }),
      });
      const payload = await response.json();
      if (payload.quote) {
        setQuote(payload.quote);
        setAssetName(payload.quote.assetName || assetName || ticker.toUpperCase());
        setExchange(payload.quote.exchange || exchange);
        setPriceUnit(payload.quote.priceQuoteUnit || priceUnit);
        const display = payload.quote.priceQuoteUnit === "gbx" ? Number(payload.quote.price) * 100 : Number(payload.quote.price);
        setLatestPrice(String(Number(display.toFixed(6))));
      }
      setQuoteNote(payload.note || (payload.quote ? "Quote found." : "No quote found."));
    } catch (error) {
      setQuoteNote(error instanceof Error ? error.message : "Quote lookup failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <form action={addInvestmentHolding} className="space-y-5">
      <label className="block"><span className="text-sm font-bold text-slate-700">Investment pot</span><select name="investment_account_id" value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass} required>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.provider}</option>)}</select></label>

      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Step 1 · search the holding</p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="block"><span className="text-sm font-bold text-slate-700">Ticker</span><input name="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} className={inputClass} placeholder="G4M, VWRP, AAPL" /></label>
          <label className="block"><span className="text-sm font-bold text-slate-700">Exchange</span><input name="exchange" value={exchange} onChange={(event) => setExchange(event.target.value.toUpperCase())} className={inputClass} placeholder="LSE, NASDAQ" /></label>
          <button type="button" onClick={searchTicker} disabled={searching || !ticker.trim()} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
        </div>
        {quote || quoteNote ? (
          <div className="mt-4 rounded-3xl border border-white bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Search result</p>
            {quote ? <div className="mt-2 grid gap-3 md:grid-cols-5"><div><p className="text-xs font-bold text-slate-500">Stock</p><p className="font-black text-slate-950">{ticker}</p></div><div><p className="text-xs font-bold text-slate-500">Company</p><p className="font-black text-slate-950">{quote.assetName || ticker}</p></div><div><p className="text-xs font-bold text-slate-500">Exchange</p><p className="font-black text-slate-950">{quote.exchange || exchange || "Review"}</p></div><div><p className="text-xs font-bold text-slate-500">Price format</p><p className="font-black text-slate-950">{quote.priceQuoteUnit === "gbx" ? "GBP pence / GBX" : quote.currency || "GBP"}</p></div><div><p className="text-xs font-bold text-slate-500">Current price</p><p className="font-black text-emerald-700">{priceDisplayFromStored(quote.price, quote.priceQuoteUnit, quote.currency || "GBP")}</p></div></div> : null}
            <p className="mt-2 text-sm font-semibold text-slate-500">{quoteNote}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="text-sm font-bold text-slate-700">Stock / fund name</span><input name="asset_name" value={assetName} onChange={(event) => setAssetName(event.target.value)} className={inputClass} placeholder="Gear4music" required /></label>
        <FormInput label="Group / pie label" name="group_label" placeholder="Trading 212 Pie A, AI, Global ETF" />
        <PriceUnitField value={priceUnit} onChange={setPriceUnit} />
        <label className="block"><span className="text-sm font-bold text-slate-700">Latest price</span><input name="latest_price" value={latestPrice} onChange={(event) => setLatestPrice(event.target.value)} type="number" step="0.000001" className={inputClass} placeholder="Optional - search can fill this" /></label>
        <FormInput label="Price date" name="latest_price_date" type="date" defaultValue={today} />
        <FormInput label="Asset fee % / year" name="annual_asset_fee_percent" type="number" step="0.0001" placeholder="Usually 0 for individual shares" />
        <FormInput label="Target allocation %" name="target_allocation_percent" type="number" step="0.001" />
        <FormInput label="Source URL" name="source_url" placeholder="Factsheet / quote URL" />
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEntryMode("average")} className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "average" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Use average price</button>
          <button type="button" onClick={() => setEntryMode("lots")} className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "lots" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Enter purchase lots</button>
        </div>
        {entryMode === "average" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><FormInput label="Shares / units owned" name="units" type="number" step="0.00000001" required /><FormInput label="Average purchase price" name="average_buy_price" type="number" step="0.000001" /></div> : <label className="mt-4 block"><span className="text-sm font-bold text-slate-700">Purchase lots</span><textarea name="purchase_lots" rows={7} className={inputClass} placeholder={'2026-06-01,100,240,first buy\n2026-06-10,50,255,top-up'} /><span className="mt-1 block text-xs font-semibold text-slate-500">One line per purchase: date, shares, price, note. The app totals the shares and calculates weighted average price.</span></label>}
      </div>

      <input type="hidden" name="currency" value={quote?.currency || (priceUnit === "usd" ? "USD" : priceUnit === "eur" ? "EUR" : "GBP")} />
      <FormInput label="Notes" name="notes" placeholder={account ? `Platform fee on ${account.provider}: ${Number(account.annual_platform_fee_percent || 0).toFixed(3)}%/yr + ${formatMoney(account.fixed_monthly_fee || 0)}/month` : "Notes"} />
      <SubmitButton>Add holding</SubmitButton>
    </form>
  );
}
function EditInvestmentHoldingForm({ holding }: { holding: InvestmentHolding }) {
  const unit = holding.price_quote_unit || (holding.exchange?.toUpperCase() === "LSE" ? "gbx" : "gbp");
  const latestDisplay = unit === "gbx" ? Number(holding.latest_price || 0) * 100 : Number(holding.latest_price || 0);
  const avgDisplay = unit === "gbx" ? Number(holding.average_buy_price || 0) * 100 : Number(holding.average_buy_price || 0);
  return (
    <form action={updateInvestmentHolding} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={holding.id} />
      <FormInput label="Stock / fund name" name="asset_name" defaultValue={holding.asset_name} required />
      <FormInput label="Ticker" name="ticker" defaultValue={holding.ticker ?? ""} />
      <FormInput label="Exchange" name="exchange" defaultValue={holding.exchange ?? ""} />
      <FormInput label="Group / pie label" name="group_label" defaultValue={holding.group_label ?? ""} />
      <FormInput label="Shares / units owned" name="units" type="number" step="0.00000001" defaultValue={holding.units} required />
      <PriceUnitField value={unit} name="price_input_unit" />
      <FormInput label="Average purchase price" name="average_buy_price" type="number" step="0.000001" defaultValue={avgDisplay} />
      <FormInput label="Latest price" name="latest_price" type="number" step="0.000001" defaultValue={latestDisplay} />
      <FormInput label="Price date" name="latest_price_date" type="date" defaultValue={holding.latest_price_date} />
      <FormInput label="Asset fee % / year" name="annual_asset_fee_percent" type="number" step="0.0001" defaultValue={holding.annual_asset_fee_percent} />
      <FormInput label="Target allocation %" name="target_allocation_percent" type="number" step="0.001" defaultValue={holding.target_allocation_percent} />
      <FormInput label="Source URL" name="source_url" defaultValue={holding.source_url ?? ""} />
      <FormInput label="Notes" name="notes" defaultValue={holding.notes ?? ""} />
      <div className="flex items-end"><SubmitButton>Save holding</SubmitButton></div>
    </form>
  );
}
function BulkHoldingsForm({ accounts, defaultAccountId }: { accounts: InvestmentAccount[]; defaultAccountId?: string }) {
  return (
    <form action={importInvestmentHoldingsBulk} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Investment pot</span><select name="investment_account_id" defaultValue={defaultAccountId ?? ""} className={inputClass} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.provider}</option>)}</select></label>
        <PriceUnitField value="gbx" />
      </div>
      <label className="block"><span className="text-sm font-bold text-slate-700">Upload CSV/text or screenshot</span><input name="holdings_file" type="file" accept=".csv,text/csv,text/plain,image/*" className={inputClass} /><span className="mt-1 block text-xs font-semibold text-slate-500">CSV/text works without AI. Screenshot extraction uses the saved OpenAI token if available.</span></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Or paste holdings</span><textarea name="holdings_text" rows={12} className={inputClass} placeholder={'Name,Ticker,Exchange,Units,Average Buy Price,Latest Price,Group\nGear4music,G4M,LSE,414.96000000,241,250,My 52-stock pie'} /></label>
      <div className="rounded-3xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Use this for Trading 212/Revolut pie exports or screenshots. UK shares can be pasted in pence; the app stores them as GBP internally for net worth calculations.</div>
      <SubmitButton>Import holdings</SubmitButton>
    </form>
  );
}

function ProviderFundSearch({ accounts, defaultAccountId, onSelect }: { accounts: PensionAccount[]; defaultAccountId?: string; onSelect: (accountId: string, fund: Partial<PensionFund>) => void }) {
  const account = accounts.find((item) => item.id === defaultAccountId) || accounts[0];
  const [accountId, setAccountId] = useState(account?.id || "");
  const selected = accounts.find((item) => item.id === accountId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/investments/provider-fund-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selected?.provider, query }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label><span className="text-sm font-bold text-slate-700">Provider/account</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.provider}</option>)}</select></label>
        <label><span className="text-sm font-bold text-slate-700">Search text</span><input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} placeholder="Lazard Emerging Markets, Islamic Global Equity" /></label>
        <button type="button" onClick={run} disabled={loading || !selected} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />} Search</button>
      </div>
      {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}
      {result ? <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">{result.usedOpenAi ? "OpenAI-assisted provider search" : "Provider helper"}</p><p className="mt-1 text-sm font-semibold text-slate-700">{result.summary}</p><div className="mt-4 grid gap-3 md:grid-cols-2">{(result.funds || []).map((fund: any, idx: number) => <article key={`${fund.fund_name}-${idx}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4"><p className="font-black text-slate-950">{fund.fund_name}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{fund.group_label || "Review"} · confidence {fund.confidence || 0}%</p><p className="mt-2 text-sm font-semibold text-slate-600">{fund.note}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onSelect(accountId, { fund_name: fund.fund_name, fund_code: fund.fund_code, group_label: fund.group_label, annual_fund_fee_percent: fund.annual_fund_fee_percent ?? undefined, fee_source_url: fund.source_url, notes: fund.note })} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Use this fund</button>{fund.source_url ? <a href={fund.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700">Open source</a> : null}</div></article>)}</div></div> : null}
    </div>
  );
}

export function PensionsInvestmentsClient({ people, pensionAccounts, pensionFunds, investmentAccounts, investmentHoldings, investmentLots = [] }: Props) {
  const [area, setArea] = useState<"pensions" | "investments">("pensions");
  const [personFilter, setPersonFilter] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filteredPensionAccounts = pensionAccounts.filter((account) => personFilter === "all" || account.person_id === personFilter || (!account.person_id && personFilter === "household"));
  const filteredInvestmentAccounts = investmentAccounts.filter((account) => personFilter === "all" || account.person_id === personFilter || (!account.person_id && personFilter === "household"));
  const pensionTotal = pensionFunds.reduce((sum, fund) => sum + valueOfFund(fund), 0) + pensionAccounts.reduce((sum, account) => sum + Number(account.current_value || 0), 0);
  const investmentTotal = investmentHoldings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const investmentCost = investmentHoldings.reduce((sum, holding) => sum + holdingCost(holding), 0);
  const monthlyPensionFees = pensionAccounts.reduce((sum, account) => {
    const funds = pensionFunds.filter((fund) => fund.pension_account_id === account.id);
    const fundTotal = funds.reduce((total, fund) => total + valueOfFund(fund), 0) || Number(account.current_value || 0);
    return sum + monthlyFeeOn(fundTotal, account.annual_platform_fee_percent, account.fixed_monthly_fee) + funds.reduce((fundSum, fund) => fundSum + monthlyFeeOn(valueOfFund(fund), fund.annual_fund_fee_percent), 0);
  }, 0);
  const monthlyInvestmentFees = investmentAccounts.reduce((sum, account) => {
    const holdings = investmentHoldings.filter((holding) => holding.investment_account_id === account.id);
    const total = holdings.reduce((holdingSum, holding) => holdingSum + holdingValue(holding), 0);
    return sum + monthlyFeeOn(total, account.annual_platform_fee_percent, account.fixed_monthly_fee) + holdings.reduce((holdingSum, holding) => holdingSum + monthlyFeeOn(holdingValue(holding), holding.annual_asset_fee_percent), 0);
  }, 0);

  return (
    <main className="mx-auto w-[95vw] max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,#0f766e,transparent_28%),linear-gradient(135deg,#020617,#111827_55%,#431407)] p-8 text-white shadow-[0_35px_120px_-70px_rgba(15,23,42,.85)]">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-200">Pensions & investments</p>
            <h1 className="mt-4 text-5xl font-black tracking-tight">{formatMoney(pensionTotal + investmentTotal)}</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold text-slate-100">Track pension pots and investment pots separately. Add the provider wrapper first, then add funds, holdings, pies or purchase lots inside the pot.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/20 p-5 backdrop-blur"><p className="text-xs font-black uppercase text-slate-200">Pensions</p><p className="mt-2 text-2xl font-black">{formatMoney(pensionTotal)}</p></div>
            <div className="rounded-3xl bg-white/20 p-5 backdrop-blur"><p className="text-xs font-black uppercase text-slate-200">Investments</p><p className="mt-2 text-2xl font-black">{formatMoney(investmentTotal)}</p></div>
            <div className="rounded-3xl bg-emerald-400/20 p-5 backdrop-blur"><p className="text-xs font-black uppercase text-emerald-100">Investment P/L</p><p className="mt-2 text-2xl font-black text-emerald-100">{formatMoney(investmentTotal - investmentCost)}</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setArea("pensions")} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-sm ${area === "pensions" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}><PiggyBank className="h-4 w-4" /> Pension funds</button>
          <button onClick={() => setArea("investments")} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-sm ${area === "investments" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}><TrendingUp className="h-4 w-4" /> Investment stocks</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPersonFilter("all")} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === "all" ? "bg-orange-500 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>All household</button>
          {people.map((person) => <button key={person.id} onClick={() => setPersonFilter(person.id)} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === person.id ? "bg-orange-500 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{person.name}</button>)}
          <div className="relative">
            <button onClick={() => setAddOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"><Plus className="h-4 w-4" /> Add pot</button>
            {addOpen ? <div className="absolute right-0 z-30 mt-2 w-64 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl"><button onClick={() => { setModal({ type: "pension-account" }); setAddOpen(false); }} className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-black hover:bg-slate-50">Add pension pot</button><button onClick={() => { setModal({ type: "investment-account" }); setAddOpen(false); }} className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-black hover:bg-slate-50">Add investment pot</button></div> : null}
          </div>
        </div>
      </div>

      {area === "pensions" ? <section className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3"><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Total pension value</p><p className="mt-3 text-3xl font-black">{formatMoney(pensionTotal)}</p></div><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Fixed monthly top-up</p><p className="mt-3 text-3xl font-black">{formatMoney(pensionAccounts.reduce((sum, account) => sum + Number(account.fixed_monthly_contribution || 0), 0))}</p></div><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Estimated monthly fees</p><p className="mt-3 text-3xl font-black">{formatMoney(monthlyPensionFees)}</p></div></div>
        {filteredPensionAccounts.map((account) => {
          const funds = pensionFunds.filter((fund) => fund.pension_account_id === account.id);
          const fundTotal = funds.reduce((sum, fund) => sum + valueOfFund(fund), 0);
          const total = fundTotal || Number(account.current_value || 0);
          return <div key={account.id} className="overflow-hidden rounded-[2.25rem] border border-white/70 bg-white shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]"><div className="grid lg:grid-cols-[1fr_340px]"><div className="p-6"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex gap-4"><ProviderLogo provider={account.provider} /><div><p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-600">{account.pension_type === "work" ? "Work pension" : "Private pension"}</p><h2 className="mt-3 text-2xl font-black text-slate-950">{account.label}</h2><p className="text-sm font-semibold text-slate-500">{account.provider} · {ownerName(people, account.person_id)} · {account.contribution_method.replace(/_/g, " ")}</p></div></div><form action={deletePensionAccount}><input type="hidden" name="id" value={account.id} /><button className="text-sm font-bold text-red-600">Delete</button></form></div><div className="mt-6"><AllocationBar funds={funds} /></div><div className="mt-5 space-y-3">{funds.map((fund) => <article key={fund.id} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-lg font-black text-slate-950">{fund.fund_name}</p><p className="mt-1 text-sm font-semibold text-slate-500">{fund.group_label || "Fund"} · {formatMoney(valueOfFund(fund))} · contribution {fund.contribution_active ? `${Number(fund.monthly_contribution_percent).toFixed(1)}%` : "off"}</p><p className="mt-1 text-xs font-semibold text-slate-500">Fee {Number(fund.annual_fund_fee_percent || 0).toFixed(3)}%/yr · checked {fund.price_as_of_date}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><button onClick={() => setModal({ type: "research-pension-fund", fund, provider: account.provider })} className="rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-700">AI check</button><button onClick={() => setModal({ type: "edit-pension-fund", fund })} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button><form action={deletePensionFund}><input type="hidden" name="id" value={fund.id} /><button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">Delete</button></form></div></div></article>)}{funds.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No funds yet. Use provider search or add funds manually inside this pot.</div> : null}</div></div><aside className="bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">Pot value</p><p className="mt-2 text-4xl font-black">{formatMoney(total)}</p><p className="mt-1 text-sm font-semibold text-slate-300">Updated {account.value_as_of_date}</p><div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"><p className="text-sm font-bold text-slate-200">Estimated fees</p><p className="mt-1 text-2xl font-black">{formatMoney(monthlyFeeOn(total, account.annual_platform_fee_percent, account.fixed_monthly_fee) + funds.reduce((sum, fund) => sum + monthlyFeeOn(valueOfFund(fund), fund.annual_fund_fee_percent), 0))}<span className="text-sm font-bold text-slate-300"> / month</span></p></div>{account.employer_ni_topup_enabled ? <div className="mt-4 rounded-3xl bg-emerald-400/15 p-4 text-sm font-bold text-emerald-100">Employer NI top-up enabled · {Number(account.employer_ni_topup_percent || 0).toFixed(2)}%</div> : null}<button onClick={() => setModal({ type: "provider-fund-search", accountId: account.id, provider: account.provider })} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Search className="h-4 w-4" /> Find funds</button><button onClick={() => setModal({ type: "pension-fund", accountId: account.id })} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" /> Add fund manually</button></aside></div></div>;
        })}
        {filteredPensionAccounts.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center"><PiggyBank className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black text-slate-950">No pension pots yet</p><p className="mt-1 text-sm text-slate-500">Add “Company pension · Legal & General” first, then add each fund and monthly allocation.</p></div> : null}
      </section> : null}

      {area === "investments" ? <section className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3"><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Market value</p><p className="mt-3 text-3xl font-black">{formatMoney(investmentTotal)}</p></div><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Cost basis</p><p className="mt-3 text-3xl font-black">{formatMoney(investmentCost)}</p></div><div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Gain / loss</p><p className={`mt-3 text-3xl font-black ${investmentTotal - investmentCost >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatMoney(investmentTotal - investmentCost)}</p></div></div>
        {filteredInvestmentAccounts.map((account) => {
          const holdings = investmentHoldings.filter((holding) => holding.investment_account_id === account.id);
          const total = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
          const groupNames = Array.from(new Set(holdings.map((holding) => holding.group_label).filter(Boolean))) as string[];
          return <div key={account.id} className="rounded-[2.25rem] border border-white/70 bg-white p-6 shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex gap-4"><ProviderLogo provider={account.provider} /><div><p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">{accountTypeLabel(account.account_type)}</p><h2 className="mt-3 text-2xl font-black text-slate-950">{account.label}</h2><p className="text-sm font-semibold text-slate-500">{account.provider} · {ownerName(people, account.person_id)} · {holdings.length} holding(s)</p>{groupNames.length ? <div className="mt-3 flex flex-wrap gap-2">{groupNames.map((group) => <span key={group} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600"><Layers className="mr-1 inline h-3 w-3" />{group}</span>)}</div> : null}</div></div><div className="flex items-center gap-3"><div className="text-right"><p className="text-3xl font-black">{formatMoney(total)}</p><p className="text-xs font-bold text-slate-500">Platform fee {Number(account.annual_platform_fee_percent || 0).toFixed(3)}%/yr + {formatMoney(account.fixed_monthly_fee || 0)}/mo</p></div><form action={deleteInvestmentAccount}><input type="hidden" name="id" value={account.id} /><button className="text-sm font-bold text-red-600">Delete</button></form></div></div><div className="mt-5 space-y-3">{holdings.map((holding) => { const value = holdingValue(holding); const cost = holdingCost(holding); const pl = value - cost; const plPercent = cost > 0 ? (pl / cost) * 100 : 0; const lots = investmentLots.filter((lot) => lot.holding_id === holding.id); return <div key={holding.id} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-lg font-black text-slate-950">{holding.asset_name}</p><p className="text-sm font-semibold text-slate-500">{holding.ticker || "No ticker"}{holding.exchange ? ` · ${holding.exchange}` : ""} · {Number(holding.units).toFixed(8)} units · latest {priceDisplay(holding)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{holding.group_label || "Holding"} · checked {holding.latest_price_date} · fee {Number(holding.annual_asset_fee_percent).toFixed(3)}%/yr {lots.length ? `· ${lots.length} purchase lot(s)` : ""}</p>{lots.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{lots.slice(0, 4).map((lot) => <div key={lot.id} className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-500">{lot.purchase_date}: {Number(lot.units).toFixed(8)} @ {priceDisplayFromStored(lot.purchase_price, lot.price_quote_unit, holding.currency)}</div>)}</div> : null}</div><div className="text-left md:text-right"><p className="text-2xl font-black">{formatMoney(value)}</p><p className={`text-sm font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatMoney(pl)} · {plPercent.toFixed(1)}%</p><div className="mt-2 flex flex-wrap gap-2 md:justify-end"><form action={refreshInvestmentHoldingPrice}><input type="hidden" name="id" value={holding.id} /><button className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Check price</button></form><button onClick={() => setModal({ type: "edit-investment-holding", holding })} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button><form action={deleteInvestmentHolding}><input type="hidden" name="id" value={holding.id} /><button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">Delete</button></form></div></div></div></div>; })}{holdings.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No holdings yet. Search by ticker, add manually, or bulk import a pie.</div> : null}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setModal({ type: "investment-holding", accountId: account.id })} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" /> Add holding</button><button onClick={() => setModal({ type: "bulk-holdings", accountId: account.id })} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><FileSpreadsheet className="h-4 w-4" /> Bulk import pie</button></div></div>;
        })}
        {filteredInvestmentAccounts.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center"><LineChart className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black text-slate-950">No investment pots yet</p><p className="mt-1 text-sm text-slate-500">Add “Investment · GIA · Revolut”, “Investment · GIA · Trading 212” or “Investment · ISA · Trading 212”, then add holdings inside it.</p></div> : null}
      </section> : null}

      <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-5 text-sm font-semibold text-amber-950"><div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5" /><p>End-of-day/delayed prices are fine for tracking. Provider tokens improve coverage, but the app can still use manual values, bulk imports and source notes while you avoid full broker integrations.</p></div></section>

      {modal?.type === "pension-account" ? <ModalShell title="Add pension pot" description="Create the provider wrapper first: Company pension · Legal & General, Private pension · PensionBee, etc." onClose={() => setModal(null)}><AddPensionAccountForm people={people} /></ModalShell> : null}
      {modal?.type === "provider-fund-search" ? <ModalShell title="Find pension fund" description="Search provider options, then select the likely fund to pre-fill the add form." onClose={() => setModal(null)}>{pensionAccounts.length ? <ProviderFundSearch accounts={pensionAccounts} defaultAccountId={modal.accountId} onSelect={(accountId, fund) => setModal({ type: "pension-fund", accountId, defaults: fund })} /> : <p className="text-sm font-semibold text-slate-500">Add a pension pot first.</p>}</ModalShell> : null}
      {modal?.type === "pension-fund" ? <ModalShell title="Add pension fund" description="Add each fund and set whether it receives a monthly contribution allocation." onClose={() => setModal(null)}>{pensionAccounts.length ? <AddPensionFundForm accounts={pensionAccounts} defaultAccountId={modal.accountId} defaults={modal.defaults} /> : <p className="text-sm font-semibold text-slate-500">Add a pension pot first.</p>}</ModalShell> : null}
      {modal?.type === "edit-pension-fund" ? <ModalShell title="Edit pension fund" description="Update value, allocation, monthly contribution split and fees." onClose={() => setModal(null)}><EditPensionFundForm fund={modal.fund} /></ModalShell> : null}
      {modal?.type === "research-pension-fund" ? <ModalShell title="AI fund fee / option check" description="Use this for funds that are not already in your assumptions." onClose={() => setModal(null)}><PensionFundResearch fund={modal.fund} provider={modal.provider} /></ModalShell> : null}
      {modal?.type === "investment-account" ? <ModalShell title="Add investment pot" description="Create the platform wrapper first: Trading 212 ISA, Trading 212 GIA, Revolut GIA, etc." onClose={() => setModal(null)}><AddInvestmentAccountForm people={people} /></ModalShell> : null}
      {modal?.type === "investment-holding" ? <ModalShell title="Add holding inside investment pot" description="Start with ticker/exchange search, then enter shares and average price or purchase lots." onClose={() => setModal(null)}>{investmentAccounts.length ? <AddInvestmentHoldingForm accounts={investmentAccounts} defaultAccountId={modal.accountId} /> : <p className="text-sm font-semibold text-slate-500">Add an investment pot first.</p>}</ModalShell> : null}
      {modal?.type === "bulk-holdings" ? <ModalShell title="Bulk import pie holdings" description="Paste many holdings at once from Trading 212/Revolut exports or text extracted from a screenshot." onClose={() => setModal(null)}>{investmentAccounts.length ? <BulkHoldingsForm accounts={investmentAccounts} defaultAccountId={modal.accountId} /> : <p className="text-sm font-semibold text-slate-500">Add an investment pot first.</p>}</ModalShell> : null}
      {modal?.type === "edit-investment-holding" ? <ModalShell title="Edit holding" description="Update shares, price, ticker, target allocation and fees." onClose={() => setModal(null)}><EditInvestmentHoldingForm holding={modal.holding} /></ModalShell> : null}
    </main>
  );
}

function PensionFundResearch({ fund, provider }: { fund: PensionFund; provider: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { suggested_fee_percent?: number | null; suggested_fund_code?: string | null; suggested_group_label?: string | null; suggested_source_url?: string | null; confidence?: number; research_summary?: string; options?: { label: string; note: string }[]; usedOpenAi?: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/investments/fund-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pensionFundId: fund.id, fundName: fund.fund_name, provider }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Research check failed");
      setResult(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Research check failed"); } finally { setLoading(false); }
  }

  return <div className="space-y-5"><div className="rounded-3xl border border-orange-100 bg-orange-50 p-5"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 text-orange-600" /><div><p className="font-black text-orange-950">Server-side research helper</p><p className="mt-1 text-sm font-semibold text-orange-900">Checks saved OpenAI tokens only on the server. It can suggest fee assumptions and source links, but you should review provider factsheets before accepting fees.</p></div></div></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">Fund</p><h3 className="mt-1 text-2xl font-black text-slate-950">{fund.fund_name}</h3><p className="text-sm font-semibold text-slate-500">{provider} · current saved fee {Number(fund.annual_fund_fee_percent || 0).toFixed(3)}% / year</p><button onClick={runResearch} disabled={loading} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />} {loading ? "Checking..." : "Check fund fees / options"}</button></div>{error ? <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}{result ? <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Research result {result.usedOpenAi ? "· OpenAI-assisted" : "· planning fallback"}</p><h3 className="mt-1 text-xl font-black text-slate-950">Suggested fee: {result.suggested_fee_percent ?? "review"}% / year</h3><p className="mt-1 text-sm font-semibold text-slate-600">Confidence: {Number(result.confidence ?? 0).toFixed(0)}%</p></div>{result.suggested_source_url ? <a href={result.suggested_source_url} target="_blank" rel="noreferrer" className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-700">Open source</a> : null}</div><p className="mt-4 whitespace-pre-wrap text-sm font-semibold text-slate-700">{result.research_summary}</p>{result.options?.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{result.options.map((option, idx) => <div key={`${option.label}-${idx}`} className="rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-950">{option.label}</p><p className="mt-1 text-sm font-semibold text-slate-600">{option.note}</p></div>)}</div> : null}</div> : null}</div>;
}
