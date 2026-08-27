"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { addInvestmentHolding } from "@/lib/investments/actions";

type InvestmentAccount = { id: string; label: string; provider: string; annual_platform_fee_percent?: number; fixed_monthly_fee?: number };

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
const today = new Date().toISOString().slice(0, 10);

// --- Small helpers duplicated from PensionsInvestmentsClient.tsx (not
// exported there) so this file can stand alone. Behaviour is unchanged. ---
function priceDisplayFromStored(price: number, unit?: string | null, currency = "GBP") {
  const cleanUnit = String(unit || "").toLowerCase();
  const cleanCurrency = String(currency || "GBP").toUpperCase();
  if (cleanUnit === "gbx") return `${Number(price).toFixed(2)}p`;
  if (cleanUnit === "usd" || cleanCurrency === "USD") return `USD ${Number(price).toFixed(4)}`;
  if (cleanUnit === "eur" || cleanCurrency === "EUR") return `EUR ${Number(price).toFixed(4)}`;
  return `${cleanCurrency} ${Number(price).toFixed(4)}`;
}
function normalisedExchange(exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ", "XNAS", "XNCM", "XNGS", "NCM"].includes(ex)) return "NASDAQ";
  if (["NYQ", "NYSE", "XNYS"].includes(ex)) return "NYSE";
  if (["ASE", "AMEX", "NYSEAMERICAN", "XASE"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "LSE", "XLSE", "LDN"].includes(ex)) return "LSE";
  if (["OTCM", "OTC", "OOTC"].includes(ex)) return "OTCM";
  if (["PINX", "PINK", "OTCPK"].includes(ex)) return "PINX";
  return ex;
}
function marketCurrencyFor(exchange?: string | null, fallback?: string | null) {
  const ex = normalisedExchange(exchange);
  const fb = String(fallback || "").toUpperCase();
  if (ex === "LSE" || ex === "AIM") return "GBX";
  if (["NASDAQ", "NYSE", "AMEX", "US", "OTCM", "PINX", "ARCX", "BATS"].includes(ex)) return "USD";
  return fb || "GBP";
}
function PriceUnitField({ value, onChange, name = "price_input_unit" }: { value?: string; onChange?: (value: string) => void; name?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">Price input unit</span>
      <select name={name} value={value} onChange={(event) => onChange?.(event.target.value)} className={inputClass}>
        <option value="gbp">GBP pounds</option>
        <option value="gbx">UK pence / GBX</option>
        <option value="usd">USD dollars</option>
        <option value="eur">EUR euros</option>
      </select>
    </label>
  );
}
function MarketCurrencyHint({ exchange, priceUnit, nativeCurrency }: { exchange?: string | null; priceUnit?: string | null; nativeCurrency?: string | null }) {
  const ex = normalisedExchange(exchange);
  const unit = String(priceUnit || "").toLowerCase();
  const inferred = marketCurrencyFor(ex, nativeCurrency);
  const warnings: string[] = [];
  if (ex === "LSE" && unit !== "gbx") warnings.push("LSE quotes are normally entered in pence/GBX. The app stores the GBP equivalent after saving.");
  if (["NASDAQ", "NYSE", "AMEX"].includes(ex) && unit !== "usd") warnings.push("US-listed stocks are normally quoted in USD. The app converts the saved value to GBP for portfolio totals.");
  if (!warnings.length) warnings.push(`Market quote looks like ${inferred}. Portfolio totals are shown in GBP, with the native price kept alongside it.`);
  return <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">{warnings.join(" ")}</div>;
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
  sourceUrl?: string | null;
  assetType?: string | null;
  isin?: string | null;
  annualAssetFeePercent?: number | null;
  confidence?: number | null;
};
type QuoteCandidate = NonNullable<QuoteResult>;
function normaliseInvestmentSearchText(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokenOverlapConfidence(candidate: QuoteCandidate, query: string) {
  const explicit = Number(candidate.confidence ?? 0);
  if (explicit >= 50) return explicit;
  const q = normaliseInvestmentSearchText(query);
  const symbol = normaliseInvestmentSearchText(candidate.rawSymbol || "");
  const name = normaliseInvestmentSearchText(`${candidate.assetName || ""} ${candidate.isin || ""}`);
  if (!q) return 0;
  if (symbol && (q === symbol || q === symbol.replace(/ l$/, ""))) return 99;
  if (name.includes(q) || q.includes(name)) return 90;
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  if (!qTokens.length) return 0;
  const haystack = `${name} ${symbol}`;
  const hits = qTokens.filter((token) => haystack.includes(token)).length;
  const ratio = hits / qTokens.length;
  if (ratio >= 0.8) return 75;
  if (ratio >= 0.5 && hits >= 2) return 55;
  return Math.round(ratio * 45);
}
// --- end duplicated helpers ---

type Step = "identify" | "holding" | "final";
const DETAIL_STEPS: { id: Step; label: string }[] = [
  { id: "identify", label: "Identify & price" },
  { id: "holding", label: "Your holding" },
  { id: "final", label: "Allocation & notes" },
];

export function AddInvestmentHoldingWizard({ accounts, defaultAccountId }: { accounts: InvestmentAccount[]; defaultAccountId?: string }) {
  const selectedAccount = accounts.find((account) => account.id === defaultAccountId) || accounts[0];
  const [accountId, setAccountId] = useState(defaultAccountId || selectedAccount?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetKind, setAssetKind] = useState("share");
  const [isin, setIsin] = useState("");
  const [priceUnit, setPriceUnit] = useState("gbx");
  const [latestPrice, setLatestPrice] = useState("");
  const [annualAssetFee, setAnnualAssetFee] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [quote, setQuote] = useState<QuoteResult>(null);
  const [matches, setMatches] = useState<QuoteCandidate[]>([]);
  const [quoteNote, setQuoteNote] = useState("");
  const [searching, setSearching] = useState(false);
  const [coverageQueued, setCoverageQueued] = useState("");
  const [entryMode, setEntryMode] = useState<"average" | "lots">("average");
  const [lotRows, setLotRows] = useState([{ date: today, units: "", price: "", total: "", note: "" }]);
  const [detailStepIndex, setDetailStepIndex] = useState(0);

  const account = accounts.find((item) => item.id === accountId);
  const selected = Boolean(quote);
  const currentDetailStep = DETAIL_STEPS[detailStepIndex].id;
  const isLastDetailStep = detailStepIndex === DETAIL_STEPS.length - 1;

  function updateLot(index: number, field: "date" | "units" | "price" | "total" | "note", value: string) {
    setLotRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function stripSymbol(symbol?: string | null) {
    return String(symbol || "").toUpperCase().replace(/\.L$/i, "").replace(/\.UK$/i, "");
  }

  function applyQuote(candidate: QuoteCandidate) {
    setQuote(candidate);
    setTicker(stripSymbol(candidate.rawSymbol));
    setAssetName(candidate.assetName || searchQuery || candidate.rawSymbol || "Holding");
    setExchange(candidate.exchange || exchange);
    setAssetKind(candidate.assetType || "share");
    setIsin(candidate.isin || "");
    setPriceUnit(candidate.priceQuoteUnit || priceUnit);
    setAnnualAssetFee(candidate.annualAssetFeePercent === null || candidate.annualAssetFeePercent === undefined ? "" : String(candidate.annualAssetFeePercent));
    setSourceUrl(candidate.sourceUrl || "");
    if (candidate.price > 0) setLatestPrice(String(Number(Number(candidate.price).toFixed(6))));
    setDetailStepIndex(0);
  }

  async function searchHolding(mode: "auto" | "manual" = "manual") {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setCoverageQueued("");
    if (mode === "manual") setQuoteNote("");
    setQuote(null);
    try {
      const response = await fetch("/api/investments/quote-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, exchange, investmentAccountId: accountId }),
      });
      const payload = await response.json();
      const candidates = Array.isArray(payload.matches) ? payload.matches : payload.quote ? [payload.quote] : [];
      const confident = candidates
        .map((candidate: QuoteCandidate) => ({ ...candidate, confidence: tokenOverlapConfidence(candidate, searchQuery) }))
        .filter((candidate: QuoteCandidate) => Number(candidate.confidence || 0) >= 25 || /search|openai|yahoo/i.test(String(candidate.source || "")));
      setMatches(confident);
      setQuoteNote(payload.note || (confident.length ? "Choose the exact stock, ETF or provider fund before adding it. Manual entries are allowed, but are clearly marked as manual." : "No confident match found."));
    } catch (error) {
      setQuoteNote(error instanceof Error ? error.message : "Investment search failed");
    } finally {
      setSearching(false);
    }
  }

  async function requestCoverage() {
    if (!searchQuery.trim()) return;
    setCoverageQueued("Queueing...");
    try {
      const response = await fetch("/api/investments/request-instrument-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, exchange, investmentAccountId: accountId }),
      });
      const payload = await response.json().catch(() => ({}));
      setCoverageQueued(payload.message || (response.ok ? "Coverage request queued. This usually takes 2–10 minutes; a placeholder is saved in this pot while LOOP researches it." : "Could not queue this yet."));
    } catch (error) {
      setCoverageQueued(error instanceof Error ? error.message : "Could not queue this yet.");
    }
  }

  function addManualHolding() {
    const clean = searchQuery.trim();
    const manual: QuoteCandidate = {
      price: 0,
      source: "Manual review",
      rawSymbol: clean.toUpperCase() || "MANUAL",
      assetName: clean || "Manual holding",
      exchange: exchange || "Manual",
      currency: "GBP",
      priceQuoteUnit: priceUnit,
      sourceUrl: null,
      assetType: "other",
      annualAssetFeePercent: 0,
      note: "Manual holding: no live/delayed ticker has been linked yet. Use this only when a quote search is not available.",
    };
    applyQuote(manual);
    setQuoteNote("Manual mode selected. This will not be treated as a tracked market ticker unless you add a supported ticker/exchange later.");
  }

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchHolding("auto");
    }, 550);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, exchange]);

  return (
    <form action={addInvestmentHolding} className="space-y-5">
      <label className="block">
        <span className="text-sm font-bold text-slate-700">Investment pot</span>
        <select name="investment_account_id" value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass} required>
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {item.provider}
            </option>
          ))}
        </select>
      </label>

      {/* Search step — unchanged from the original form. This part was
          already good UX (live debounced search, confidence-scored
          matches, manual/coverage fallback), so it's kept as-is rather
          than chopped into single-field screens. */}
      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Search first</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">Type a company, ETF full name, ETF ticker, fund name or ISIN.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchHolding();
              }
            }}
            className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-black outline-none ring-orange-500 transition focus:ring-2"
            placeholder="Search ticker, ETF full name, fund name or ISIN..."
          />
          <button
            type="button"
            onClick={() => void searchHolding()}
            disabled={searching || !searchQuery.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-3xl bg-slate-950 px-6 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </button>
        </div>
        <div className="mt-3">
          <label className="block max-w-xs">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Optional market / venue</span>
            <input value={exchange} onChange={(event) => setExchange(event.target.value.toUpperCase())} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase outline-none ring-orange-500 transition focus:ring-2" placeholder="e.g. LSE, NASDAQ" />
          </label>
        </div>
        {matches.length ? (
          <div className="mt-4 space-y-2">
            {matches.map((candidate, idx) => (
              <button
                type="button"
                key={`${candidate.rawSymbol}-${idx}`}
                onClick={() => applyQuote(candidate)}
                className={`w-full rounded-3xl border px-4 py-3 text-left transition ${quote?.rawSymbol === candidate.rawSymbol && quote?.assetName === candidate.assetName ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <div className="grid gap-3 md:grid-cols-[1.1fr_.8fr_.7fr_.7fr_.8fr] md:items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-500">Match</p>
                    <p className="font-black text-slate-950">{candidate.assetName || candidate.rawSymbol}</p>
                    {candidate.confidence !== undefined ? <p className="mt-1 text-[11px] font-black text-emerald-700">{Number(candidate.confidence).toFixed(0)}% match confidence</p> : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Ticker / ref</p>
                    <p className="font-black text-slate-950">{candidate.rawSymbol}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Type</p>
                    <p className="font-black capitalize text-slate-950">{candidate.assetType || "share"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Exchange</p>
                    <p className="font-black text-slate-950">{candidate.exchange || "Review"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Latest / fee</p>
                    <p className="font-black text-emerald-700">{candidate.price > 0 ? priceDisplayFromStored(candidate.price, candidate.priceQuoteUnit, candidate.currency || "GBP") : "Manual"}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
        {!searching && searchQuery.trim().length >= 3 && matches.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-950">No confident market match found</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void requestCoverage()} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                Add to database
              </button>
              <button type="button" onClick={addManualHolding} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">
                Continue manually
              </button>
            </div>
            {coverageQueued ? <p className="mt-3 text-xs font-bold text-amber-800">{coverageQueued}</p> : null}
          </div>
        ) : null}
        {quoteNote ? <p className="mt-3 text-sm font-semibold text-slate-500">{quoteNote}</p> : null}
      </div>

      <input type="hidden" name="ticker" value={ticker} />
      <input type="hidden" name="exchange" value={exchange} />
      <input type="hidden" name="asset_kind" value={assetKind} />
      <input type="hidden" name="isin" value={isin} />
      <input type="hidden" name="currency" value={quote?.currency || (priceUnit === "usd" ? "USD" : priceUnit === "eur" ? "EUR" : "GBP")} />
      <input type="hidden" name="source_url" value={sourceUrl} />

      {!selected ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">
          Select a search result to unlock price, fee and holding details.
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="mb-2 flex items-center gap-1.5">
              {DETAIL_STEPS.map((step, i) => (
                <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= detailStepIndex ? "bg-emerald-500" : "bg-slate-200"}`} />
              ))}
            </div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              {DETAIL_STEPS[detailStepIndex].label} · Step {detailStepIndex + 1} of {DETAIL_STEPS.length}
            </p>
          </div>

          <div style={{ display: currentDetailStep === "identify" ? "block" : "none" }} className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Stock / fund name</span>
              <input name="asset_name" value={assetName} onChange={(event) => setAssetName(event.target.value)} className={inputClass} placeholder="Gear4music" required />
            </label>
            <FormInput label="Group name" name="group_label" placeholder="Trading 212 Group A, AI, Global ETF" />
            <PriceUnitField value={priceUnit} onChange={setPriceUnit} />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Latest price / unit price</span>
              <input name="latest_price" value={latestPrice} onChange={(event) => setLatestPrice(event.target.value)} type="number" step="any" className={inputClass} placeholder={assetKind === "fund" ? "Provider unit price or leave 0" : "Search can fill this"} />
            </label>
            <MarketCurrencyHint exchange={exchange || quote?.exchange} priceUnit={priceUnit} nativeCurrency={quote?.currency} />
            <FormInput label="Price date" name="latest_price_date" type="date" defaultValue={today} />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Asset / fund fee % / year</span>
              <input name="annual_asset_fee_percent" value={annualAssetFee} onChange={(event) => setAnnualAssetFee(event.target.value)} type="number" step="any" className={inputClass} placeholder={assetKind === "fund" || assetKind === "etf" ? "OCF / ongoing charge" : "Usually 0 for individual shares"} />
            </label>
          </div>

          <div style={{ display: currentDetailStep === "holding" ? "block" : "none" }}>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Your holding</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setEntryMode("average")} className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "average" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>
                  Use average price
                </button>
                <button type="button" onClick={() => setEntryMode("lots")} className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "lots" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>
                  Enter purchase lots
                </button>
              </div>
              {entryMode === "average" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <FormInput label="Shares / units owned" name="units" type="number" step="any" required />
                  <FormInput label="Average purchase price" name="average_buy_price" type="number" step="any" />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-bold text-slate-700">Purchase lots</p>
                  {lotRows.map((row, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 md:grid-cols-4">
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Date</span>
                          <input name="purchase_lot_date" type="date" value={row.date} onChange={(event) => updateLot(index, "date", event.target.value)} className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Amount bought</span>
                          <input name="purchase_lot_units" type="number" step="any" value={row.units} onChange={(event) => updateLot(index, "units", event.target.value)} className={inputClass} placeholder="414.96" />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Purchase price</span>
                          <input name="purchase_lot_price" type="number" step="any" value={row.price} onChange={(event) => updateLot(index, "price", event.target.value)} className={inputClass} placeholder={priceUnit === "gbx" ? "241p" : "2.41"} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Total cost paid</span>
                          <input name="purchase_lot_total" type="number" step="any" value={row.total} onChange={(event) => updateLot(index, "total", event.target.value)} className={inputClass} placeholder="Includes FX/fees" />
                        </label>
                      </div>
                      <label className="mt-3 block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Note</span>
                        <input name="purchase_lot_note" value={row.note} onChange={(event) => updateLot(index, "note", event.target.value)} className={inputClass} placeholder="Initial buy, top-up, FX charge included" />
                      </label>
                    </div>
                  ))}
                  <button type="button" onClick={() => setLotRows((rows) => [...rows, { date: today, units: "", price: "", total: "", note: "" }])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
                    + Add another lot
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: currentDetailStep === "final" ? "block" : "none" }} className="space-y-4">
            <FormInput label="Target allocation % (optional)" name="target_allocation_percent" type="number" step="any" />
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
              <input type="checkbox" name="price_polling_enabled" defaultChecked /> Include in market price refresh
            </label>
            <FormInput
              label="Notes"
              name="notes"
              placeholder={account ? `Platform fee on ${account.provider}: ${Number(account.annual_platform_fee_percent || 0).toFixed(3)}%/yr + ${formatMoney(account.fixed_monthly_fee || 0)}/month` : "Notes"}
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setDetailStepIndex((i) => Math.max(0, i - 1))} disabled={detailStepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
              ← Back
            </button>
            {isLastDetailStep ? (
              <SubmitButton>Add holding</SubmitButton>
            ) : (
              <button type="button" onClick={() => setDetailStepIndex((i) => Math.min(DETAIL_STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
                Next →
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
