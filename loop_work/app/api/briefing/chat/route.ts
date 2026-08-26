import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFinancialBriefing, type FinancialBriefing } from "@/lib/briefing/build-financial-briefing";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { BRIEFING_CARD_DESCRIPTIONS, BRIEFING_CARD_KEYS, isBriefingCardKey, type BriefingCardKey } from "@/lib/briefing/chat-cards";

export const dynamic = "force-dynamic";

const ROUTE_KEY = "financial_briefing_chat";
const MAX_HISTORY_TURNS = 8;

type ChatTurn = { role: "user" | "assistant"; content: string };

type ChatBudget = { usedToday: number; dailyLimit: number | null; tierKey: string };
type ChatReply = { reply: string; card: BriefingCardKey | null; source: "ai" | "fallback"; note?: string; budget: ChatBudget };

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function money(value: number) {
  return `£${Math.round(Number(value || 0)).toLocaleString("en-GB")}`;
}

// Grounded, template-based answer used whenever AI isn't available (no key
// configured, budget exhausted, or the model call itself fails). It's not
// as flexible as a free-form answer but every figure in it is real, and the
// chat should never go silent just because the AI layer is unavailable.
function fallbackReply(message: string, briefing: FinancialBriefing): { reply: string; card: BriefingCardKey | null } {
  const q = message.toLowerCase();
  if (/pension.?fund|which pension|what pension/.test(q)) {
    return briefing.pensionFunds.length
      ? { reply: `You have ${briefing.pensionFunds.length} pension fund${briefing.pensionFunds.length === 1 ? "" : "s"} logged, totalling ${money(briefing.pensionFunds.reduce((t, f) => t + f.value, 0))}.`, card: "pension_funds_table" }
      : { reply: "Your pension pot value is tracked, but no individual fund breakdown is logged yet — add fund detail on a pension account to see it here.", card: null };
  }
  if (/holding|which (invest|fund|stock|share)|what (invest|fund|stock|share)/.test(q)) {
    return briefing.holdings.length
      ? { reply: `You have ${briefing.holdings.length} priced holding${briefing.holdings.length === 1 ? "" : "s"} worth ${money(briefing.investments.value)} in total.`, card: "holdings_table" }
      : { reply: "No priced holdings are linked yet — connect or add investment accounts to see them here.", card: null };
  }
  if (/net.?worth|overall|total|worth/.test(q)) {
    return { reply: `Your household net worth is ${money(briefing.currentNetWorth)} — ${money(briefing.assets)} in assets against ${money(briefing.liabilities)} in liabilities.`, card: "net_worth" };
  }
  if (/invest|portfolio|stock|fund|share/.test(q)) {
    return { reply: `Your priced investments are worth ${money(briefing.investments.value)}. ${briefing.investments.topExposure ? `${briefing.investments.topExposure} is your largest exposure at about ${briefing.investments.topExposurePercent.toFixed(0)}%.` : "Connect or refresh holdings for exposure detail."}`, card: "portfolio" };
  }
  if (/saving|isa|interest|rate/.test(q)) {
    return { reply: `Savings sit at ${money(briefing.savings.balance)}, blended rate ${briefing.savings.blendedRate.toFixed(2)}%. £${Math.round(briefing.savings.monthlyDeposits).toLocaleString("en-GB")} banked this month.`, card: "savings" };
  }
  if (/mortgage|house|home|property|equity|ltv/.test(q)) {
    return briefing.home
      ? { reply: `Estimated home equity is ${money(briefing.home.equity)}, mortgage ${money(briefing.home.mortgage)}, LTV around ${briefing.home.ltv.toFixed(0)}%.`, card: "home" }
      : { reply: "No property is linked yet, so I can't show equity or LTV.", card: null };
  }
  if (/spend|budget|flow|income|outgoing/.test(q)) {
    return { reply: `This month: ${money(briefing.flow.income)} income, ${money(briefing.flow.spending)} spending, ${money(briefing.flow.savings)} to savings, ${money(briefing.flow.unassigned)} unassigned.`, card: "flow" };
  }
  if (/what should i do|next step|priorit|recommend|advice/.test(q)) {
    return { reply: briefing.actions[0] ? `Top priority: ${briefing.actions[0].title}. ${briefing.actions[0].body}` : "Nothing urgent stands out right now.", card: "actions" };
  }
  return { reply: briefing.narrative[0] || `Your net worth is ${money(briefing.currentNetWorth)}.`, card: null };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const entitlements = await getEffectiveEntitlements(user.id);
  if (!featureEnabled(entitlements, "ai_financial_briefing")) {
    return NextResponse.json({ error: "Not entitled" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim().slice(0, 1000);
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-MAX_HISTORY_TURNS) as ChatTurn[];
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const context = await getActiveHouseholdContext(supabase, user);
  const briefing = await buildFinancialBriefing(supabase, user, visibleDataOrFilter(context));
  const fallback = fallbackReply(message, briefing);

  // Checked up front regardless of whether an OpenAI key is configured, so the
  // usage meter always has real numbers to show, even in a pure-fallback reply.
  const budgetCheck = await checkAiRouteAllowed(supabase, user.id, ROUTE_KEY);
  const budget: ChatBudget = { usedToday: budgetCheck.usedToday, dailyLimit: budgetCheck.dailyLimit, tierKey: budgetCheck.tierKey };

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) return NextResponse.json({ ...fallback, source: "fallback", budget } satisfies ChatReply);

  if (!budgetCheck.allowed) {
    return NextResponse.json({ ...fallback, source: "fallback", note: `${budgetCheck.reason} Resets at midnight.`, budget } satisfies ChatReply);
  }

  try {
    const cardMenu = BRIEFING_CARD_KEYS.map((key) => `"${key}": ${BRIEFING_CARD_DESCRIPTIONS[key]}`).join("\n");
    const prompt = `You are the conversational financial briefing assistant inside LOOP, a private UK household finance app. You are talking to ${briefing.firstName}.

Ground every reply strictly in the household data JSON below — never invent or estimate a figure that isn't in it. If something specific isn't in the data (e.g. a spending category or asset type that doesn't exist for this household), say so plainly and suggest what to add or connect — do not pad the reply with unrelated data-quality commentary.

Household data (all figures already computed, GBP):
${JSON.stringify(briefing)}

Available cards you may optionally surface alongside your reply (pick the single most relevant one, or null if none fits):
${cardMenu}

Conversation so far:
${history.map((t) => `${t.role}: ${t.content}`).join("\n") || "(none yet)"}

New message from ${briefing.firstName}: ${JSON.stringify(message)}

Reply with JSON only, matching exactly: {"reply": "your natural, concise chat reply (2-4 sentences max, no markdown headers)", "card": "one of ${BRIEFING_CARD_KEYS.join("|")}, or null"}.
Rules:
- Be warm but concise, like a knowledgeable friend, not a report.
- Never give regulated financial advice — frame suggestions as things to consider or discuss with a professional.
- Stay strictly within the provided data for any number you state.
- Prefer a table or graph card over plain text whenever the data for one exists — holdings_table and pension_funds_table give real per-item detail, not just totals, so reach for them whenever the question is about "what/which" holdings or funds someone has.
- If the user asks to see a graph, chart, or trend for something, pick the card for that category even if you already showed it earlier — every value-based card already includes a live trend graph, so re-showing it is correct and expected.
- If nothing in the data answers the question, set card to null. Do NOT attach the evidence card as a generic fallback — that card is reserved specifically for when the user asks broadly what data is missing or incomplete across their whole household, and attaching it for an unrelated unanswerable question is misleading since it always reports the household's core records as fine.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.LOOP_FINANCIAL_BRIEFING_CHAT_MODEL || "gpt-4.1-mini",
        input: prompt,
        text: { format: { type: "json_object" } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ ...fallback, source: "fallback", budget } satisfies ChatReply);

    const text = String(
      payload.output_text ||
        payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") ||
        "",
    );
    const parsed = safeJson(text);
    const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : fallback.reply;
    const card = isBriefingCardKey(parsed?.card) ? parsed.card : null;

    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budgetCheck.tierKey, routeKey: ROUTE_KEY, provider: "openai", model: process.env.LOOP_FINANCIAL_BRIEFING_CHAT_MODEL || "gpt-4.1-mini" });

    return NextResponse.json({ reply, card, source: "ai", budget: { ...budget, usedToday: budget.usedToday + 1 } } satisfies ChatReply);
  } catch {
    return NextResponse.json({ ...fallback, source: "fallback", budget } satisfies ChatReply);
  }
}
