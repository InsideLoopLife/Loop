import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";

function safeJsonFromText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
  }
  return null;
}

function fallbackResult(fundName: string, provider: string) {
  const providerLower = provider.toLowerCase();
  const isLegalGeneral = providerLower.includes("legal") || providerLower.includes("l&g") || providerLower.includes("lgim");
  const sourceUrl = isLegalGeneral ? "https://fundcentres.legalandgeneral.com/en/uk/private-investors/fund-centre/" : null;
  return {
    suggested_fee_percent: null,
    suggested_fund_code: null,
    suggested_group_label: fundName.toLowerCase().includes("multi") ? "Multi-asset" : fundName.toLowerCase().includes("emerging") ? "Emerging markets" : fundName.toLowerCase().includes("islamic") ? "Global equity" : "Review needed",
    suggested_source_url: sourceUrl,
    confidence: isLegalGeneral ? 55 : 35,
    usedOpenAi: false,
    research_summary: isLegalGeneral
      ? `OpenAI was not available, so the app used the built-in Legal & General fund-centre helper. Review ${fundName} in the L&G fund centre or your workplace portal and confirm the exact OCF/AMC/plan charge before accepting a fee.`
      : `No OpenAI token was available, so this is a planning fallback. For ${provider} / ${fundName}, store the exact annual management charge/OCF from the workplace pension fund factsheet or plan charge document, then paste the source URL on the fund record.`,
    options: [
      { label: isLegalGeneral ? "Open L&G fund centre" : "Find fund factsheet", note: isLegalGeneral ? "Search the exact PMC fund name and confirm the fund series/share class." : "Use the provider pension portal/fund centre and search the exact fund name." },
      { label: "Check scheme/plan charges", note: "Workplace pension plans can have a platform/plan charge plus fund-level charges." },
      { label: "Save source URL", note: "Keep the evidence next to the assumption so future checks can update it." },
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

  let result = fallbackResult(fundName, provider);

  if (secret?.value) {
    try {
      const prompt = `You are helping build a UK private household finance tracker. Use web search where available. Research guidance only. Fund provider: ${provider}. Fund name: ${fundName}. Search for the provider fund factsheet, OCF/AMC/TER, ISIN/sedol/fund code and any platform/plan-charge caveat. Return JSON only with keys: suggested_fee_percent (number or null), suggested_fund_code (string or null), suggested_group_label (string), suggested_source_url (string or null), confidence (0-100), research_summary (short), options (array of {label,note}). Do not invent exact fees unless you are confident they come from a provider/factsheet. If workplace pension plan charges may differ from public factsheets, say so clearly.`;
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret.value}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
          tools: [{ type: "web_search_preview" }],
          input: prompt,
        }),
      });

      const payload = await response.json();
      if (response.ok) {
        const text = payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "";
        const parsed = safeJsonFromText(text);
        if (parsed) {
          result = {
            ...fallbackResult(fundName, provider),
            ...parsed,
            usedOpenAi: true,
          };
        }
      }
    } catch {
      result = { ...result, research_summary: `${result.research_summary}\n\nOpenAI request failed, so this fallback was shown.` };
    }
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
