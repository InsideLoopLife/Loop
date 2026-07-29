"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { findProvider } from "@/lib/investments/provider-glossary";

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

function currencyFromPriceUnit(value: FormDataEntryValue | null) {
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

function parsePurchaseLots(text: string, priceUnit: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line))
    .filter((cells) => cells.length >= 2 && !/^date$/i.test(cells[0]));

  return rows.map((cells) => {
    const [purchaseDate = new Date().toISOString().slice(0, 10), units = "0", price = "0", notes = ""] = cells;
    const lotUnits = Number(String(units).replace(/,/g, "")) || 0;
    const rawPrice = Number(String(price).replace(/[,£p]/gi, "")) || 0;
    const purchasePrice = priceUnit === "gbx" ? rawPrice / 100 : rawPrice;
    return { purchaseDate, units: lotUnits, purchasePrice, notes: notes || null };
  }).filter((lot) => lot.units > 0 && lot.purchasePrice >= 0);
}

function weightedAverageFromLots(lots: { units: number; purchasePrice: number }[]) {
  const totalUnits = lots.reduce((sum, lot) => sum + lot.units, 0);
  const totalCost = lots.reduce((sum, lot) => sum + lot.units * lot.purchasePrice, 0);
  return { totalUnits, averagePrice: totalUnits > 0 ? totalCost / totalUnits : 0 };
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
  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return "";

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
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
  if (!response.ok) return "";
  return String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "");
}

async function fetchQuote(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, ticker: string, exchange?: string | null) {
  const providerSymbols = normaliseTickersForProvider(ticker, exchange);
  if (!providerSymbols.length) return null;

  const secret = await getActiveIntegrationSecret(supabase, userId, ["alpha_vantage", "financial_modeling_prep", "fmp"]);

  if (secret?.value && secret.provider === "alpha_vantage") {
    for (const symbol of providerSymbols) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(secret.value)}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const quote = data["Global Quote"] || {};
      const rawPrice = Number(quote["05. price"] || 0);
      if (Number.isFinite(rawPrice) && rawPrice > 0) {
        const isUk = (String(exchange || "").toUpperCase() === "LSE" || symbol.endsWith(".L"));
        const price = isUk && rawPrice > 50 ? rawPrice / 100 : rawPrice;
        return { price, source: "alpha_vantage", symbol, exchange: isUk ? "LSE" : exchange };
      }
    }
  }

  if (secret?.value) {
    for (const symbol of providerSymbols) {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(secret.value)}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const first = Array.isArray(data) ? data[0] : data?.[0] || data;
      const rawPrice = Number(first?.price || 0);
      if (Number.isFinite(rawPrice) && rawPrice > 0) {
        const isUk = (String(exchange || "").toUpperCase() === "LSE" || symbol.endsWith(".L"));
        const price = isUk && rawPrice > 50 ? rawPrice / 100 : rawPrice;
        return { price, source: "fmp", symbol, exchange: isUk ? "LSE" : exchange };
      }
    }
  }

  for (const stooqSymbol of normaliseTickersForStooq(ticker, exchange)) {
    try {
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
      const response = await fetch(url, { cache: "no-store" });
      const csv = await response.text();
      const lines = csv.trim().split(/\r?\n/);
      const values = lines[1]?.split(",") || [];
      if (!values.length || /N\/D/i.test(values.join(""))) continue;
      const close = Number(values[6] || values[3] || 0);
      if (Number.isFinite(close) && close > 0) {
        const isUk = stooqSymbol.endsWith(".uk");
        const price = isUk && close > 50 ? close / 100 : close;
        return { price, source: "stooq_delayed", symbol: stooqSymbol, exchange: isUk ? "LSE" : exchange };
      }
    } catch {
      // try next symbol
    }
  }

  return null;
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

export async function addPensionFund(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("pension_account_id") || "");
  if (!accountId) throw new Error("Choose a pension account first.");

  const units = parseNumber(formData.get("units"));
  const unitPrice = parseNumber(formData.get("unit_price"));
  const enteredValue = parseNumber(formData.get("current_value"));
  const currentValue = enteredValue ?? (units && unitPrice ? units * unitPrice : 0);

  const { error } = await supabase.from("pension_funds").insert({
    user_id: user.id,
    pension_account_id: accountId,
    fund_name: String(formData.get("fund_name") || "Pension fund"),
    fund_code: nullableString(formData.get("fund_code")),
    group_label: nullableString(formData.get("group_label")),
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    monthly_contribution_percent: parseNumber(formData.get("monthly_contribution_percent")) ?? 0,
    contribution_active: formData.get("contribution_active") === "on",
    current_value: currentValue,
    units,
    unit_price: unitPrice,
    annual_fund_fee_percent: parseNumber(formData.get("annual_fund_fee_percent")) ?? 0,
    price_as_of_date: String(formData.get("price_as_of_date") || new Date().toISOString().slice(0, 10)),
    fee_source_url: nullableString(formData.get("fee_source_url")),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function updatePensionFund(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  const units = parseNumber(formData.get("units"));
  const unitPrice = parseNumber(formData.get("unit_price"));
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
    annual_fund_fee_percent: parseNumber(formData.get("annual_fund_fee_percent")) ?? 0,
    price_as_of_date: String(formData.get("price_as_of_date") || new Date().toISOString().slice(0, 10)),
    fee_source_url: nullableString(formData.get("fee_source_url")),
    notes: nullableString(formData.get("notes")),
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

export async function addInvestmentHolding(formData: FormData) {
  const { supabase, user } = await currentUser();
  const accountId = String(formData.get("investment_account_id") || "");
  if (!accountId) throw new Error("Choose an investment account first.");

  const priceUnit = asPriceInputUnit(formData.get("price_input_unit"));
  const ticker = nullableString(formData.get("ticker"));
  const exchange = nullableString(formData.get("exchange"));
  const lotsText = String(formData.get("purchase_lots") || "").trim();
  const lots = parsePurchaseLots(lotsText, priceUnit);
  const weighted = weightedAverageFromLots(lots);

  const enteredUnits = parseNumber(formData.get("units")) ?? 0;
  const units = weighted.totalUnits > 0 ? weighted.totalUnits : enteredUnits;

  const inputLatest = parseNumber(formData.get("latest_price"));
  const quote = inputLatest === null && ticker ? await fetchQuote(supabase, user.id, ticker, exchange) : null;
  const latestPrice = inputLatest === null && quote ? quote.price : priceFromInput(formData.get("latest_price"), formData.get("price_input_unit"));
  const avgPrice = weighted.totalUnits > 0 ? weighted.averagePrice : priceFromInput(formData.get("average_buy_price"), formData.get("price_input_unit"));
  const priceDate = String(formData.get("latest_price_date") || new Date().toISOString().slice(0, 10));

  const { data, error } = await supabase.from("investment_holdings").insert({
    user_id: user.id,
    investment_account_id: accountId,
    asset_name: String(formData.get("asset_name") || ticker || "Holding"),
    ticker,
    exchange: quote?.exchange || exchange,
    group_label: nullableString(formData.get("group_label")),
    units,
    average_buy_price: avgPrice,
    latest_price: latestPrice,
    latest_price_date: priceDate,
    currency: currencyFromPriceUnit(formData.get("price_input_unit")),
    price_quote_unit: quote?.exchange === "LSE" ? "gbx" : priceUnit,
    annual_asset_fee_percent: parseNumber(formData.get("annual_asset_fee_percent")) ?? 0,
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    source_url: quote ? `market-data:${quote.source}:${quote.symbol}` : nullableString(formData.get("source_url")),
    notes: nullableString(formData.get("notes")) || (lots.length ? `Built from ${lots.length} purchase lot(s).` : quote ? "Price auto-filled from delayed/token quote at add time." : null),
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (data?.id && lots.length) {
    await supabase.from("investment_purchase_lots").insert(lots.map((lot) => ({
      user_id: user.id,
      holding_id: data.id,
      purchase_date: lot.purchaseDate || priceDate,
      units: lot.units,
      purchase_price: lot.purchasePrice,
      price_quote_unit: priceUnit,
      currency: currencyFromPriceUnit(formData.get("price_input_unit")),
      notes: lot.notes,
    })));
  }

  if (data?.id) {
    await supabase.from("investment_price_snapshots").upsert({
      user_id: user.id,
      holding_id: data.id,
      price: latestPrice,
      units,
      value: units * latestPrice,
      snapshot_date: priceDate,
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
  const latestPrice = priceFromInput(formData.get("latest_price"), formData.get("price_input_unit"));
  const avgPrice = priceFromInput(formData.get("average_buy_price"), formData.get("price_input_unit"));
  const priceDate = String(formData.get("latest_price_date") || new Date().toISOString().slice(0, 10));
  const { error } = await supabase.from("investment_holdings").update({
    asset_name: String(formData.get("asset_name") || "Holding"),
    ticker: nullableString(formData.get("ticker")),
    exchange: nullableString(formData.get("exchange")),
    group_label: nullableString(formData.get("group_label")),
    units,
    average_buy_price: avgPrice,
    latest_price: latestPrice,
    latest_price_date: priceDate,
    currency: currencyFromPriceUnit(formData.get("price_input_unit")),
    price_quote_unit: priceUnit,
    annual_asset_fee_percent: parseNumber(formData.get("annual_asset_fee_percent")) ?? 0,
    target_allocation_percent: parseNumber(formData.get("target_allocation_percent")) ?? 0,
    source_url: nullableString(formData.get("source_url")),
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await supabase.from("investment_price_snapshots").upsert({
    user_id: user.id,
    holding_id: id,
    price: latestPrice,
    units,
    value: units * latestPrice,
    snapshot_date: priceDate,
    source: "manual",
  });
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function refreshInvestmentHoldingPrice(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  const { data: holding, error: readError } = await supabase
    .from("investment_holdings")
    .select("id, ticker, exchange, units, notes")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!holding?.ticker) {
    await supabase.from("investment_holdings").update({ notes: "Price check skipped: add a ticker first.", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    revalidatePath("/investments");
    return;
  }

  const quote = await fetchQuote(supabase, user.id, holding.ticker, holding.exchange);
  if (!quote) {
    const existing = String(holding.notes || "");
    const note = "Price check could not find a quote. Add a market-data token or keep manual/end-of-day pricing.";
    await supabase.from("investment_holdings").update({
      notes: existing.includes(note) ? existing : [existing, note].filter(Boolean).join("\n"),
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("user_id", user.id);
    revalidatePath("/investments");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const units = Number(holding.units || 0);
  const { error } = await supabase.from("investment_holdings").update({
    latest_price: quote.price,
    latest_price_date: today,
    source_url: `market-data:${quote.source}:${quote.symbol}`,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await supabase.from("investment_price_snapshots").upsert({
    user_id: user.id,
    holding_id: id,
    price: quote.price,
    units,
    value: units * quote.price,
    snapshot_date: today,
    source: quote.source,
  });

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

  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line))
    .filter((cells) => cells.length >= 2 && !/^name$/i.test(cells[0]));

  const records = rows.map((cells) => {
    const [assetName, ticker = "", exchange = "", units = "0", averageBuy = "0", latest = "0", group = ""] = cells;
    const shareUnits = Number(String(units).replace(/,/g, "")) || 0;
    const latestNumber = Number(String(latest).replace(/[,£p]/gi, "")) || 0;
    const averageNumber = Number(String(averageBuy).replace(/[,£p]/gi, "")) || 0;
    const latestPrice = priceUnit === "gbx" ? latestNumber / 100 : latestNumber;
    return {
      user_id: user.id,
      investment_account_id: accountId,
      asset_name: assetName || ticker || "Holding",
      ticker: ticker || null,
      exchange: exchange || null,
      group_label: group || null,
      units: shareUnits,
      average_buy_price: priceUnit === "gbx" ? averageNumber / 100 : averageNumber,
      latest_price: latestPrice,
      latest_price_date: new Date().toISOString().slice(0, 10),
      currency: currencyFromPriceUnit(formData.get("price_input_unit")),
      price_quote_unit: priceUnit,
      annual_asset_fee_percent: 0,
      target_allocation_percent: 0,
      notes: uploaded && looksLikeImage(uploaded) ? "Bulk imported from screenshot using AI extraction. Review values." : "Bulk imported from a pie/portfolio paste or CSV.",
    };
  });

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

export async function deleteInvestmentHolding(formData: FormData) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from("investment_holdings").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}
