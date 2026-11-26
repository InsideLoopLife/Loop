// Balancing Loop's holdings against a screenshot of the trading app.
//
// A trading app's holdings list shows, per position: the name, the quantity,
// the current value, and the profit or loss in pounds and percent. From those
// the average buy price falls out:
//
//   cost            = current value - profit/loss
//   average buy     = cost / quantity
//
// The percentage is only used as a cross-check (cost = value / (1 + pct)).
// Everything here is pure so it can be tested without a database or a model.

export type ScreenshotHoldingRow = {
  name: string;
  ticker: string | null;
  quantity: number;
  value: number; // current value, pounds
  pnl: number; // signed profit/loss, pounds (losses negative)
  pnlPercent: number | null; // signed, e.g. -8.1 for -8.10%
  currency: string | null;
};

export type LoopHoldingForMatch = {
  id: string;
  asset_name: string | null;
  ticker: string | null;
  units: number | null;
  average_buy_price: number | null;
  latest_price: number | null;
  external_provider: string | null;
  record_status: string | null;
};

export type BalanceRow = {
  name: string;
  ticker: string | null;
  quantity: number;
  value: number;
  pnl: number;
  pnlPercent: number | null;
  cost: number | null;
  averageBuyPrice: number | null;
  impliedPrice: number | null;
  match: {
    holdingId: string;
    name: string;
    ticker: string | null;
    units: number;
    averageBuyPrice: number | null;
    latestPrice: number | null;
    score: number;
  } | null;
  /** For a row not in Loop yet: the listing it can be added as. Filled in by the read route. */
  addCandidate: AddCandidate | null;
  /** Provider-synced holdings are owned by the sync and are never edited from a screenshot. */
  locked: boolean;
  flags: string[];
  /** "high" rows are pre-ticked in the review; "check" rows need a human look first. */
  confidence: "high" | "check";
};

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const COMPANY_WORDS = new Set(["plc", "inc", "ltd", "limited", "corp", "corporation", "co", "company", "sa", "nv", "ag", "the", "group", "class", "ordinary", "shares", "share", "common", "stock", "adr", "ads"]);

export function normaliseName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !COMPANY_WORDS.has(word))
    .join(" ")
    .trim();
}

function squash(value: string) {
  return value.replace(/\s+/g, "");
}

/** "GOOGL", "GOOGL.US", "VOD.L" -> "googl" / "vod" */
export function baseTicker(value: string | null | undefined) {
  return String(value || "").toLowerCase().split(/[.:\-_/]/)[0].replace(/[^a-z0-9]/g, "");
}

function tokenOverlap(a: string, b: string) {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

export function matchScore(row: Pick<ScreenshotHoldingRow, "name" | "ticker">, holding: Pick<LoopHoldingForMatch, "asset_name" | "ticker">) {
  const rowName = normaliseName(row.name);
  const holdingName = normaliseName(holding.asset_name);
  const rowTicker = baseTicker(row.ticker);
  const holdingTicker = baseTicker(holding.ticker);
  let best = 0;
  if (rowName && holdingName) {
    if (squash(rowName) === squash(holdingName)) best = Math.max(best, 0.98);
    else if (rowName.length >= 4 && holdingName.length >= 4 && (squash(holdingName).startsWith(squash(rowName)) || squash(rowName).startsWith(squash(holdingName)))) best = Math.max(best, 0.88);
    else if (rowName.length >= 5 && holdingName.length >= 5 && (squash(holdingName).includes(squash(rowName)) || squash(rowName).includes(squash(holdingName)))) best = Math.max(best, 0.8);
    best = Math.max(best, tokenOverlap(rowName, holdingName) * 0.85);
  }
  if (rowTicker && holdingTicker && rowTicker === holdingTicker) best = Math.max(best, 0.9);
  return round(best, 3);
}

/** Cost basis from value and profit/loss, cross-checked against the percentage. */
export function deriveCost(row: Pick<ScreenshotHoldingRow, "quantity" | "value" | "pnl" | "pnlPercent">) {
  const flags: string[] = [];
  if (!(row.quantity > 0)) return { cost: null, averageBuyPrice: null, impliedPrice: null, flags: ["No quantity was read for this row."] };
  const cost = row.value - row.pnl;
  if (!(cost > 0)) return { cost: null, averageBuyPrice: null, impliedPrice: row.value > 0 ? row.value / row.quantity : null, flags: ["Profit/loss and value don't give a positive cost, so no average price was worked out."] };

  if (row.pnlPercent !== null && Number.isFinite(row.pnlPercent)) {
    const denominator = 1 + row.pnlPercent / 100;
    if (denominator > 0.0005 && row.value > 0) {
      const costFromPercent = row.value / denominator;
      // Percentages are rounded to 2dp and values to pence, so allow for both.
      const tolerance = Math.max(0.02 * cost, 0.05);
      if (Math.abs(costFromPercent - cost) > tolerance) {
        flags.push(`The profit/loss (£${row.pnl.toFixed(2)}) and the percentage (${row.pnlPercent.toFixed(2)}%) don't agree, so a figure may have been misread.`);
      }
    }
  }
  return {
    cost: round(cost, 4),
    averageBuyPrice: round(cost / row.quantity, 6),
    impliedPrice: row.value > 0 ? round(row.value / row.quantity, 6) : null,
    flags,
  };
}

function mergeScreenshotRows(rows: ScreenshotHoldingRow[]) {
  // Two overlapping screenshots of one scrolling list repeat rows. Keep the first.
  const seen = new Map<string, ScreenshotHoldingRow>();
  for (const row of rows) {
    const key = `${squash(normaliseName(row.name))}|${baseTicker(row.ticker)}|${row.quantity}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
}

export function buildBalanceRows(screenshotRows: ScreenshotHoldingRow[], holdings: LoopHoldingForMatch[]) {
  const rows = mergeScreenshotRows(screenshotRows);
  const live = holdings.filter((holding) => !["archived", "superseded", "removed"].includes(String(holding.record_status || "active")));

  // Best matches first, one holding per row.
  const candidates: Array<{ rowIndex: number; holding: LoopHoldingForMatch; score: number }> = [];
  rows.forEach((row, rowIndex) => {
    for (const holding of live) {
      const score = matchScore(row, holding);
      if (score >= 0.7) candidates.push({ rowIndex, holding, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const rowToHolding = new Map<number, { holding: LoopHoldingForMatch; score: number }>();
  const usedHoldings = new Set<string>();
  for (const candidate of candidates) {
    if (rowToHolding.has(candidate.rowIndex) || usedHoldings.has(candidate.holding.id)) continue;
    rowToHolding.set(candidate.rowIndex, { holding: candidate.holding, score: candidate.score });
    usedHoldings.add(candidate.holding.id);
  }

  const balanceRows: BalanceRow[] = rows.map((row, rowIndex) => {
    const derived = deriveCost(row);
    const flags = [...derived.flags];
    const found = rowToHolding.get(rowIndex) || null;
    const holding = found?.holding || null;
    const locked = Boolean(holding?.external_provider);

    if (row.currency && !["GBP", "£"].includes(row.currency.toUpperCase())) flags.push(`Shown in ${row.currency}, not pounds, so it was not converted. Check this one by hand.`);
    if (row.value === 0 && row.quantity > 0) flags.push("Worth £0 in the app. Consider writing the holding off once you have checked.");
    if (!holding) flags.push("Not in this Loop account yet.");
    if (holding && locked) flags.push(`This holding is kept up to date by your ${holding.external_provider} connection, so it won't be changed from a screenshot.`);
    if (holding && found && found.score < 0.85) flags.push(`Matched to "${holding.asset_name}" by a loose name match. Check it's the same holding.`);
    if (holding) {
      const loopUnits = Number(holding.units || 0);
      if (loopUnits > 0 && row.quantity > 0 && Math.abs(loopUnits - row.quantity) / row.quantity > 0.005) {
        flags.push(`Quantity differs: Loop has ${loopUnits}, the app shows ${row.quantity}.`);
      }
      const loopPrice = Number(holding.latest_price || 0);
      if (loopPrice > 0 && derived.impliedPrice && (derived.impliedPrice / loopPrice > 1.25 || derived.impliedPrice / loopPrice < 0.8)) {
        flags.push(`The app implies £${derived.impliedPrice.toFixed(4)} a unit but Loop's latest price is £${loopPrice.toFixed(4)}. Check this is the right holding, or that Loop's price is current.`);
      }
    }

    const serious = flags.some((flag) => /don't agree|not converted|No quantity|positive cost|Not found|loose name|Quantity differs|implies/.test(flag));
    return {
      name: row.name,
      ticker: row.ticker,
      quantity: row.quantity,
      value: row.value,
      pnl: row.pnl,
      pnlPercent: row.pnlPercent,
      cost: derived.cost,
      averageBuyPrice: derived.averageBuyPrice,
      impliedPrice: derived.impliedPrice,
      match: holding && found
        ? {
            holdingId: holding.id,
            name: String(holding.asset_name || ""),
            ticker: holding.ticker,
            units: Number(holding.units || 0),
            averageBuyPrice: holding.average_buy_price === null || holding.average_buy_price === undefined ? null : Number(holding.average_buy_price),
            latestPrice: holding.latest_price === null || holding.latest_price === undefined ? null : Number(holding.latest_price),
            score: found.score,
          }
        : null,
      addCandidate: null,
      locked,
      flags,
      confidence: serious || locked || derived.averageBuyPrice === null ? "check" : "high",
    };
  });

  const notInScreenshot = live
    .filter((holding) => !usedHoldings.has(holding.id) && Number(holding.units || 0) > 0)
    .map((holding) => ({ holdingId: holding.id, name: String(holding.asset_name || ""), ticker: holding.ticker, units: Number(holding.units || 0) }));

  return { rows: balanceRows, notInScreenshot };
}

// ---------------------------------------------------------------------------
// Adding holdings that aren't in Loop yet
//
// The screenshot gives the current price per unit (value / quantity, in pounds).
// That is a strong check on a market search: of the listings a search returns,
// only one with a matching name or ticker AND a price close to what the app
// shows is the right one. Anything else is offered only as a manual holding.

export type ListingQuote = {
  rawSymbol: string;
  assetName?: string | null;
  exchange?: string | null;
  assetType?: string | null;
  currency?: string | null;
  priceQuoteUnit?: string | null;
  source?: string | null;
  isin?: string | null;
  /** The quote's price converted to pounds per unit. */
  gbpPrice: number;
};

export type AddCandidate = {
  mode: "listed" | "manual";
  ticker: string | null;
  exchange: string | null;
  assetName: string;
  assetKind: string;
  currency: string | null;
  quoteGbpPrice: number | null;
  source: string | null;
  isin: string | null;
  /** True when the name and the price both line up closely. */
  verified: boolean;
  note: string | null;
};

export function priceTolerance(value: number) {
  // The app rounds values to the penny, so small positions carry a big relative error.
  const rounding = value > 0 ? 0.005 / value : 1;
  return Math.min(0.5, 0.15 + rounding);
}

export function chooseListing(
  row: Pick<ScreenshotHoldingRow, "name" | "ticker" | "quantity" | "value">,
  quotes: ListingQuote[],
): AddCandidate {
  const implied = row.value > 0 && row.quantity > 0 ? row.value / row.quantity : null;
  const tolerance = priceTolerance(row.value);
  let best: { quote: ListingQuote; nameScore: number; priceError: number | null } | null = null;

  for (const quote of quotes) {
    if (!(quote.gbpPrice > 0) && implied !== null) continue;
    const nameScore = matchScore(row, { asset_name: quote.assetName || null, ticker: quote.rawSymbol });
    if (nameScore < 0.7) continue;
    const priceError = implied !== null && quote.gbpPrice > 0 ? Math.abs(quote.gbpPrice / implied - 1) : null;
    if (priceError !== null && priceError > tolerance) continue;
    // Without a price to check against (a zero-value row) only a near-exact name is trusted.
    if (priceError === null && nameScore < 0.9) continue;
    if (
      !best ||
      nameScore > best.nameScore + 0.001 ||
      (Math.abs(nameScore - best.nameScore) <= 0.001 && (priceError ?? 9) < (best.priceError ?? 9))
    ) {
      best = { quote, nameScore, priceError };
    }
  }

  if (best) {
    const { quote, nameScore, priceError } = best;
    const kind = String(quote.assetType || "share").toLowerCase();
    return {
      mode: "listed",
      ticker: quote.rawSymbol,
      exchange: quote.exchange || null,
      assetName: quote.assetName || row.name,
      assetKind: ["share", "etf", "fund", "crypto", "other"].includes(kind) ? kind : "share",
      currency: quote.currency || null,
      quoteGbpPrice: quote.gbpPrice > 0 ? round(quote.gbpPrice, 6) : null,
      source: quote.source || null,
      isin: quote.isin || null,
      verified: nameScore >= 0.85 && priceError !== null && priceError <= 0.1,
      note: priceError === null ? "Matched on name only, because the app shows no value to check the price against." : null,
    };
  }

  // Nothing matched on name and price, but a ticker was read from the app: track that ticker
  // anyway and let the normal add path fetch its price. The price is checked after adding.
  const fallbackTicker = baseTicker(row.ticker || "");
  if (fallbackTicker) {
    return {
      mode: "listed",
      ticker: fallbackTicker,
      exchange: null,
      assetName: row.name,
      assetKind: "share",
      currency: null,
      quoteGbpPrice: implied,
      source: null,
      isin: null,
      verified: false,
      note: `Couldn't confirm the listing from the price, so it will track ${fallbackTicker} and check the price after adding.`,
    };
  }

  return {
    mode: "manual",
    ticker: null,
    exchange: null,
    assetName: row.name,
    assetKind: "share",
    currency: "GBP",
    quoteGbpPrice: implied,
    source: null,
    isin: null,
    verified: false,
    note: quotes.length
      ? "No listing matched both the name and the price shown in the app and the app showed no ticker, so this can only be added as a manual holding."
      : "No listing was found and the app showed no ticker, so this can only be added as a manual holding.",
  };
}
