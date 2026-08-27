import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isYahooFundCode, searchInvestments, type InvestmentQuote } from "@/lib/investments/market-data";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { consumeFeature, featureErrorResponse } from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

function manualCandidate(query: string, exchange?: string | null): InvestmentQuote {
  const cleanQuery = query.trim().toUpperCase();
  const yahooFund = isYahooFundCode(cleanQuery);
  const ex = yahooFund ? "Yahoo Fund" : String(exchange || "").trim().toUpperCase() || "Review";
  return {
    price: 0, source: yahooFund ? "Yahoo Finance fund code" : "Manual review",
    rawSymbol: cleanQuery || "MANUAL", assetName: query.trim() || "Manual holding",
    exchange: ex, currency: "GBP", priceQuoteUnit: yahooFund || ex !== "LSE" ? "gbp" : "gbx",
    assetType: yahooFund ? "fund" : "other", annualAssetFeePercent: 0,
    sourceUrl: yahooFund ? `https://finance.yahoo.com/quote/${encodeURIComponent(cleanQuery)}` : null,
    note: "Manual review fallback.",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || body.ticker || "").trim();
  const exchange = String(body.exchange || "").trim().toUpperCase();
  if (!query) return NextResponse.json({ error: "Search is required" }, { status: 400 });

  try {
    await consumeFeature(LOOP_FEATURES.INVESTMENT_LOOKUP, 1);
  } catch (error) {
    return featureErrorResponse(error) || NextResponse.json({ error: "Investment search allowance could not be verified." }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
    .eq("user_id", user.id).maybeSingle();
  const entitlement = investmentDataEntitlementForProfile(profile);

  try {
    const matches = await searchInvestments(supabase, user.id, query, exchange);
    return NextResponse.json({ query, ticker: query, quote: matches[0] || null, matches, manual_candidate: manualCandidate(query, exchange), entitlement });
  } catch (error) {
    return NextResponse.json({ query, quote: null, matches: [], manual_candidate: manualCandidate(query, exchange), entitlement, note: error instanceof Error ? error.message : "Quote check failed" }, { status: 200 });
  }
}
