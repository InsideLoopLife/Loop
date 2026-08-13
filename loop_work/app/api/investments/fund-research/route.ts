import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { fetchLandgFundPrice, findLandgSourceUrl, isLegalGeneral } from "@/lib/investments/pension-provider-fetch";

function safeJsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

async function fallbackResult(fundName: string, provider: string) {
  const isLg = isLegalGeneral(provider);
  const { url, group } = findLandgSourceUrl(fundName, provider);
  const parsed = await fetchLandgFundPrice(url || "", fundName);
  return {
    suggested_fee_percent: parsed.suggested_fee_percent,
    suggested_unit_price: parsed.unit_price,
    suggested_unit_price_quote_unit: parsed.unit_price ? "gbx" : null,
    suggested_fund_code: null,
    suggested_group_label: group,
    suggested_source_url: url,
    // BUGFIX: confidence used to be a flat guess (76 if anything parsed,
    // 55 otherwise). Now reflects what the shared parser actually
    // established — an exact fund-name match or a page with only one
    // price on it is trustworthy; a page with several share-class prices
    // where none matched exactly is explicitly not, and should read as
    // low-confidence here rather than the same 76 as a confirmed match.
    confidence: isLg
      ? parsed.confidence === "exact_name_match" || parsed.confidence === "single_price_on_page"
        ? 88
        : parsed.candidate_count > 1
          ? 40
          : 55
      : 35,
    usedOpenAi: false,
    research_summary: isLg
      ? `Built-in Legal & General helper used ${url ? "and attempted to parse the source page" : "with the L&G fund centre"}. ${
          parsed.unit_price
            ? `Unit price found (${parsed.confidence.replace(/_/g, " ")}): ${(parsed.unit_price * 100).toFixed(2)}p as at ${parsed.as_of_date || "unknown date"}. `
            : parsed.candidate_count > 1
              ? `The page showed ${parsed.candidate_count} different share-class prices and none matched this fund's exact name — pick the right one manually rather than trust a guess. `
              : "Unit price not confidently found. "
        }${parsed.suggested_fee_percent !== null ? `Fee found: ${parsed.suggested_fee_percent.toFixed(3)}%/yr. ` : "Fee not confidently found. "}Review the source and workplace portal because plan charges can differ.`
      : `No OpenAI token was available, so this is a planning fallback. For ${provider} / ${fundName}, store the exact annual management charge/OCF from the workplace pension fund factsheet or plan charge document, then paste the source URL on the fund record.`,
    options: [
      { label: isLg ? "Open L&G fund centre/source" : "Find fund factsheet", note: isLg ? "Search the exact PMC fund name and confirm the fund series/share class." : "Use the provider pension portal/fund centre and search the exact fund name." },
      { label: "Check scheme/plan charges", note: "Workplace pension plans can have a platform/plan charge plus fund-level charges." },
      { label: "Save values as assumptions", note: "Accept parsed values only once you are comfortable with the confidence/source." },
    ],
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pensionFundId = String(body.pensionFundId || "");
  const fundName = String(body.fundName || "Pension fund");
  const provider = String(body.provider || "Provider");

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");

  let result = await fallbackResult(fundName, provider);

  // BUGFIX (AI budget enforcement): the daily-limit/midnight-reset
  // machinery already existed (checkUserAiBudget / loop_check_ai_entitlement)
  // but nothing ever called it, so no route was actually tier-capped.
  // Same graceful-degrade pattern as "no OpenAI key configured" below —
  // hitting the limit falls back to the existing non-AI result rather
  // than erroring the whole request.
  const budget = secret?.value ? await checkAiRouteAllowed(supabase, user.id, "investment_research") : null;

  if (secret?.value && budget?.allowed) {
    try {
      const prompt = `You are helping build a UK private household finance tracker. Use web search where available. Research guidance only. Fund provider: ${provider}. Fund name: ${fundName}. Search for the provider fund factsheet, visible latest unit price, OCF/AMC/TER, ISIN/sedol/fund code and any platform/plan-charge caveat. Return JSON only with keys: suggested_fee_percent (number or null), suggested_unit_price (number or null, stored in GBP/pounds even if shown as pence), suggested_unit_price_quote_unit ("gbx" if source is pence/GBX else "gbp" or null), suggested_fund_code (string or null), suggested_group_label (string), suggested_source_url (string or null), confidence (0-100), research_summary (short), options (array of {label,note}). Do not invent exact fees unless you are confident they come from a provider/factsheet. If workplace pension plan charges may differ from public factsheets, say so clearly.`;
      const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
        body: JSON.stringify({ model, tools: [{ type: "web_search_preview" }], input: prompt }),
      });

      const payload = await response.json();
      if (response.ok) {
        const text = payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "";
        const parsed = safeJsonFromText(text);
        if (parsed) result = { ...(await fallbackResult(fundName, provider)), ...parsed, usedOpenAi: true };
        await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "investment_research", provider: "openai", model });
      }
    } catch {
      result = { ...result, research_summary: `${result.research_summary}\n\nOpenAI request failed, so this fallback was shown.` };
    }
  } else if (secret?.value && budget && !budget.allowed) {
    result = { ...result, research_summary: `${result.research_summary}\n\n${budget.reason} (Resets at midnight.) This fallback was shown instead.` };
  }

  await supabase.from("pension_fund_research_notes").insert({
    user_id: user.id,
    pension_fund_id: pensionFundId || null,
    provider,
    fund_name: fundName,
    status: "draft",
    suggested_fee_percent: result.suggested_fee_percent,
    suggested_fund_code: result.suggested_fund_code,
    suggested_group_label: result.suggested_group_label,
    suggested_source_url: result.suggested_source_url,
    confidence: result.confidence ?? 0,
    research_summary: result.research_summary,
  });

  return NextResponse.json(result);
}
