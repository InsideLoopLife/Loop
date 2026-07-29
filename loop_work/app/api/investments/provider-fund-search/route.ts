import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { findProvider } from "@/lib/investments/provider-glossary";

function safeJsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function slugifyProvider(name: string) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type FundOption = {
  fund_name: string;
  fund_code: string | null;
  underlying_isin: string | null;
  group_label: string;
  annual_fund_fee_percent: number | null;
  unit_price: number | null;
  unit_price_quote_unit?: "gbx" | "gbp" | null;
  source_url: string | null;
  confidence: number;
  note: string;
};

function normaliseFundSearchText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/accumulating|accumulation|accumulator/g, " acc ")
    .replace(/income|distributing|distribution/g, " inc ")
    .replace(/u\.?k\.?/g, "uk")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(option: FundOption, query: string) {
  const q = normaliseFundSearchText(query);
  if (!q) return option.confidence;
  const haystack = normaliseFundSearchText(
    `${option.fund_name} ${option.group_label} ${option.fund_code || ""} ${option.underlying_isin || ""}`
  );
  const terms = q.split(/\s+/).filter((term) => term.length > 1);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  const exactBoost = haystack.includes(q) ? 18 : 0;
  return option.confidence + matches * 7 + exactBoost;
}

function ranked(options: FundOption[], query: string) {
  return [...options]
    .map((option) => ({ ...option, confidence: Math.min(99, score(option, query)) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);
}

// 1. Fetch catalogued funds from Supabase DB
async function getDbFunds(provider: string, query: string): Promise<FundOption[]> {
  const supabase = createAdminClient();
  const providerId = slugifyProvider(provider);
  const cleanQuery = String(query || "").trim();

  let dbQuery = supabase
    .from("provider_fund_glossary")
    .select("*")
    .or(`provider_id.eq.${providerId},provider_name.ilike.%${provider}%`);

  if (cleanQuery) {
    dbQuery = dbQuery.or(
      `internal_fund_name.ilike.%${cleanQuery}%,internal_fund_code.ilike.%${cleanQuery}%,underlying_isin.ilike.%${cleanQuery}%`
    );
  }

  const { data, error } = await dbQuery.limit(30);
  if (error || !data) return [];

  return data.map((row) => ({
    fund_name: row.internal_fund_name,
    fund_code: row.internal_fund_code || null,
    underlying_isin: row.underlying_isin || null,
    group_label: row.group_label || "Pension Fund",
    annual_fund_fee_percent: row.annual_fund_fee_percent !== null ? Number(row.annual_fund_fee_percent) : null,
    unit_price: row.unit_price !== null ? Number(row.unit_price) : null,
    unit_price_quote_unit: row.unit_price_quote_unit || "gbp",
    source_url: row.source_url || null,
    confidence: Number(row.confidence || 85),
    note: row.notes || "Catalogued provider fund option.",
  }));
}

// 2. Upsert newly discovered JIT funds back into Supabase for future searches
async function saveDiscoveredFundsToDb(providerName: string, funds: any[]) {
  if (!funds || !funds.length) return;
  const supabase = createAdminClient();
  const providerId = slugifyProvider(providerName);

  const rowsToInsert = funds.map((f) => ({
    provider_id: providerId,
    provider_name: providerName,
    internal_fund_name: f.fund_name,
    internal_fund_code: f.fund_code || null,
    underlying_isin: f.underlying_isin || null,
    group_label: f.group_label || "Pension Fund",
    annual_fund_fee_percent: f.annual_fund_fee_percent ?? null,
    unit_price: f.unit_price ?? null,
    unit_price_quote_unit: f.unit_price_quote_unit || "gbp",
    source_url: f.source_url || null,
    last_fee_check_at: new Date().toISOString(),
    confidence: f.confidence || 80,
    notes: f.note || "Auto-catalogued via web research.",
  }));

  try {
    await supabase.from("provider_fund_glossary").upsert(rowsToInsert, {
      onConflict: "provider_id,internal_fund_name",
    });
  } catch (err) {
    console.warn("[Catalogue Ingestion] Failed to cache funds to DB:", err);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || "Provider").trim();
  const query = String(body.query || "").trim();

  // 1. Query existing DB Catalogue
  const cachedFunds = await getDbFunds(provider, query);
  const rankedCached = ranked(cachedFunds, query);

  // If we found a good number of matches in our DB catalogue, return immediately!
  if (rankedCached.length >= 3) {
    return NextResponse.json({
      usedOpenAi: false,
      provider,
      query,
      summary: `Found ${rankedCached.length} matching fund(s) in the ${provider} catalogue.`,
      funds: rankedCached,
    });
  }

  // 2. JIT Fallback to OpenAI Web Search if catalogue is empty/sparse
  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const openAiKey = secret?.value || process.env.OPENAI_API_KEY;

  if (openAiKey) {
    const prompt = `You are a UK pension fund research engine. Find real pension funds, underlying ISIN codes, internal codes, and fees for provider "${provider}" matching query "${query}".
Return valid JSON only in this exact format:
{
  "summary": "Short explanation",
  "funds": [
    {
      "fund_name": "Full Provider Fund Name",
      "fund_code": "Provider Internal Code or null",
      "underlying_isin": "Standard ISIN starting with GB/LU/IE etc or null",
      "group_label": "Asset Class e.g. Global Equity",
      "annual_fund_fee_percent": 0.20,
      "unit_price": 3.89,
      "unit_price_quote_unit": "gbp|gbx",
      "source_url": "Factsheet or provider link",
      "confidence": 85,
      "note": "Fee & ISIN source note"
    }
  ]
}
Rules:
- For unit prices in GBX (pence), set unit_price in pounds (e.g. 234.5p = 2.345) and set unit_price_quote_unit to "gbx".
- Try to find the exact underlying market ISIN whenever possible.
- If workplace plan charges differ from public factsheets, state it in the note.`;

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
        const text = payload.output_text || payload.output?.flatMap?.((item: any) => item.content?.map((c: any) => c.text) || []).join("\n") || "";
        return safeJsonFromText(text);
      }

      let parsed = await callOpenAi(true).catch(() => null);
      if (!parsed) parsed = await callOpenAi(false).catch(() => null);

      if (parsed?.funds?.length) {
        // Automatically save these newly discovered funds to our database!
        await saveDiscoveredFundsToDb(provider, parsed.funds);

        // Merge OpenAI funds with any existing DB funds
        const allFunds = [...parsed.funds, ...rankedCached];
        const merged = allFunds
          .filter((fund, idx, arr) => arr.findIndex((f) => normaliseFundSearchText(String(f.fund_name)) === normaliseFundSearchText(String(fund.fund_name))) === idx)
          .slice(0, 12);

        return NextResponse.json({
          usedOpenAi: true,
          provider,
          query,
          summary: parsed.summary || `Discovered ${parsed.funds.length} new fund(s) for ${provider} and added them to catalogue.`,
          funds: merged,
        });
      }
    } catch (err: any) {
      console.warn("[Catalogue Ingestion] OpenAI research failed:", err?.message);
    }
  }

  // 3. Fallback if no results and no OpenAI token available
  const known = findProvider(provider);
  return NextResponse.json({
    usedOpenAi: false,
    provider,
    query,
    summary: rankedCached.length
      ? `Found ${rankedCached.length} fund(s) in catalogue.`
      : "No exact catalogue match found. Add the fund manually and paste its factsheet URL.",
    funds: rankedCached.length > 0 ? rankedCached : [
      {
        fund_name: query || provider || "Custom Pension Fund",
        fund_code: null,
        underlying_isin: null,
        group_label: known?.name || "Pension Fund",
        annual_fund_fee_percent: null,
        unit_price: null,
        source_url: known?.docs?.[0]?.url || null,
        confidence: 25,
        note: "Manual entry fallback. Enter fund name, fee, and underlying ISIN manually.",
      },
    ],
  });
}