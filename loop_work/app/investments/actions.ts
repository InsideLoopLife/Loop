"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { findProvider } from "@/lib/investments/provider-glossary";
import { fetchInvestmentQuote, isYahooFundCode } from "@/lib/investments/market-data";
import { currencyForExchange, fxToGbp, quotePriceToGbp } from "@/lib/investments/fx";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { isAiFeatureEnabled, recordOpenAiUsageFromPayload } from "@/lib/ai/usage";

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function normalisedExchangeCode(exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ", "XNAS", "XNCM", "XNGS", "NCM"].includes(ex)) return "NASDAQ";
  if (["NYQ", "NYSE", "XNYS"].includes(ex)) return "NYSE";
  if (["ASE", "AMEX", "NYSEAMERICAN", "XASE"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "LSE", "XLSE", "LDN"].includes(ex)) return "LSE";
  if (["OTC", "OTCM", "OOTC"].includes(ex)) return "OTCM";
  if (["PINX", "PINK", "OTCPK"].includes(ex)) return "PINX";
  if (["XETR", "ETR", "XETRA", "IBIS", "DE"].includes(ex)) return "XETR";
  if (["XFRA", "FRA", "FRANKFURT", "F"].includes(ex)) return "XFRA";
  if (["XPAR", "PAR", "EPA", "PA"].includes(ex)) return "XPAR";
  if (["XAMS", "AMS", "AS"].includes(ex)) return "XAMS";
  if (["XMIL", "MIL", "MI"].includes(ex)) return "XMIL";
  if (["XSWX", "SWX", "SW"].includes(ex)) return "XSWX";
  if (["XTSE", "TSE", "TO", "TSX"].includes(ex)) return "XTSE";
  return ex;
}

function asPriceInputUnit(value: FormDataEntryValue | null) {
  const unit = String(value || "gbp").toLowerCase();
  return unit === "gbx" || unit === "pence" ? "gbx" : unit === "usd" ? "usd" : unit === "eur" ? "eur" : "gbp";
}

function priceFromInput(value: FormDataEntryValue | null, unitValue: FormDataEntryValue | null) {
  const number = parseNumber(value) ?? 0;
  const unit = asPriceInputUnit(unitValue);
  if (unit === "gbx") return number / 100;
  return number;
}

function looksLikeProviderFundUrl(value?: string | null) {
  const url = String(value || "").toLowerCase();
  return /factsheet|fund-centre|fundcentre|vanguardinvestor|fidelity|hl\.co\.uk\/funds|legalandgeneral|pensionbee/.test(url);
}

function isExchangeTradedAsset(assetKind?: string | null, exchange?: string | null) {
  const kind = String(assetKind || "share").toLowerCase();
  const ex = normalisedExchangeCode(exchange);
  return ["share", "etf"].includes(kind) && Boolean(ex) && !["VANGUARD", "YAHOO FUND", "FUND", "PROVIDER", "MANUAL", "REVIEW"].includes(ex);
}

function priceLooksWrongForKnownTicker(ticker?: string | null, exchange?: string | null, price?: number | null) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const ex = normalisedExchangeCode(exchange);
  const value = Number(price || 0);
  if (!value) return false;
  // NIO is a low-priced NYSE ADR; a 300+ value normally means a provider fund NAV/factsheet price leaked into a share row.
  if (symbol === "NIO" && ["NYSE", "US", ""].includes(ex) && value > 50) return true;
  return false;
}

function suspiciousStockPriceNote(ticker?: string | null, exchange?: string | null, price?: number | null, sourceUrl?: string | null) {
  if (!isExchangeTradedAsset("share", exchange)) return null;
  if (looksLikeProviderFundUrl(sourceUrl)) return `Reference/source looked like a provider fund page, not a stock quote for ${ticker || "this ticker"}. Use the quote search/refresh before relying on the price.`;
  if (priceLooksWrongForKnownTicker(ticker, exchange, price)) return "Ticker sanity check: price looks far above the expected exchange quote. The app will try a market refresh instead of trusting a provider factsheet value.";
  return null;
}

function currencyFromPriceUnit(value: FormDataEntryValue | null, explicitCurrency?: FormDataEntryValue | null) {
  const explicit = String(explicitCurrency || "").trim().toUpperCase();
  if (["GBP", "USD", "EUR"].includes(explicit)) return explicit;
  const unit = asPriceInputUnit(value);
  if (unit === "usd") return "USD";
  if (unit === "eur") return "EUR";
  return "GBP";
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim().replace(/^"|"$/g, ""));
  return cells;
}


function parseCsvRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ""; });
    return row;
  });
  return { headers, rows };
}

function rowValue(row: Record<string, string>, names: string[]) {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.toLowerCase().trim() === name.toLowerCase().trim());
    if (key) return row[key];
  }
  return "";
}

function looksLikeTrading212Holdings(headers: string[]) {
  const lower = headers.map((header) => header.toLowerCase());
  return lower.includes("slice") && lower.includes("invested value") && lower.includes("value") && lower.includes("owned quantity");
}

function likelyExchangeForTicker(ticker: string, existing?: string | null) {
  const ex = normalisedExchangeCode(existing);
  if (ex) return ex;
  const t = ticker.trim().toUpperCase();
  if (!t) return null;
  if (t.endsWith(".L")) return "LSE";
  // Trading 212 pie exports often use US tickers without exchange suffix.
  return "US";
}

function parsePurchaseLots(text: string, priceUnit: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line))
    .filter((cells) => cells.length >= 2 && !/^date$/i.test(cells[0]));

  return rows.map((cells) => {
    const [purchaseDate = new Date().toISOString().slice(0, 10), units = "0", price = "0", total = "", notes = ""] = cells;
    const lotUnits = parseNumber(units) ?? 0;
    const rawPrice = parseNumber(price) ?? 0;
    const purchasePrice = priceUnit === "gbx" ? rawPrice / 100 : rawPrice;
    const rawTotal = parseNumber(total);
    const calculatedTotal = lotUnits * purchasePrice;
    const totalCost = rawTotal !== null ? rawTotal : calculatedTotal;
    return { purchaseDate, units: lotUnits, purchasePrice, totalCost, fees: Math.max(0, totalCost - calculatedTotal), notes: notes || null };
  }).filter((lot) => lot.units > 0 && lot.purchasePrice >= 0);
}

function parseStructuredPurchaseLots(formData: FormData, priceUnit: string) {
  const dates = formData.getAll("purchase_lot_date").map((v) => String(v || "").trim());
  const unitsList = formData.getAll("purchase_lot_units").map((v) => String(v || "").trim());
  const prices = formData.getAll("purchase_lot_price").map((v) => String(v || "").trim());
  const totals = formData.getAll("purchase_lot_total").map((v) => String(v || "").trim());
  const notes = formData.getAll("purchase_lot_note").map((v) => String(v || "").trim());
  const max = Math.max(dates.length, unitsList.length, prices.length, totals.length, notes.length);
  const todayDate = new Date().toISOString().slice(0, 10);
  const lots = [];
  for (let index = 0; index < max; index += 1) {
    const units = parseNumber(unitsList[index]) ?? 0;
    const rawPrice = parseNumber(prices[index]) ?? 0;
    const purchasePrice = priceUnit === "gbx" ? rawPrice / 100 : rawPrice;
    const rawTotal = parseNumber(totals[index]);
    const calculatedTotal = units * purchasePrice;
    const totalCost = rawTotal !== null ? rawTotal : calculatedTotal;
    if (units <= 0 || purchasePrice < 0) continue;
    lots.push({
      purchaseDate: dates[index] || todayDate,
      units,
      purchasePrice,
      totalCost,
      fees: Math.max(0, totalCost - calculatedTotal),
      notes: notes[index] || null,
    });
  }
  return lots;
}

function weightedAverageFromLots(lots: { units: number; purchasePrice: number; totalCost?: number | null }[]) {
  const totalUnits = lots.reduce((sum, lot) => sum + lot.units, 0);
  const totalCost = lots.reduce((sum, lot) => sum + (lot.totalCost ?? (lot.units * lot.purchasePrice)), 0);
  return { totalUnits, averagePrice: totalUnits > 0 ? totalCost / totalUnits : 0, totalCost };
}

async function quotePricingForGbp(quote: Awaited<ReturnType<typeof fetchInvestmentQuote>> | null, fallbackExchange?: string | null) {
  if (!quote) return { gbpPrice: 0, nativePrice: null as number | null, nativeCurrency: null as string | null, fxRate: 1, fxSource: "manual" };
  const quoteUnit = String(quote.priceQuoteUnit || "").toLowerCase();
  const nativeCurrency = quoteUnit === "gbx" ? "GBX" : quote.currency || currencyForExchange(quote.exchange || fallbackExchange);
  const converted = await quotePriceToGbp(Number(quote.price || 0), nativeCurrency);
  return { gbpPrice: converted.gbpPrice, nativePrice: Number(quote.price || 0), nativeCurrency, fxRate: converted.fxRate, fxSource: converted.fxSource };
}

async function amountToGbp(amount: number, currency: string) {
  const fx = await fxToGbp(currency);
  return { value: Number(amount || 0) * fx.rate, rate: fx.rate, source: fx.source };
}

function normaliseTickerForProvider(ticker: string, exchange: string | null | undefined) {
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed) return "";
  if ((exchange || "").toUpperCase() === "LSE" && !trimmed.endsWith(".L")) return `${trimmed}.L`;
  return trimmed;
}

function normaliseTickersForStooq(ticker: string, exchange: string | null | undefined) {
  const trimmed = ticker.trim().toLowerCase().replace(/\.l$/i, "");
  if (!trimmed) return [];
  const ex = String(exchange || "").toUpperCase();
  if (ex === "LSE" || ticker.toUpperCase().endsWith(".L")) return [`${trimmed}.uk`];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [`${trimmed}.us`, trimmed];
  return [`${trimmed}.uk`, `${trimmed}.us`, trimmed];
}

function normaliseTickersForProvider(ticker: string, exchange: string | null | undefined) {
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed) return [];
  if (trimmed.includes(".")) return [trimmed];
  const ex = String(exchange || "").toUpperCase();
  if (ex === "LSE") return [`${trimmed}.L`, trimmed];
  return [`${trimmed}.L`, trimmed];
}

function looksLikeImage(file: File | null) {
  return Boolean(file && file.size > 0 && file.type.toLowerCase().startsWith("image/"));
}

async function extractHoldingsFromImage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, file: File) {
  const guard = isAiFeatureEnabled({ scope: "investment_holding_image_import" });
  if (!guard.allowed) return "";

  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return "";

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extract investment holdings from this screenshot. Return CSV only with columns: Name,Ticker,Exchange,Units,Average Buy Price,Latest Price,Group. If a value is missing, leave the cell blank. Use LSE for UK listed shares when implied." },
          { type: "input_image", image_url: dataUrl },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  await recordOpenAiUsageFromPayload(supabase, payload, {
    model,
    scope: "investment_holding_image_import",
    component: "investment_import_action",
    userId,
    usedWebSearch: false,
    metadata: { fileType: file.type, fileSize: file.size, ok: response.ok, status: response.status },
  });
  if (!response.ok) return "";
  return String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "");
}


async function findFundGlossaryMatch(supabase: Awaited<ReturnType<typeof createClient>>, fundName: string, providerName?: string | null) {
  const cleaned = fundName.trim();
  if (!cleaned) return null;

  const provider = providerName ? findProvider(providerName) : null;
  let investmentQuery = supabase
    .from("investment_provider_fund_glossary")
    .select("provider_id, fund_name, fund_code, group_label, annual_fund_fee_percent, unit_price, unit_price_quote_unit, source_url, confidence")
    .ilike("fund_name", `%${cleaned}%`)
    .order("confidence", { ascending: false })
    .limit(1);
  if (provider?.id) investmentQuery = investmentQuery.eq("provider_id", provider.id);

  const investmentResult = await investmentQuery.maybeSingle();
  if (!investmentResult.error && investmentResult.data) {
    const data = investmentResult.data;
    const rawPrice = Number(data.unit_price || 0);
    const priceUnit = String(data.unit_price_quote_unit || "GBP").toUpperCase();
    const unitPriceGbp = rawPrice > 0 && (priceUnit === "GBX" || priceUnit.includes("PENCE")) ? rawPrice / 100 : rawPrice;
    return {
      provider: data.provider_id,
      fund_name: data.fund_name,
      fund_code: data.fund_code,
      isin: data.fund_code,
      group_label: data.group_label,
      fund_fee_percent: data.annual_fund_fee_percent,
      latest_unit_price: data.unit_price,
      latest_unit_price_date: null,
      price_unit: data.unit_price_quote_unit,
      source_url: data.source_url,
      factsheet_url: data.source_url,
      confidence: data.confidence,
      unitPriceGbp,
    };
  }

  let legacyQuery = supabase
    .from("provider_fund_glossary")
    .select("provider, fund_name, fund_code, isin, group_label, fund_fee_percent, latest_unit_price, latest_unit_price_date, price_unit, source_url, factsheet_url, confidence")
    .ilike("fund_name", `%${cleaned}%`)
    .order("confidence", { ascending: false })
    .limit(1);

  if (providerName) legacyQuery = legacyQuery.ilike("provider", `%${providerName}%`);
  const { data, error } = await legacyQuery.maybeSingle();
  if (error || !data) return null;

  const rawPrice = Number(data.latest_unit_price || 0);
  const priceUnit = String(data.price_unit || "GBP").toUpperCase();
  const unitPriceGbp = rawPrice > 0 && (priceUnit === "GBX" || priceUnit.includes("PENCE")) ? rawPrice / 100 : rawPrice;
  return { ...data, unitPriceGbp };
}

async function getPensionAccountProvider(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, accountId: string) {
  const { data } = await supabase
    .from("pension_accounts")
    .select("provider")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.provider ?? null;
}

async function getMarketDataEntitlement(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("app_user_profiles")
    .select("payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return investmentDataEntitlementForProfile(data);
}

async function fetchQuote(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, ticker: string, exchange?: string | null) {
  const entitlement = await getMarketDataEntitlement(supabase, userId);
  if (!entitlement.canUseDelayedPrices && !entitlement.canUseRealtimePrices && !entitlement.canUseAiInstrumentSearch) return null;
  const quote = await fetchInvestmentQuote(supabase, userId, ticker, exchange);
  if (quote) {
    await supabase.from("app_market_data_usage").insert({
      user_id: userId,
      feature: "investment_quote_lookup",
      symbol: quote.rawSymbol || ticker,
      provider: quote.source || "unknown",
      market_data_tier: entitlement.marketDataTier,
      request_count: 1,
      cost_estimate_gbp: entitlement.canUseRealtimePrices ? 0.01 : 0,
    });
  }
  return quote;
}

export async function addPensionAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const providerName = String(formData.get("provider") || "Provider");
  const provider = findProvider(providerName);
  const hasNiTopup = formData.get("employer_ni_topup_enabled") === "on";
  const platformFee = parseNumber(formData.get("annual_platform_fee_percent")) ?? provider?.defaultAnnualPlatformFeePercent ?? 0;
  const fixedFee = parseNumber(formData.get("fixed_monthly_fee")) ?? provider?.defaultFixedMonthlyFee ?? 0;
  const { error } = await supabase.from("pension_accounts").insert({
    user_id: user.id,
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Company pension"),
    provider: provider?.name || providerName,
    pension_type: String(formData.get("pension_type") || "work"),
    contribution_method: String(formData.get("contribution_method") || "salary_sacrifice"),
    employee_contribution_percent: parseNumber(formData.get("employee_contribution_percent")) ?? 0,
    employer_contribution_percent: parseNumber(formData.get("employer_contribution_percent")) ?? 0,
    employer_ni_topup_enabled: hasNiTopup,
    employer_ni_topup_percent: hasNiTopup ? (parseNumber(formData.get("employer_ni_topup_percent")) ?? 0) : 0,
    fixed_monthly_contribution: parseNumber(formData.get("fixed_monthly_contribution")) ?? 0,
    annual_platform_fee_percent: platformFee,
    fixed_monthly_fee: fixedFee,
    current_value: parseNumber(formData.get("current_value")) ?? 0,
    value_as_of_date: String(formData.get("value_as_of_date") || new Date().toISOString().slice(0, 10)),
    source_url: nullableString(formData.get("source_url")),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}


export async function updatePensionAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Choose a pension pot to update.");
  const providerName = String(formData.get("provider") || "Provider");
  const provider = findProvider(providerName);
  const hasNiTopup = formData.get("employer_ni_topup_enabled") === "on";
  const platformFee = parseNumber(formData.get("annual_platform_fee_percent")) ?? provider?.defaultAnnualPlatformFeePercent ?? 0;
  const fixedFee = parseNumber(formData.get("fixed_monthly_fee")) ?? provider?.defaultFixedMonthlyFee ?? 0;
  const contributionFrequency = String(formData.get("contribution_frequency") || "monthly");
  const safeFrequency = ["weekly", "fortnightly", "monthly", "quarterly", "annual", "manual"].includes(contributionFrequency) ? contributionFrequency : "monthly";
  const { error } = await supabase.from("pension_accounts").update({
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Company pension"),
    provider: provider?.name || providerName,
    pension_type: String(formData.get("pension_type") || "work"),
    contribution_method: String(formData.get("contribution_method") || "salary_sacrifice"),
    employee_contribution_percent: parseNumber(formData.get("employee_contribution_percent")) ?? 0,
    employer_contribution_percent: parseNumber(formData.get("employer_contribution_percent")) ?? 0,
    employer_ni_topup_enabled: hasNiTopup,
    employer_ni_topup_percent: hasNiTopup ? (parseNumber(formData.get("employer_ni_topup_percent")) ?? 0) : 0,
    fixed_monthly_contribution: parseNumber(formData.get("fixed_monthly_contribution")) ?? 0,
    annual_platform_fee_percent: platformFee,
    fixed_monthly_fee: fixedFee,
    current_value: parseNumber(formData.get("current_value")) ?? 0,
    value_as_of_date: String(formData.get("value_as_of_date") || new Date().toISOString().slice(0, 10)),
    source_url: nullableString(formData.get("source_url")),
    notes: nullableString(formData.get("notes")),
    contribution_frequency: safeFrequency,
    contribution_day: parseNumber(formData.get("contribution_day")) ?? null,
    contribution_paused: formData.get("contribution_paused") === "on",
    contribution_started_on: nullableString(formData.get("contribution_started_on")),
    contribution_ended_on: nullableString(formData.get("contribution_ended_on")),
    valuation_mode: String(formData.get("valuation_mode") || providerValuationModeForAction(providerName)),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

function providerValuationModeForAction(providerName: string) {
  const provider = findProvider(providerName);
  const notes = `${provider?.notes || ""} ${providerName}`.toLowerCase();
  if (/pensionbee|nest|people.s pension|standard life|aviva|legal|l&g|vanguard|provider value|pot value/.test(notes)) return "provider_value";
  return "fund_units";
}

export async function addPensionFund(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("pension_account_id") || "");
  if (!accountId) throw new Error("Choose a pension account first.");

  const units = parseNumber(formData.get("units"));
  const enteredUnitPrice = parseNumber(formData.get("unit_price"));
  const enteredFee = parseNumber(formData.get("annual_fund_fee_percent"));
  const providerName = await getPensionAccountProvider(supabase, user.id, accountId);
  const glossary = await findFundGlossaryMatch(supabase, String(formData.get("fund_name") || ""), providerName);
  const unitPrice = enteredUnitPrice ?? (glossary?.unitPriceGbp && glossary.unitPriceGbp > 0 ? glossary.unitPriceGbp : null);
  const fundFee = enteredFee ?? (glossary?.fund_fee_percent !== null && glossary?.fund_fee_percent !== undefined ? Number(glossary.fund_fee_percent) : 0);
  const enteredValue = parseNumber(formData.get("current_value"));
  const currentValue = enteredValue ?? (units && unitPrice ? units * unitPrice : 0);

  const { error } = await supabase.from("pension_funds").insert({
    user_id: user.id,
    pension_account_id: accountId,
    fund_name: glossary?.fund_name || String(formData.get("fund_name") || "Pension fund"),
    fund_code: nullableString(formData.get("fund_code")) || glossary?.fund_code || glossary?.isin || null,
    group_label: nullableString(formData.get("group_label")) || glossary?.group_label || null,
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    monthly_contribution_percent: parseNumber(formData.get("monthly_contribution_percent")) ?? 0,
    contribution_active: formData.get("contribution_active") === "on",
    current_value: currentValue,
    units,
    unit_price: unitPrice,
    annual_fund_fee_percent: fundFee,
    price_as_of_date: String(formData.get("price_as_of_date") || glossary?.latest_unit_price_date || new Date().toISOString().slice(0, 10)),
    fee_source_url: nullableString(formData.get("fee_source_url")) || glossary?.factsheet_url || glossary?.source_url || null,
    notes: nullableString(formData.get("notes")) || (glossary ? `Auto-filled from provider glossary at ${Math.round(Number(glossary.confidence || 0) * 100)}% confidence. Source-backed value; can be refreshed by provider cron.` : null),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function updatePensionFund(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  const units = parseNumber(formData.get("units"));
  const enteredUnitPrice = parseNumber(formData.get("unit_price"));
  const enteredFee = parseNumber(formData.get("annual_fund_fee_percent"));
  const glossary = await findFundGlossaryMatch(supabase, String(formData.get("fund_name") || ""), null);
  const unitPrice = enteredUnitPrice ?? (glossary?.unitPriceGbp && glossary.unitPriceGbp > 0 ? glossary.unitPriceGbp : null);
  const fundFee = enteredFee ?? (glossary?.fund_fee_percent !== null && glossary?.fund_fee_percent !== undefined ? Number(glossary.fund_fee_percent) : 0);
  const enteredValue = parseNumber(formData.get("current_value"));
  const currentValue = enteredValue ?? (units && unitPrice ? units * unitPrice : 0);
  const { error } = await supabase.from("pension_funds").update({
    fund_name: String(formData.get("fund_name") || "Pension fund"),
    fund_code: nullableString(formData.get("fund_code")),
    group_label: nullableString(formData.get("group_label")),
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    monthly_contribution_percent: parseNumber(formData.get("monthly_contribution_percent")) ?? 0,
    contribution_active: formData.get("contribution_active") === "on",
    current_value: currentValue,
    units,
    unit_price: unitPrice,
    annual_fund_fee_percent: fundFee,
    price_as_of_date: String(formData.get("price_as_of_date") || glossary?.latest_unit_price_date || new Date().toISOString().slice(0, 10)),
    fee_source_url: nullableString(formData.get("fee_source_url")) || glossary?.factsheet_url || glossary?.source_url || null,
    notes: nullableString(formData.get("notes")) || (glossary ? `Auto-refreshed from provider glossary at ${Math.round(Number(glossary.confidence || 0) * 100)}% confidence.` : null),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function addInvestmentAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const providerName = String(formData.get("provider") || "Provider");
  const provider = findProvider(providerName);
  const platformFee = parseNumber(formData.get("annual_platform_fee_percent")) ?? provider?.defaultAnnualPlatformFeePercent ?? 0;
  const fixedFee = parseNumber(formData.get("fixed_monthly_fee")) ?? provider?.defaultFixedMonthlyFee ?? 0;
  const { error } = await supabase.from("investment_accounts").insert({
    user_id: user.id,
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Investment account"),
    provider: provider?.name || providerName,
    account_type: String(formData.get("account_type") || "gia"),
    annual_platform_fee_percent: platformFee,
    fixed_monthly_fee: fixedFee,
    notes: nullableString(formData.get("notes")) || provider?.notes || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
}

export async function updateInvestmentAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Choose an investment pot to update.");
  const providerName = String(formData.get("provider") || "Provider");
  const provider = findProvider(providerName);
  const { error } = await supabase.from("investment_accounts").update({
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Investment account"),
    provider: provider?.name || providerName,
    account_type: String(formData.get("account_type") || "gia"),
    annual_platform_fee_percent: parseNumber(formData.get("annual_platform_fee_percent")) ?? 0,
    fixed_monthly_fee: parseNumber(formData.get("fixed_monthly_fee")) ?? 0,
    provider_cash_value: parseNumber(formData.get("provider_cash_value")),
    provider_investable_cash_value: parseNumber(formData.get("provider_investable_cash_value")),
    provider_dividend_cash_value: parseNumber(formData.get("provider_dividend_cash_value")),
    provider_cash_source: "manual_override",
    provider_isa_subscribed_amount: parseNumber(formData.get("provider_isa_subscribed_amount")),
    provider_isa_remaining_amount: parseNumber(formData.get("provider_isa_remaining_amount")),
    provider_isa_allowance_year: nullableString(formData.get("provider_isa_allowance_year")),
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function updateInvestmentAccountOwners(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "");
  if (!accountId) throw new Error("Choose an investment pot.");
  const selected = Array.from(new Set(formData.getAll("owner_person_ids").map((value) => String(value || "").trim()).filter(Boolean)));

  const { error: accountError } = await supabase.from("investment_accounts").update({
    person_id: selected[0] || null,
    updated_at: new Date().toISOString(),
  }).eq("id", accountId).eq("user_id", user.id);
  if (accountError) throw new Error(accountError.message);

  const { error: deleteError } = await supabase.from("investment_account_owners").delete().eq("investment_account_id", accountId).eq("user_id", user.id);
  if (deleteError) throw new Error(deleteError.message);

  if (selected.length) {
    const rows = selected.map((personId) => ({ user_id: user.id, investment_account_id: accountId, person_id: personId }));
    const { error: insertError } = await supabase.from("investment_account_owners").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function updateInvestmentPieSetting(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "").trim();
  const groupLabel = String(formData.get("group_label") || "").trim();
  if (!accountId || !groupLabel) throw new Error("Choose a pie/group to update.");
  const frequency = String(formData.get("reinvest_frequency") || "monthly");
  const safeFrequency = ["weekly", "fortnightly", "monthly", "quarterly"].includes(frequency) ? frequency : "monthly";
  const { error } = await supabase.from("investment_pie_settings").upsert({
    user_id: user.id,
    investment_account_id: accountId,
    group_label: groupLabel,
    monthly_reinvest_amount: parseNumber(formData.get("monthly_reinvest_amount")) ?? 0,
    reinvest_frequency: safeFrequency,
    expected_dividend_yield_percent: parseNumber(formData.get("expected_dividend_yield_percent")) ?? 0,
    auto_reinvest_dividends: formData.get("auto_reinvest_dividends") === "on",
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,investment_account_id,group_label" });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
}

export async function updateInvestmentViewMode(formData: FormData) {
  const { supabase, user } = await currentUser();
  const mode = String(formData.get("investment_view_mode") || "lines") === "squares" ? "squares" : "lines";
  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    email: user.email || null,
    investment_view_mode: mode,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
}

export async function addInvestmentHolding(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "");
  if (!accountId) throw new Error("Choose an investment account first.");

  const priceUnit = asPriceInputUnit(formData.get("price_input_unit"));
  const ticker = nullableString(formData.get("ticker"));
  const exchange = nullableString(formData.get("exchange"));
  const yahooFundCode = ticker ? isYahooFundCode(ticker) : false;
  const lotsText = String(formData.get("purchase_lots") || "").trim();
  const structuredLots = parseStructuredPurchaseLots(formData, priceUnit);
  const lots = structuredLots.length ? structuredLots : parsePurchaseLots(lotsText, priceUnit);
  const weighted = weightedAverageFromLots(lots);

  const enteredUnits = parseNumber(formData.get("units")) ?? 0;
  const units = weighted.totalUnits > 0 ? weighted.totalUnits : enteredUnits;

  const inputLatest = parseNumber(formData.get("latest_price"));
  const quote = inputLatest === null && ticker ? await fetchQuote(supabase, user.id, ticker, exchange) : null;
  const quotePricing = await quotePricingForGbp(quote, exchange);
  const manualCurrency = currencyFromPriceUnit(formData.get("price_input_unit"), formData.get("currency"));
  const manualFx = await fxToGbp(manualCurrency);
  const latestPrice = inputLatest === null && quote ? quotePricing.gbpPrice : priceFromInput(formData.get("latest_price"), formData.get("price_input_unit")) * manualFx.rate;
  const avgPrice = weighted.totalUnits > 0 ? weighted.averagePrice * manualFx.rate : priceFromInput(formData.get("average_buy_price"), formData.get("price_input_unit")) * manualFx.rate;
  const priceDate = String(formData.get("latest_price_date") || new Date().toISOString().slice(0, 10));
  const sourceUrl = nullableString(formData.get("source_url"));
  const assetKind = String(formData.get("asset_kind") || quote?.assetType || "share");

  const suspiciousNote = suspiciousStockPriceNote(ticker, exchange, latestPrice, sourceUrl);
  const safeSourceUrl = isExchangeTradedAsset(assetKind, exchange) && looksLikeProviderFundUrl(sourceUrl) ? null : sourceUrl;

  const holdingPayload = {
    user_id: user.id,
    investment_account_id: accountId,
    asset_name: String(formData.get("asset_name") || ticker || "Holding"),
    ticker,
    exchange: quote?.exchange || (yahooFundCode ? "Yahoo Fund" : exchange),
    group_label: nullableString(formData.get("group_label")),
    units,
    average_buy_price: avgPrice,
    latest_price: latestPrice,
    latest_price_date: priceDate,
    currency: "GBP",
    price_quote_unit: yahooFundCode ? "gbp" : quote?.priceQuoteUnit || (quote?.exchange === "LSE" ? "gbx" : priceUnit),
    asset_kind: yahooFundCode ? "fund" : assetKind,
    isin: nullableString(formData.get("isin")) || quote?.isin || null,
    annual_asset_fee_percent: parseNumber(formData.get("annual_asset_fee_percent")) ?? quote?.annualAssetFeePercent ?? 0,
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    source_url: safeSourceUrl || (quote ? `market-data:${quote.source}:${quote.rawSymbol}` : null),
    native_latest_price: quote ? quotePricing.nativePrice : inputLatest,
    native_currency: quote ? quotePricing.nativeCurrency : (priceUnit === "gbx" ? "GBX" : manualCurrency),
    native_exchange: quote?.exchange || exchange,
    price_polling_enabled: formData.get("price_polling_enabled") !== "off",
    import_source_type: null,
    notes: [suspiciousNote, nullableString(formData.get("notes")) || (lots.length ? `Built from ${lots.length} purchase lot(s).` : quote ? "Price auto-filled from delayed/token quote at add time." : null)].filter(Boolean).join("\n") || null,
  };

  let insertResult = await supabase.from("investment_holdings").insert(holdingPayload).select("id").single();
  if (insertResult.error && /asset_kind/i.test(insertResult.error.message || "")) {
    const { asset_kind: _assetKind, ...legacyPayload } = holdingPayload;
    insertResult = await supabase.from("investment_holdings").insert(legacyPayload).select("id").single();
  }
  const { data, error } = insertResult;
  if (error) throw new Error(error.message);

  if (data?.id && lots.length) {
    await supabase.from("investment_purchase_lots").insert(lots.map((lot) => ({
      user_id: user.id,
      holding_id: data.id,
      purchase_date: lot.purchaseDate || priceDate,
      units: lot.units,
      purchase_price: lot.purchasePrice * manualFx.rate,
      total_cost: (lot.totalCost ?? (lot.units * lot.purchasePrice)) * manualFx.rate,
      fees: (lot.fees ?? 0) * manualFx.rate,
      price_quote_unit: priceUnit,
      currency: "GBP",
      notes: lot.notes,
    })));
  }

  if (data?.id) {
    await supabase.from("investment_price_snapshots").insert({
      user_id: user.id,
      holding_id: data.id,
      price: latestPrice,
      units,
      value: units * latestPrice,
      snapshot_date: priceDate,
      snapshot_at: new Date().toISOString(),
      source: quote?.source || "manual",
    });
  }
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function updateInvestmentHolding(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  const units = parseNumber(formData.get("units")) ?? 0;
  const priceUnit = asPriceInputUnit(formData.get("price_input_unit"));
  const manualCurrency = currencyFromPriceUnit(formData.get("price_input_unit"), formData.get("currency"));
  const manualFx = await fxToGbp(manualCurrency);
  const enteredLatestPrice = priceFromInput(formData.get("latest_price"), formData.get("price_input_unit")) * manualFx.rate;
  const avgPrice = priceFromInput(formData.get("average_buy_price"), formData.get("price_input_unit")) * manualFx.rate;
  const priceDate = String(formData.get("latest_price_date") || new Date().toISOString().slice(0, 10));
  const updateTicker = nullableString(formData.get("ticker"));
  const updateExchange = nullableString(formData.get("exchange"));
  const updateAssetKind = String(formData.get("asset_kind") || "share");
  const updateYahooFundCode = updateTicker ? isYahooFundCode(updateTicker) : false;
  const updateSourceUrl = nullableString(formData.get("source_url"));
  const exchangeTraded = isExchangeTradedAsset(updateAssetKind, updateExchange);
  const sourceLooksLikeFund = exchangeTraded && looksLikeProviderFundUrl(updateSourceUrl);
  const priceLooksWrong = priceLooksWrongForKnownTicker(updateTicker, updateExchange, enteredLatestPrice);
  const repairQuote = updateTicker && !updateYahooFundCode && (sourceLooksLikeFund || priceLooksWrong)
    ? await fetchQuote(supabase, user.id, updateTicker, updateExchange).catch(() => null)
    : null;
  const repairPricing = await quotePricingForGbp(repairQuote, updateExchange);
  const latestPrice = repairQuote ? repairPricing.gbpPrice : enteredLatestPrice;
  const safeUpdateSourceUrl = sourceLooksLikeFund ? null : updateSourceUrl;
  const updateSuspiciousNote = suspiciousStockPriceNote(updateTicker, updateExchange, latestPrice, updateSourceUrl);
  const repairNote = repairQuote ? `Market quote repair used ${repairQuote.source} ${repairQuote.rawSymbol}; provider/factsheet source was ignored for this exchange-traded holding.` : null;
  const holdingPayload = {
    asset_name: String(formData.get("asset_name") || "Holding"),
    ticker: updateTicker,
    exchange: updateYahooFundCode ? "Yahoo Fund" : (repairQuote?.exchange || updateExchange),
    group_label: nullableString(formData.get("group_label")),
    units,
    average_buy_price: avgPrice,
    latest_price: latestPrice,
    latest_price_date: priceDate,
    currency: "GBP",
    price_quote_unit: updateYahooFundCode ? "gbp" : (repairQuote?.priceQuoteUnit || priceUnit),
    native_latest_price: repairQuote ? repairPricing.nativePrice : parseNumber(formData.get("latest_price")),
    native_currency: repairQuote ? repairPricing.nativeCurrency : (priceUnit === "gbx" ? "GBX" : manualCurrency),
    native_exchange: updateYahooFundCode ? "Yahoo Fund" : (repairQuote?.exchange || updateExchange),
    asset_kind: updateYahooFundCode ? "fund" : updateAssetKind,
    isin: nullableString(formData.get("isin")) || repairQuote?.isin || null,
    annual_asset_fee_percent: parseNumber(formData.get("annual_asset_fee_percent")) ?? repairQuote?.annualAssetFeePercent ?? 0,
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    source_url: safeUpdateSourceUrl || (repairQuote ? `market-data:${repairQuote.source}:${repairQuote.rawSymbol}` : null),
    price_polling_enabled: formData.get("price_polling_enabled") !== "off",
    notes: [updateSuspiciousNote, repairNote, nullableString(formData.get("notes"))].filter(Boolean).join("\n") || null,
    updated_at: new Date().toISOString(),
  };

  let updateResult = await supabase.from("investment_holdings").update(holdingPayload).eq("id", id).eq("user_id", user.id);
  if (updateResult.error && /asset_kind/i.test(updateResult.error.message || "")) {
    const { asset_kind: _assetKind, ...legacyPayload } = holdingPayload;
    updateResult = await supabase.from("investment_holdings").update(legacyPayload).eq("id", id).eq("user_id", user.id);
  }
  const { error } = updateResult;
  if (error) throw new Error(error.message);
  await supabase.from("investment_price_snapshots").insert({
    user_id: user.id,
    holding_id: id,
    price: latestPrice,
    units,
    value: units * latestPrice,
    snapshot_date: priceDate,
    snapshot_at: new Date().toISOString(),
    source: repairQuote?.source || "manual",
  });
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}


export async function updateInvestmentHoldingGroups(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "").trim();
  if (!accountId) throw new Error("Choose an investment pot.");
  const holdingIds = formData.getAll("holding_id").map((value) => String(value || "").trim());
  const labels = formData.getAll("group_label").map((value) => String(value || "").trim());
  const labelsById = new Map<string, string | null>();
  holdingIds.forEach((id, index) => {
    if (!id) return;
    const label = labels[index] || "";
    labelsById.set(id, label.length ? label.slice(0, 120) : null);
  });
  if (!labelsById.size) throw new Error("No holdings were supplied for pie mapping.");
  const { data: owned, error: ownedError } = await supabase
    .from("investment_holdings")
    .select("id")
    .eq("user_id", user.id)
    .eq("investment_account_id", accountId)
    .in("id", Array.from(labelsById.keys()));
  if (ownedError) throw new Error(ownedError.message);
  const ownedIds = new Set((owned || []).map((row: any) => String(row.id)));
  for (const [id, label] of labelsById.entries()) {
    if (!ownedIds.has(id)) continue;
    const { error } = await supabase
      .from("investment_holdings")
      .update({ group_label: label, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("investment_account_id", accountId);
    if (error) throw new Error(error.message);
  }
  await supabase.from("investment_pie_settings").upsert(
    Array.from(new Set(Array.from(labelsById.values()).filter(Boolean))).map((groupLabel) => ({
      user_id: user.id,
      investment_account_id: accountId,
      group_label: groupLabel,
      monthly_reinvest_amount: 0,
      reinvest_frequency: "monthly",
      expected_dividend_yield_percent: 0,
      auto_reinvest_dividends: false,
      notes: "Created from manual pie/group organiser.",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,investment_account_id,group_label" },
  ).then(() => null, () => null);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function refreshInvestmentHoldingPrice(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  const { data: holding, error: readError } = await supabase
    .from("investment_holdings")
    .select("id, ticker, exchange, units, notes, listing_id, instrument_id, asset_name, asset_kind, isin")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!holding?.ticker) {
    await supabase.from("investment_holdings").update({ notes: "Price check skipped: add a ticker first.", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    revalidatePath("/investments");
    return;
  }

  const checkedAt = new Date();
  const checkedAtIso = checkedAt.toISOString();
  const snapshotMinute = new Date(checkedAt.getTime());
  snapshotMinute.setUTCSeconds(0, 0);
  const snapshotMinuteIso = snapshotMinute.toISOString();
  const today = checkedAtIso.slice(0, 10);
  const ticker = String(holding.ticker || "").trim().toUpperCase();
  const exchange = normalisedExchangeCode(holding.exchange);

  const quote = await fetchQuote(supabase, user.id, ticker, exchange);
  if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) {
    const existing = String(holding.notes || "");
    const note = `Price check could not find a quote for ${ticker}${exchange ? ` · ${exchange}` : ""} at ${checkedAtIso}. Added/left as coverage review so LOOP can map the correct venue/provider source.`;
    await supabase.from("investment_holdings").update({
      notes: existing.includes(note) ? existing : [existing, note].filter(Boolean).join("\n"),
      last_price_check_at: checkedAtIso,
      price_check_status: "quote_not_found",
      instrument_resolution_status: "needs_review",
      instrument_resolution_notes: "Manual refresh could not resolve a live/delayed quote.",
      updated_at: checkedAtIso,
    }).eq("id", id).eq("user_id", user.id);
    revalidatePath("/investments");
    return;
  }

  const units = Number(holding.units || 0);
  const quotePricing = await quotePricingForGbp(quote, exchange);
  const nativeCurrency = String(quotePricing.nativeCurrency || quote.currency || "GBP").toUpperCase();
  const nativePrice = Number(quotePricing.nativePrice || quote.price || 0);
  const fxRate = Number(quotePricing.fxRate || 1);
  const gbpPrice = Number(quotePricing.gbpPrice || 0);

  let previousClose: any = null;
  let previousQuery = supabase
    .from("investment_instrument_price_points")
    .select("gbp_price,price_gbp,native_price,native_currency,point_at,observed_at,price_minute,fx_rate_to_gbp")
    .lt("point_date", today)
    .order("point_at", { ascending: false })
    .limit(1);
  if (holding.listing_id) previousQuery = previousQuery.eq("listing_id", holding.listing_id);
  else previousQuery = previousQuery.eq("ticker", ticker).eq("exchange_code", exchange || "");
  const previousResult = await previousQuery.maybeSingle();
  previousClose = previousResult.data || null;

  const previousCloseGbp = Number(previousClose?.gbp_price ?? previousClose?.price_gbp ?? 0);
  const previousCloseNative = Number(previousClose?.native_price ?? 0);
  const previousCloseAt = previousClose?.point_at || previousClose?.observed_at || previousClose?.price_minute || null;
  const dayChangeGbp = previousCloseGbp > 0 ? gbpPrice - previousCloseGbp : null;
  const dayChangePercent = previousCloseGbp > 0 ? ((gbpPrice - previousCloseGbp) / previousCloseGbp) * 100 : null;
  const dayChangeNative = previousCloseNative > 0 ? nativePrice - previousCloseNative : null;
  const dayChangeNativePercent = previousCloseNative > 0 ? ((nativePrice - previousCloseNative) / previousCloseNative) * 100 : null;

  if (holding.listing_id) {
    await supabase.from("investment_instrument_price_points").upsert({
      listing_id: holding.listing_id,
      instrument_id: holding.instrument_id,
      ticker,
      exchange_code: exchange || quote.exchange || "",
      price_gbp: gbpPrice,
      gbp_price: gbpPrice,
      native_price: nativePrice,
      native_currency: nativeCurrency,
      quote_unit: quote.priceQuoteUnit || nativeCurrency.toLowerCase(),
      fx_rate_to_gbp: fxRate,
      point_at: checkedAtIso,
      observed_at: checkedAtIso,
      price_minute: snapshotMinuteIso,
      point_date: today,
      source: `${quote.source}; ${quotePricing.fxSource}`,
      source_url: quote.sourceUrl || null,
      source_confidence: quote.confidence || 85,
      quality: "manual-check",
      bucket_interval: "raw",
    } as any, { onConflict: "listing_id,price_minute" }).then(() => null, () => null);
  }

  const { error } = await supabase.from("investment_holdings").update({
    latest_price: gbpPrice,
    latest_price_date: today,
    currency: "GBP",
    native_latest_price: nativePrice,
    native_currency: nativeCurrency,
    native_exchange: quote.exchange || exchange,
    latest_fx_rate_to_gbp: fxRate,
    latest_fx_source: quotePricing.fxSource,
    previous_close_price_gbp: previousCloseGbp || null,
    previous_close_native_price: previousCloseNative || null,
    previous_close_native_currency: previousClose?.native_currency || nativeCurrency,
    previous_close_at: previousCloseAt,
    day_change_gbp: dayChangeGbp,
    day_change_percent: dayChangePercent,
    day_change_native: dayChangeNative,
    day_change_native_percent: dayChangeNativePercent,
    source_url: quote.sourceUrl || `market-data:${quote.source}:${quote.rawSymbol}`,
    last_price_check_at: checkedAtIso,
    price_check_status: "ok",
    updated_at: checkedAtIso,
  } as any).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await supabase.from("investment_price_snapshots").upsert({
    user_id: user.id,
    holding_id: id,
    instrument_id: holding.instrument_id,
    listing_id: holding.listing_id,
    price: gbpPrice,
    units,
    value: units * gbpPrice,
    native_price: nativePrice,
    native_value: units * nativePrice,
    native_currency: nativeCurrency,
    fx_rate_to_gbp: fxRate,
    fx_source: quotePricing.fxSource,
    previous_close_price_gbp: previousCloseGbp || null,
    previous_close_native_price: previousCloseNative || null,
    previous_close_at: previousCloseAt,
    day_change_gbp: dayChangeGbp,
    day_change_percent: dayChangePercent,
    day_change_native: dayChangeNative,
    day_change_native_percent: dayChangeNativePercent,
    snapshot_date: today,
    snapshot_at: checkedAtIso,
    snapshot_minute: snapshotMinuteIso,
    source: `${quote.source}; ${quotePricing.fxSource}`,
    bucket_interval: "manual-check",
  } as any, { onConflict: "user_id,holding_id,snapshot_minute" });

  revalidatePath("/investments");
  revalidatePath("/net-worth");
}




export async function refreshAllInvestmentPrices(formData?: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = formData ? nullableString(formData.get("investment_account_id")) : null;
  let query = supabase
    .from("investment_holdings")
    .select("id, ticker, exchange, units, notes, investment_account_id")
    .eq("user_id", user.id)
    .not("ticker", "is", null)
    .neq("ticker", "");
  if (accountId) query = query.eq("investment_account_id", accountId);

  const { data: holdings, error: readError } = await query;
  if (readError) throw new Error(readError.message);

  const todayDate = new Date().toISOString().slice(0, 10);
  const checkedAt = new Date().toISOString();
  let updated = 0;
  let failed = 0;

  for (const holding of holdings || []) {
    const ticker = String(holding.ticker || "").trim();
    if (!ticker) continue;
    const quote = await fetchQuote(supabase, user.id, ticker, holding.exchange).catch(() => null);
    if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) {
      failed += 1;
      const note = `Manual price refresh could not find a quote for ${ticker} at ${checkedAt}.`;
      const existing = String(holding.notes || "");
      await supabase.from("investment_holdings").update({
        notes: existing.includes(note) ? existing : [existing, note].filter(Boolean).join("\n"),
        updated_at: checkedAt,
      }).eq("id", holding.id).eq("user_id", user.id);
      continue;
    }

    const units = Number(holding.units || 0);
    const quotePricing = await quotePricingForGbp(quote, holding.exchange);
    const update = await supabase.from("investment_holdings").update({
      latest_price: quotePricing.gbpPrice,
      latest_price_date: todayDate,
      currency: "GBP",
      native_latest_price: quotePricing.nativePrice,
      native_currency: quotePricing.nativeCurrency,
      native_exchange: quote.exchange || holding.exchange,
      source_url: quote.sourceUrl || `market-data:${quote.source}:${quote.rawSymbol}`,
      updated_at: checkedAt,
    }).eq("id", holding.id).eq("user_id", user.id);
    if (update.error) {
      failed += 1;
      continue;
    }

    const snapshot = await supabase.from("investment_price_snapshots").insert({
      user_id: user.id,
      holding_id: holding.id,
      price: quotePricing.gbpPrice,
      units,
      value: units * Number(quotePricing.gbpPrice),
      snapshot_date: todayDate,
      snapshot_at: checkedAt,
      source: quote.source,
    });
    if (snapshot.error) failed += 1;
    else updated += 1;
  }

  console.log(`[investment-manual-refresh] updated=${updated} failed=${failed} account=${accountId || "all"}`);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function importInvestmentHoldingsBulk(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "");
  const uploaded = formData.get("holdings_file") instanceof File ? formData.get("holdings_file") as File : null;
  let text = String(formData.get("holdings_text") || "");
  const priceUnit = asPriceInputUnit(formData.get("price_input_unit"));
  if (!accountId) throw new Error("Choose an investment account first.");

  if (uploaded && uploaded.size > 0) {
    if (looksLikeImage(uploaded)) {
      const extracted = await extractHoldingsFromImage(supabase, user.id, uploaded);
      text = extracted || text;
    } else {
      text = await uploaded.text();
    }
  }

  if (!text.trim()) {
    revalidatePath("/investments");
    return;
  }

  const parsed = parseCsvRows(text);
  const todayDate = new Date().toISOString().slice(0, 10);
  const accountCurrency = String(formData.get("account_currency") || "GBP").toUpperCase();
  const accountFx = await fxToGbp(accountCurrency);
  let records: any[] = [];

  if (looksLikeTrading212Holdings(parsed.headers)) {
    records = await Promise.all(parsed.rows.map(async (row) => {
      const ticker = rowValue(row, ["Slice", "Ticker", "Symbol"]).trim().toUpperCase();
      const assetName = rowValue(row, ["Name", "Company", "Instrument"]).trim() || ticker || "Holding";
      const investedValueNative = parseNumber(rowValue(row, ["Invested value", "Invested", "Cost"] ) as unknown as FormDataEntryValue) ?? 0;
      const currentValueNative = parseNumber(rowValue(row, ["Value", "Current value", "Market value"] ) as unknown as FormDataEntryValue) ?? 0;
      const resultValueNative = parseNumber(rowValue(row, ["Result", "Gain/Loss", "P/L"] ) as unknown as FormDataEntryValue) ?? (currentValueNative - investedValueNative);
      const investedValue = investedValueNative * accountFx.rate;
      const currentValue = currentValueNative * accountFx.rate;
      const resultValue = resultValueNative * accountFx.rate;
      const units = parseNumber(rowValue(row, ["Owned quantity", "Owned shares", "Shares", "Units"] ) as unknown as FormDataEntryValue) ?? 0;
      const quote = ticker ? await fetchQuote(supabase, user.id, ticker, null) : null;
      const latestAccountPrice = units > 0 ? currentValue / units : 0;
      const averageAccountPrice = units > 0 ? investedValue / units : 0;
      return {
        user_id: user.id,
        investment_account_id: accountId,
        asset_name: assetName,
        ticker: ticker || null,
        exchange: normalisedExchangeCode(quote?.exchange) || likelyExchangeForTicker(ticker),
        group_label: nullableString(formData.get("group_label")) || "Trading 212 pie",
        units,
        average_buy_price: 0,
        latest_price: latestAccountPrice,
        cost_basis_status: "unknown_provider_import",
        latest_price_date: todayDate,
        currency: "GBP",
        price_quote_unit: "gbp",
        native_latest_price: quote?.price ?? null,
        native_currency: quote ? (String(quote.priceQuoteUnit || "").toLowerCase() === "gbx" ? "GBX" : (quote.currency || currencyForExchange(quote.exchange))) : null,
        native_exchange: normalisedExchangeCode(quote?.exchange) || likelyExchangeForTicker(ticker),
        imported_invested_value: investedValue,
        imported_current_value: currentValue,
        imported_result_value: resultValue,
        imported_account_currency: accountCurrency,
        import_source_type: uploaded && looksLikeImage(uploaded) ? "trading212_image" : "trading212_pie_csv",
        annual_asset_fee_percent: 0,
        target_allocation_percent: 0,
        source_url: quote ? `market-data:${quote.source}:${quote.rawSymbol}` : null,
        notes: quote
          ? `Trading 212 import. Trading 212 supplied units/current value but not a verified average buy price. LOOP stores cost basis as unknown until transaction lots are imported. Native quote matched as ${quote.rawSymbol || ticker} (${quote.exchange || "review"}) at ${quote.exchange === "LSE" ? (quote.price * 100).toFixed(2) + "p" : `${quote.currency || "USD"} ${quote.price.toFixed(4)}`}.`
          : `Trading 212 import. Trading 212 supplied units/current value but not a verified average buy price. Native exchange/quote needs review.`,
      };
    }));
  } else {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => splitCsvLine(line))
      .filter((cells) => cells.length >= 2 && !/^name$/i.test(cells[0]));

    records = await Promise.all(rows.map(async (cells) => {
      const [assetName, ticker = "", exchange = "", units = "0", averageBuy = "0", latest = "0", group = ""] = cells;
      const shareUnits = Number(String(units).replace(/,/g, "")) || 0;
      const latestNumber = Number(String(latest).replace(/[,£p]/gi, "")) || 0;
      const averageNumber = Number(String(averageBuy).replace(/[,£p]/gi, "")) || 0;
      const quote = ticker ? await fetchQuote(supabase, user.id, ticker, exchange || null) : null;
      const quotePricing = await quotePricingForGbp(quote, exchange || null);
      const manualCurrency = currencyFromPriceUnit(formData.get("price_input_unit"));
      const manualFx = await fxToGbp(manualCurrency);
      const latestPrice = latestNumber > 0 ? (priceUnit === "gbx" ? latestNumber / 100 : latestNumber) * manualFx.rate : (quotePricing.gbpPrice || 0);
      const inferredUnit = quote?.exchange === "LSE" ? "gbx" : quote?.priceQuoteUnit || priceUnit;
      return {
        user_id: user.id,
        investment_account_id: accountId,
        asset_name: assetName || ticker || "Holding",
        ticker: ticker || null,
        exchange: normalisedExchangeCode(quote?.exchange || exchange) || likelyExchangeForTicker(ticker),
        group_label: group || nullableString(formData.get("group_label")),
        units: shareUnits,
        average_buy_price: (priceUnit === "gbx" ? averageNumber / 100 : averageNumber) * manualFx.rate,
        latest_price: latestPrice,
        latest_price_date: todayDate,
        currency: "GBP",
        price_quote_unit: inferredUnit,
        native_latest_price: quote?.price ?? null,
        native_currency: quote ? (String(quote.priceQuoteUnit || "").toLowerCase() === "gbx" ? "GBX" : (quote.currency || currencyForExchange(quote.exchange))) : null,
        native_exchange: normalisedExchangeCode(quote?.exchange) || null,
        import_source_type: uploaded && looksLikeImage(uploaded) ? "image_ai" : "generic_csv",
        annual_asset_fee_percent: 0,
        target_allocation_percent: 0,
        source_url: quote ? `market-data:${quote.source}:${quote.rawSymbol}` : null,
        notes: uploaded && looksLikeImage(uploaded) ? "Bulk imported from screenshot using AI extraction. Review values." : "Bulk imported from a pie/portfolio paste or CSV.",
      };
    }));
  }

  records = records.filter((record) => Number(record.units || 0) > 0 && (record.ticker || record.asset_name));
  if (records.length === 0) {
    revalidatePath("/investments");
    return;
  }
  const { error } = await supabase.from("investment_holdings").insert(records);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deletePensionAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("pension_accounts").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deletePensionFund(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("pension_funds").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deleteInvestmentAccount(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("investment_accounts").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deleteInvestmentAccountWithConfirmation(formData: FormData) {
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (confirmation !== "DELETE") throw new Error("Type DELETE to confirm pot deletion.");
  return deleteInvestmentAccount(formData);
}

export async function deleteInvestmentHolding(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("investment_holdings").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function addDefinedBenefitPension(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("defined_benefit_pensions").insert({
    user_id: user.id,
    person_id: nullableString(formData.get("person_id")),
    scheme_name: String(formData.get("scheme_name") || "Defined benefit pension"),
    provider: String(formData.get("provider") || "Provider"),
    scheme_section: String(formData.get("scheme_section") || "2015 CARE"),
    accrual_rate: parseNumber(formData.get("accrual_rate")) ?? 54,
    revaluation_rate_percent: parseNumber(formData.get("revaluation_rate_percent")) ?? 0,
    rules_source_url: nullableString(formData.get("rules_source_url")),
    rules_source_type: String(formData.get("rules_source_type") || (String(formData.get("provider") || "").toLowerCase().includes("nhs") ? "public_template" : "manual")),
    rules_confidence: String(formData.get("rules_source_type") || "").includes("public") || String(formData.get("provider") || "").toLowerCase().includes("nhs") ? 95 : nullableString(formData.get("rules_source_url")) ? 80 : 40,
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}


export async function updateDefinedBenefitPension(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Choose a defined benefit pension to update.");
  const provider = String(formData.get("provider") || "Provider");
  const sourceUrl = nullableString(formData.get("rules_source_url"));
  const sourceType = String(formData.get("rules_source_type") || (provider.toLowerCase().includes("nhs") ? "public_template" : sourceUrl ? "user_link" : "manual"));
  const { error } = await supabase.from("defined_benefit_pensions").update({
    person_id: nullableString(formData.get("person_id")),
    scheme_name: String(formData.get("scheme_name") || "Defined benefit pension"),
    provider,
    scheme_section: String(formData.get("scheme_section") || "CARE"),
    accrual_rate: parseNumber(formData.get("accrual_rate")) ?? 54,
    revaluation_rate_percent: parseNumber(formData.get("revaluation_rate_percent")) ?? 0,
    rules_source_url: sourceUrl,
    rules_source_type: sourceType,
    rules_confidence: sourceType === "public_template" ? 95 : sourceUrl ? 80 : 40,
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function addDbPensionServiceEvent(formData: FormData) {
  const { supabase, user } = await currentUser();
  const dbPensionId = String(formData.get("db_pension_id") || "");
  if (!dbPensionId) throw new Error("Choose a defined benefit pension first.");
  const { error } = await supabase.from("db_pension_service_events").insert({
    user_id: user.id,
    db_pension_id: dbPensionId,
    band_label: String(formData.get("band_label") || "Service period"),
    pensionable_pay: parseNumber(formData.get("pensionable_pay")) ?? 0,
    contribution_percent: parseNumber(formData.get("contribution_percent")) ?? 0,
    employer_contribution_percent: parseNumber(formData.get("employer_contribution_percent")) ?? 0,
    start_date: String(formData.get("start_date") || new Date().toISOString().slice(0, 10)),
    end_date: nullableString(formData.get("end_date")),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deleteDefinedBenefitPension(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("defined_benefit_pensions").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function deleteDbPensionServiceEvent(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("db_pension_service_events").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}
