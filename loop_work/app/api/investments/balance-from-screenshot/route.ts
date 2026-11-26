import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";
import { buildBalanceRows, chooseListing, type ListingQuote, type LoopHoldingForMatch, type ScreenshotHoldingRow } from "@/lib/investments/screenshot-balance";
import { searchInvestments } from "@/lib/investments/market-data";
import { currencyForExchange, quotePriceToGbp } from "@/lib/investments/fx";
import { consumeFeature, getFeatureAccess } from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

export const maxDuration = 120;

const ROUTE_KEY = "investment_screenshot_balance";
const MAX_IMAGES = 4;
const MAX_LOOKUPS = 40;

function outputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string") chunks.push(content.text);
  return chunks.join("\n");
}

function jsonLoose(text: string) {
  try { return JSON.parse(text.trim()); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) try { return JSON.parse(fenced[1]); } catch {}
  return null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[£$€,\s]/g, "").replace(/[−–]/g, "-"));
  return Number.isFinite(parsed) ? parsed : null;
}

const PROMPT = `This is a screenshot of the holdings list in a trading or investing app. Each row is one holding.
A row normally shows: the holding's name; underneath it a quantity followed by a ticker (for example "760.7894731 G4M"); on the right the current value in pounds; and under that the profit or loss in pounds and as a percentage.
A red amount, or one with a minus sign, is a LOSS and must be returned as a negative number. A green amount, or one with a plus sign, is a GAIN and is positive.
Return ONLY valid JSON in this shape:
{"holdings":[{"name":"string","ticker":"string or null","quantity":number,"value":number,"pnl":number,"pnl_percent":number_or_null,"currency":"GBP or the currency shown"}]}
Rules:
- Copy every number exactly as printed. Do not round, recalculate or infer. Keep all decimal places of the quantity.
- "value" is the current value shown for the row. "pnl" is the signed profit or loss amount. "pnl_percent" is the signed percentage (a loss of 8.10% is -8.1).
- Include only real holdings. Skip cash balances, totals, headers, buttons and anything you cannot read clearly. If a row is cut off at the top or bottom of the image, skip it.
- Never guess a missing value. If you cannot read a number, leave that row out.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "investment_screenshot_balance", limit: 20, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many screenshot reads. Try again shortly." }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const accountId = String(form?.get("account_id") || "");
  const images = (form?.getAll("images") || []).filter((item): item is File => item instanceof File && item.size > 0);
  if (!accountId) return NextResponse.json({ error: "Choose the investment pot first." }, { status: 400 });
  if (!images.length) return NextResponse.json({ error: "Add at least one screenshot." }, { status: 400 });
  if (images.length > MAX_IMAGES) return NextResponse.json({ error: `Use ${MAX_IMAGES} screenshots or fewer at a time.` }, { status: 400 });
  for (const image of images) {
    if (image.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Each screenshot must be 8MB or smaller." }, { status: 413 });
    if (!["image/png", "image/jpeg", "image/webp"].includes(image.type)) return NextResponse.json({ error: "Use PNG, JPG or WEBP screenshots." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("investment_accounts")
    .select("id,label,provider")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "That investment pot wasn't found." }, { status: 404 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const apiKey = secret?.value || process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.LOOP_AI_DISABLED === "true") return NextResponse.json({ error: "Screenshot reading is unavailable right now. Use Bulk import or Add holding instead." }, { status: 503 });

  const budget = await checkAiRouteAllowed(supabase, user.id, ROUTE_KEY);
  if (!budget.allowed) return NextResponse.json({ error: "You've used today's screenshot reads for your plan. Try again tomorrow, or use Bulk import." }, { status: 429 });
  if (budget.remainingToday !== null && budget.remainingToday < images.length) {
    return NextResponse.json({ error: `Your plan has ${budget.remainingToday} screenshot read${budget.remainingToday === 1 ? "" : "s"} left today. Upload fewer screenshots.` }, { status: 429 });
  }

  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
  const readRows: ScreenshotHoldingRow[] = [];
  const notes: string[] = [];
  let imagesRead = 0;

  for (const [index, image] of images.entries()) {
    const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_image", image_url: dataUrl, detail: "high" }] }],
        }),
      });
    } catch {
      notes.push(`Screenshot ${index + 1} couldn't be read (the reader timed out).`);
      continue;
    }
    if (!response.ok) {
      notes.push(`Screenshot ${index + 1} couldn't be read.`);
      continue;
    }
    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: ROUTE_KEY, provider: "openai", model });
    const parsed = jsonLoose(outputText(await response.json()));
    const items: any[] = Array.isArray(parsed?.holdings) ? parsed.holdings : [];
    if (!items.length) {
      notes.push(`No holdings were found in screenshot ${index + 1}.`);
      continue;
    }
    imagesRead += 1;
    for (const item of items) {
      const quantity = num(item?.quantity);
      const value = num(item?.value);
      const pnl = num(item?.pnl);
      const name = cleanText(item?.name, 160);
      if (!name || quantity === null || quantity <= 0 || value === null || value < 0 || pnl === null) continue;
      readRows.push({
        name,
        ticker: item?.ticker ? cleanText(item.ticker, 24).toUpperCase() : null,
        quantity,
        value,
        pnl,
        pnlPercent: num(item?.pnl_percent),
        currency: item?.currency ? cleanText(item.currency, 8).toUpperCase() : null,
      });
    }
  }

  if (!readRows.length) {
    return NextResponse.json({ error: notes[0] || "No holdings could be read from that screenshot. Try a clearer one that shows the quantity, value and profit or loss.", notes }, { status: 422 });
  }

  const { data: holdings } = await supabase
    .from("investment_holdings")
    .select("id,asset_name,ticker,units,average_buy_price,latest_price,external_provider,record_status")
    .eq("user_id", user.id)
    .eq("investment_account_id", account.id);

  const { rows, notInScreenshot } = buildBalanceRows(readRows, (holdings || []) as LoopHoldingForMatch[]);

  // Rows that aren't in Loop yet: find a listing whose name AND price agree with the app.
  // Each search uses one of the person's investment lookups, so stop when they run out.
  const toAdd = rows.filter((row) => !row.match && row.quantity > 0);
  let lookups = 0;
  if (toAdd.length) {
    try {
      const access = await getFeatureAccess(LOOP_FEATURES.INVESTMENT_LOOKUP, 0);
      const remaining = access?.remaining === null || access?.remaining === undefined ? MAX_LOOKUPS : Math.max(0, Number(access.remaining));
      lookups = access?.allowed === false && !remaining ? 0 : Math.min(toAdd.length, MAX_LOOKUPS, remaining);
      if (lookups > 0) await consumeFeature(LOOP_FEATURES.INVESTMENT_LOOKUP, lookups);
    } catch {
      lookups = 0;
    }
    if (lookups < toAdd.length) notes.push(lookups ? `Your plan's investment lookups only covered ${lookups} of the ${toAdd.length} new holdings. The rest can be added as manual holdings.` : "Your plan's investment lookups are used up, so new holdings can only be added as manual holdings.");

    const toQuotes = async (query: string) => {
      const found = await searchInvestments(supabase, user.id, query, "").catch(() => []);
      const out: ListingQuote[] = [];
      for (const quote of found) {
        const unit = String(quote.priceQuoteUnit || "").toLowerCase();
        const nativeCurrency = unit === "gbx" ? "GBX" : quote.currency || currencyForExchange(quote.exchange) || "GBP";
        const converted = await quotePriceToGbp(Number(quote.price || 0), nativeCurrency);
        out.push({ rawSymbol: quote.rawSymbol, assetName: quote.assetName, exchange: quote.exchange, assetType: quote.assetType, currency: nativeCurrency, priceQuoteUnit: quote.priceQuoteUnit, source: quote.source, isin: quote.isin, gbpPrice: converted.gbpPrice });
      }
      return out;
    };

    const looked = toAdd.slice(0, lookups);
    for (let start = 0; start < looked.length; start += 4) {
      await Promise.all(looked.slice(start, start + 4).map(async (row) => {
        const quotes = await toQuotes(row.ticker || row.name);
        row.addCandidate = chooseListing(row, quotes);
      }));
    }
    for (const row of toAdd.slice(lookups)) {
      row.addCandidate = chooseListing(row, []);
      // Not searched at all, so don't claim that no listing exists.
      if (row.addCandidate) row.addCandidate.note = "Not searched for a live listing (lookup allowance used up), so this can only be added as a manual holding. Run it again later or use Add holding.";
    }
  }

  return NextResponse.json({ account: { id: account.id, label: account.label }, imagesRead, rows, notInScreenshot, notes });
}
