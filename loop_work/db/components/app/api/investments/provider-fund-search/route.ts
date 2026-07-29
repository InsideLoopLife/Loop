import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";

function safeJsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const LEGAL_GENERAL_FUND_CENTRE = "https://fundcentres.legalandgeneral.com/en/uk/private-investors/fund-centre/";

function isLegalGeneral(provider: string) {
  const p = provider.toLowerCase();
  return p.includes("legal") || p.includes("l&g") || p.includes("lgim");
}

function legalGeneralFunds(query: string) {
  const q = query.toLowerCase();
  const options = [
    {
      fund_name: "L&G PMC Lazard Emerging Markets 3",
      fund_code: null,
      group_label: "Emerging markets",
      annual_fund_fee_percent: null,
      source_url: LEGAL_GENERAL_FUND_CENTRE,
      confidence: q.includes("lazard") || q.includes("emerging") ? 82 : 55,
      note: "Matches the L&G PMC Lazard Emerging Markets naming style. Confirm exact plan/fund charge in your L&G workplace portal/factsheet.",
    },
    {
      fund_name: "L&G PMC HSBC Islamic Global Equity Index Fund 3",
      fund_code: null,
      group_label: "Global equity",
      annual_fund_fee_percent: null,
      source_url: LEGAL_GENERAL_FUND_CENTRE,
      confidence: q.includes("islamic") || q.includes("hsbc") ? 84 : 55,
      note: "Likely L&G PMC HSBC Islamic Global Equity Index Fund option. Confirm OCF/AMC and any plan-level charge.",
    },
    {
      fund_name: "L&G PMC CT Responsible Global Equity Fund 3",
      fund_code: null,
      group_label: "Responsible global equity",
      annual_fund_fee_percent: null,
      source_url: LEGAL_GENERAL_FUND_CENTRE,
      confidence: q.includes("responsible") || q.includes("ct") ? 80 : 55,
      note: "Likely responsible global equity option. Confirm exact share class/fund series and fee from source.",
    },
    {
      fund_name: "L&G PMC Multi-Asset 3",
      fund_code: null,
      group_label: "Multi-asset",
      annual_fund_fee_percent: null,
      source_url: LEGAL_GENERAL_FUND_CENTRE,
      confidence: q.includes("multi") ? 78 : 50,
      note: "Likely L&G PMC Multi-Asset option. Set monthly contribution allocation to 0 if you do not pay into it.",
    },
  ];
  const terms = q.split(/\s+/).filter((term) => term.length > 2);
  if (!terms.length) return options;
  const filtered = options.filter((option) => terms.some((term) => option.fund_name.toLowerCase().includes(term) || option.group_label.toLowerCase().includes(term)));
  return filtered.length ? filtered : options;
}

function fallback(provider: string, query: string) {
  if (isLegalGeneral(provider)) {
    return {
      usedOpenAi: false,
      provider,
      query,
      summary: "Using the built-in Legal & General fund-centre helper. It can suggest likely fund names and source links without an OpenAI token, but fees still need confirming against the provider factsheet/plan charge page.",
      funds: legalGeneralFunds(query),
    };
  }

  const base = query || provider || "fund";
  return {
    usedOpenAi: false,
    provider,
    query,
    summary: "No OpenAI token/search result was available. Add an OpenAI token for web-assisted provider search, or add the fund manually and save the factsheet/fee source URL.",
    funds: [
      { fund_name: base, fund_code: null, group_label: "Review needed", annual_fund_fee_percent: null, source_url: null, confidence: 25, note: "Paste the exact fund name from the provider portal/factsheet." },
    ],
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || "Provider").trim();
  const query = String(body.query || "").trim();
  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");

  let result = fallback(provider, query);
  const openAiKey = secret?.value;
  if (openAiKey) {
    const prompt = `You are helping a UK private household finance app. Find likely pension funds/options for provider "${provider}" matching "${query}". Return JSON only: {"summary":"short", "funds":[{"fund_name":"", "fund_code":null, "group_label":"", "annual_fund_fee_percent":null, "source_url":null, "confidence":0, "note":""}]}. Prefer null for exact charges unless clearly available from a provider/factsheet/source. Include source_url only if it is likely a useful provider/factsheet page. If the provider is Legal & General, prefer the official L&G fund centre/factsheet pages.`;
    try {
      async function callOpenAi(withSearch: boolean) {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
            ...(withSearch ? { tools: [{ type: "web_search_preview" }] } : {}),
            input: prompt,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "OpenAI search failed");
        const text = payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "";
        return safeJsonFromText(text);
      }

      let parsed = await callOpenAi(true).catch(() => null);
      if (!parsed) parsed = await callOpenAi(false).catch(() => null);
      if (parsed?.funds?.length) result = { ...parsed, usedOpenAi: true, provider, query };
    } catch {
      result.summary = `${result.summary}\n\nOpenAI request failed, so fallback guidance is shown.`;
    }
  }

  return NextResponse.json(result);
}
