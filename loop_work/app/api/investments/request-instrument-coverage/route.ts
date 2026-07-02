import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function etaForCoverage(status?: string | null) {
  const clean = String(status || "planned").toLowerCase();
  if (clean === "active" || clean === "complete" || clean === "completed") return "Ready now";
  if (clean === "in_progress") return "Usually 2–8 minutes";
  if (clean === "failed" || clean === "needs_review") return "Needs admin review";
  return "Usually 2–10 minutes";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("loop_investment_ai_market_requests")
    .select("id,status,request_query,exchange_hint,progress,match_confidence,updated_at,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json({ ok: true, request: data, eta: etaForCoverage(data.status) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  const exchange = String(body.exchange || "").trim().toUpperCase();
  const investmentAccountId = String(body.investmentAccountId || body.investment_account_id || "").trim() || null;
  if (!query || query.length < 2) return NextResponse.json({ error: "Query is required" }, { status: 400 });

  if (investmentAccountId) {
    const { data: account } = await supabase
      .from("investment_accounts")
      .select("id")
      .eq("id", investmentAccountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account?.id) return NextResponse.json({ error: "Investment pot not found" }, { status: 404 });
  }

  const prompt = [
    "Research and add investment instrument coverage for LOOP.",
    `Search query: ${query}`,
    exchange ? `User selected/review exchange: ${exchange}` : "No exchange selected.",
    investmentAccountId ? `Placeholder should appear in investment account: ${investmentAccountId}` : "No pot placeholder requested.",
    "Find the correct ticker, instrument name, exchange/MIC, currency, quote source, logo/domain and whether it is a share, ETF or fund.",
    "Do not create a live user holding until the match is confirmed.",
  ].join("\n");

  const now = new Date().toISOString();
  const progress = {
    ticker_found: false,
    investment_information_added: false,
    document_fee_information_added: false,
    starter_history_added: false,
    current_step: "Queued for AI/admin research",
    eta_minutes_min: 2,
    eta_minutes_max: 10,
    minimum_history: "1 month",
  };

  const { data, error } = await supabase
    .from("loop_investment_ai_market_requests")
    .insert({
      prompt,
      inferred_market_code: exchange || null,
      request_query: query,
      exchange_hint: exchange || null,
      status: "planned",
      created_by: user.id,
      match_confidence: 0,
      progress,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (investmentAccountId && data?.id) {
    await supabase.from("investment_instrument_coverage_placeholders").insert({
      user_id: user.id,
      investment_account_id: investmentAccountId,
      request_id: data.id,
      query,
      exchange_hint: exchange || null,
      status: "queued",
      progress,
      eta_text: "Usually 2–10 minutes",
      created_at: now,
      updated_at: now,
    }).then(() => null, () => null);
  }

  return NextResponse.json({
    ok: true,
    id: data?.id || null,
    eta: "Usually 2–10 minutes",
    message: "Coverage request queued. A placeholder has been placed in the pot where possible; LOOP will research the ticker, add document/fee data and pull at least one month of starter history.",
    progress,
  });
}
