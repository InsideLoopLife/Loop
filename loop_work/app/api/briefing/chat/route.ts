import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFinancialBriefing } from "@/lib/briefing/build-financial-briefing";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { recordAiRouteUsage } from "@/lib/ai/route-budget";
import { getMonthlyChatBudget } from "@/lib/briefing/chat-usage";
import { BRIEFING_CARD_DESCRIPTIONS, BRIEFING_CARD_KEYS, isBriefingCardKey, type BriefingCardKey } from "@/lib/briefing/chat-cards";
import { appendTodaysChatMessages, loadTodaysChatMessages } from "@/lib/briefing/chat-session";
import { runLogicLibrary } from "@/lib/briefing/logic-library";
import { logLogicLibraryGap } from "@/lib/briefing/logic-gaps";
import type { BriefingLineChart } from "@/lib/briefing/projections";

export const dynamic = "force-dynamic";

const ROUTE_KEY = "financial_briefing_chat";
const MAX_HISTORY_TURNS = 8;

type ChatTurn = { role: "user" | "assistant"; content: string };

type ChatBudget = { usedThisMonth: number; monthlyLimit: number | null; tierKey: string };
type ChatReply = { reply: string; card: BriefingCardKey | null; chart?: BriefingLineChart | null; source: "logic" | "ai" | "fallback"; note?: string; budget: ChatBudget };

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

// GET returns today's persisted conversation (UTC-day scoped) so the chat
// shell can hydrate with continuity after navigation or a reload, instead
// of always starting over.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const entitlements = await getEffectiveEntitlements(user.id);
  if (!featureEnabled(entitlements, "ai_financial_briefing")) {
    return NextResponse.json({ error: "Not entitled" }, { status: 403 });
  }

  const messages = await loadTodaysChatMessages(supabase, user.id);
  return NextResponse.json({ messages });
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

  // Every branch below funnels through this so the day's conversation is
  // persisted regardless of source — logic-library, AI, or fallback are
  // all real exchanges worth remembering.
  async function respond(result: Omit<ChatReply, "budget">, budget: ChatBudget) {
    await appendTodaysChatMessages(supabase, user!.id, [
      { role: "user", content: message },
      { role: "assistant", content: result.reply, card: result.card, chart: result.chart ?? null },
    ]);
    return NextResponse.json({ ...result, budget } satisfies ChatReply);
  }

  const context = await getActiveHouseholdContext(supabase, user);
  const briefing = await buildFinancialBriefing(supabase, user, visibleDataOrFilter(context));

  // Budget is still resolved up front purely for display — the usage
  // indicator should always show real numbers, whichever path answers.
  const budgetCheck = await getMonthlyChatBudget(supabase, user.id, ROUTE_KEY);
  const budget: ChatBudget = { usedThisMonth: budgetCheck.usedThisMonth, monthlyLimit: budgetCheck.monthlyLimit, tierKey: budgetCheck.tierKey };

  // The logic library is tried FIRST, before any AI cost is even
  // considered. A covered question costs zero tokens and answers
  // instantly — this is the actual mechanism that makes AI usage shrink
  // over time as more question shapes get a skill here.
  const logicResult = runLogicLibrary(message, briefing);
  if (logicResult) {
    return respond({ ...logicResult, source: "logic" }, budget);
  }

  // Nothing in the logic library covers this — log it so a recurring
  // pattern can become a new skill later, then fall through to a real AI
  // call (which does cost a token, subject to the monthly budget below).
  await logLogicLibraryGap(supabase, user.id, message);

  const genericFallback = { reply: briefing.narrative[0] || "I don't have a specific answer for that yet.", card: null as BriefingCardKey | null, chart: null as BriefingLineChart | null };

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) return respond({ ...genericFallback, source: "fallback" }, budget);

  if (!budgetCheck.allowed) {
    return respond({ ...genericFallback, source: "fallback", note: `${budgetCheck.reason} Resets next month.` }, budget);
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
- Stay strictly within the provided data for any number you state. Never do your own compound-interest, growth, or projection maths — if a projection is needed, say projections aren't available for that yet rather than estimating one.
- Prefer a table or graph card over plain text whenever the data for one exists — holdings_table and pension_funds_table give real per-item detail, not just totals, so reach for them whenever the question is about "what/which" holdings or funds someone has.
- If the user asks to see a graph, chart, or trend for something, pick the card for that category even if you already showed it earlier — every value-based card already includes a live trend graph, so re-showing it is correct and expected.
- If nothing in the data answers the question, set card to null. Do NOT attach the evidence card as a generic fallback — that card is reserved specifically for when the user asks broadly what data is missing or incomplete across their whole household, and attaching it for an unrelated unanswerable question is misleading since it always reports the household's core records as fine.
- Be specific and genuinely interesting, not generic. When a table is available (holdings, pension funds), name the actual best/worst performer or highest-fee item rather than only stating a total — e.g. "X leads at Y%, while Z lags at W%" is far more useful than "performance varies." Pull out one concrete standout fact whenever the data supports it.`;

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
    if (!response.ok) return respond({ ...genericFallback, source: "fallback" }, budget);

    const text = String(
      payload.output_text ||
        payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") ||
        "",
    );
    const parsed = safeJson(text);
    const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : genericFallback.reply;
    const card = isBriefingCardKey(parsed?.card) ? parsed.card : null;

    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budgetCheck.tierKey, routeKey: ROUTE_KEY, provider: "openai", model: process.env.LOOP_FINANCIAL_BRIEFING_CHAT_MODEL || "gpt-4.1-mini" });

    return respond({ reply, card, chart: null, source: "ai" }, { ...budget, usedThisMonth: budget.usedThisMonth + 1 });
  } catch {
    return respond({ ...genericFallback, source: "fallback" }, budget);
  }
}
