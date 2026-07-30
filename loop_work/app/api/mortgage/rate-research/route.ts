import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";

type RateSuggestion = {
  lender: string;
  productName: string;
  rate: number;
  rateType: string;
  termYears: number;
  score: number;
  notes: string;
  sourceUrl?: string;
};

function ltvBand(ltv: number) {
  if (ltv <= 60) return "60%";
  if (ltv <= 75) return "75%";
  if (ltv <= 80) return "80%";
  if (ltv <= 85) return "85%";
  if (ltv <= 90) return "90%";
  return "95%+";
}

function fallbackSuggestions(input: { currentRate: number; ltv: number; termYears: number }): RateSuggestion[] {
  const base = Number(input.currentRate || 4.75);
  const ltv = Number(input.ltv || 75);
  const band = ltvBand(ltv);
  return [
    {
      lender: "Best-buy shortlist",
      productName: `${band} LTV 2-year fixed research target`,
      rate: Math.max(0.1, base),
      rateType: "fixed",
      termYears: Number(input.termYears || 30),
      score: ltv <= 75 ? 82 : 70,
      notes: "Use this as the current working-rate assumption. Verify against lender/broker pages before relying on it.",
    },
    {
      lender: "Longer certainty",
      productName: `${band} LTV 5-year fixed research target`,
      rate: Math.max(0.1, base + 0.15),
      rateType: "fixed",
      termYears: Number(input.termYears || 30),
      score: 76,
      notes: "Potentially useful if you want payment certainty. Compare ERCs, product fees and portability.",
    },
    {
      lender: "Affordability stress",
      productName: "Stress-rate planning assumption",
      rate: Math.max(6.5, base + 1.5),
      rateType: "stress",
      termYears: Number(input.termYears || 30),
      score: 55,
      notes: "Not a product. Use to test whether the move still works if rates rise or lender stress tests are stricter.",
    },
  ];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetPrice = Number(body.targetPrice || 0);
  const loanRequired = Number(body.loanRequired || 0);
  const ltv = Number(body.ltv || 0);
  const termYears = Number(body.termYears || 30);
  const currentRate = Number(body.currentRate || 4.75);

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");

  const fallback = fallbackSuggestions({ currentRate, ltv, termYears });

  if (!secret?.value) {
    return NextResponse.json({
      suggestions: fallback,
      note: "No OpenAI token is saved yet, so this is using the built-in planning shortlist. Add a server-side OpenAI token in Integrations to generate richer notes.",
    });
  }

  const budget = await checkAiRouteAllowed(supabase, user.id, "property_insight");
  if (!budget.allowed) {
    return NextResponse.json({
      suggestions: fallback,
      note: `${budget.reason} Resets at midnight. Using the built-in planning shortlist instead.`,
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: `Create 3 UK mortgage research suggestions as JSON only. Do not claim live rates unless a source URL is provided. Use these planning inputs: target price £${targetPrice}, loan required £${loanRequired}, LTV ${ltv.toFixed(1)}%, term ${termYears} years, current working rate ${currentRate}%. Return an array called suggestions with lender, productName, rate, rateType, termYears, score, notes.`,
        text: { format: { type: "json_object" } },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
    const rawText = data.output_text || data.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "{}";
    const parsed = JSON.parse(rawText);
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : fallback;
    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "property_insight", provider: "openai", model: "gpt-4.1-mini" });
    return NextResponse.json({ suggestions, note: "AI notes generated. Verify rates, fees and eligibility against the lender/broker source before applying." });
  } catch (error) {
    return NextResponse.json({
      suggestions: fallback,
      note: `OpenAI research could not complete, so fallback assumptions were returned. ${error instanceof Error ? error.message : ""}`.trim(),
    });
  }
}
