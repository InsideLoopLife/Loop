import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";

const helpContext = `
Loop feature help:
- Notifications: Account > Notifications. Tabs split Wealth, Lifestyle, Household and All. Household invites and approval requests are shown first. Weekly insights can be dismissed after reading.
- Private beta access: a server-side access code unlocks /login. The code is not printed in the client HTML. Use LOOP_ACCESS_CODE_HASH and LOOP_ACCESS_COOKIE_VALUE in production.
- LoopHealth: Add recipe, Log food, Meal cards and the full daily nutrient dashboard. Recipe imports use public page evidence and the saved OpenAI token when available.
- LoopHealth food logging: quick-search a branded product, paste a URL when no match is found, allocate to one or many people, and review nutrients by day.
- Financial Flow: tracks recurring bills, renewals, drop-offs, student loan and household/person outgoings.
- Investments: tracks pots, holdings, price history and weekly/monthly/yearly insight notifications.
`;

function fallbackAnswer(question: string) {
  const q = question.toLowerCase();
  if (q.includes("notification")) return "Open Account > Notifications. Household invites and profile/food approvals sit at the top. Use the Wealth and Lifestyle tabs to separate investment/spending nudges from nutrition and health nudges.";
  if (q.includes("access") || q.includes("code") || q.includes("login")) return "Use the private beta access page first. The access code is checked server-side and unlocks the login page with an HTTP-only cookie. In production, set LOOP_ACCESS_CODE_HASH and LOOP_ACCESS_COOKIE_VALUE.";
  if (q.includes("recipe") || q.includes("menu") || q.includes("food")) return "In LoopHealth, use Add recipe for recipes and Log food for quick product/menu imports. If search fails, paste a public URL and LoopHealth will use page evidence plus AI where configured.";
  if (q.includes("investment") || q.includes("stock")) return "Open Investments to add pots and holdings. Weekly insight notifications summarise cumulative progress and link back to investments with week/month/year period views.";
  return "I can help with LoopHealth, Financial Flow, investments, notifications, household sharing and the private beta access gate. Try asking how to import a menu, accept a household request, or understand a weekly insight.";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").slice(0, 500);
  if (!question.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai").catch(() => null);
  if (!secret?.value) return NextResponse.json({ answer: fallbackAnswer(question), usedOpenAi: false });

  const budget = await checkAiRouteAllowed(supabase, user.id, "quick_runtime");
  if (!budget.allowed) return NextResponse.json({ answer: fallbackAnswer(question), usedOpenAi: false });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_HELP_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        input: `You are Loop's in-app help assistant. Answer the user's question using only this product documentation context. Keep it practical and concise.\n\n${helpContext}\n\nQuestion: ${question}`,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI help failed");
    const answer = typeof payload.output_text === "string" ? payload.output_text : payload.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text).filter(Boolean).join("\n");
    if (answer) await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "quick_runtime", provider: "openai", model: process.env.OPENAI_HELP_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });
    return NextResponse.json({ answer: answer || fallbackAnswer(question), usedOpenAi: Boolean(answer) });
  } catch {
    return NextResponse.json({ answer: fallbackAnswer(question), usedOpenAi: false });
  }
}
