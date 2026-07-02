import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isYahooFundCode, searchInvestments, type InvestmentQuote } from "@/lib/investments/market-data";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";

function manualCandidate(query: string, exchange?: string | null): InvestmentQuote {
  const cleanQuery = query.trim().toUpperCase();
  const yahooFund = isYahooFundCode(cleanQuery);
  const ex = yahooFund ? "Yahoo Fund" : String(exchange || "").trim().toUpperCase() || "Review";
  return {
    price: 0,
    source: yahooFund ? "Yahoo Finance fund code" : "Manual review",
    rawSymbol: cleanQuery || "MANUAL",
    assetName: query.trim() || "Manual holding",
    exchange: ex,
    currency: "GBP",
    priceQuoteUnit: yahooFund || ex !== "LSE" ? "gbp" : "gbx",
    assetType: yahooFund ? "fund" : "other",
    annualAssetFeePercent: 0,
    sourceUrl: yahooFund ? `https://finance.yahoo.com/quote/${encodeURIComponent(cleanQuery)}` : null,
    note: yahooFund
      ? "Yahoo Finance fund-code format accepted. Select this and enter provider units/price if the delayed quote is not returned."
      : "No reliable market-data match was found. Select this to continue and fill the price/fund details manually.",
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

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  const entitlement = investmentDataEntitlementForProfile(profile);

  try {
    // Always return identification candidates so users do not create accidental manual holdings.
    // Tiering controls refresh cadence/realtime providers, not whether a user can see likely ticker matches.
    const matches = await searchInvestments(supabase, user.id, query, exchange);
    const manual = manualCandidate(query, exchange);
    return NextResponse.json({
      query,
      ticker: query,
      quote: matches[0] || null,
      matches,
      manual_candidate: manual,
      entitlement,
      note: matches.length
        ? entitlement.canUseRealtimePrices
          ? "Choose the exact stock, ETF or provider fund. Realtime data is enabled where the paid provider supports this instrument."
          : "Choose the exact stock, ETF or provider fund. This tier uses delayed/indicative sources for tracking."
        : "No confident ticker/source result was found. Use Add to database/manual review so AI/admin can enrich the instrument rather than pretending it matched.",
    });
  } catch (error) {
    return NextResponse.json({ query, quote: null, matches: [], manual_candidate: manualCandidate(query, exchange), entitlement, note: error instanceof Error ? error.message : "Quote check failed" }, { status: 200 });
  }
}
