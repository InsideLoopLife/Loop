// One gate in front of every OpenAI call the web server makes.
//
// Loop calls api.openai.com from ~20 places, most of which never checked the
// LOOP_AI_DISABLED switch, had no spend limit and recorded nothing. Rather than
// rely on each route remembering, this wraps the server's fetch once (from
// instrumentation.ts) so every request to OpenAI:
//   1. is refused when LOOP_AI_DISABLED=true,
//   2. is refused once today's estimated spend or web-search count hits the cap,
//   3. is recorded in loop_ai_usage_events with tokens, searches and a cost estimate.
// A refused call gets a normal HTTP error back, which every route already treats
// as "AI unavailable" and falls back to its non-AI path.
//
// Caps (env, per day, UTC):
//   LOOP_AI_DAILY_BUDGET_GBP          default 3
//   LOOP_AI_DAILY_WEB_SEARCH_LIMIT    default 40

import { createAdminClient } from "@/platform/database/admin-client";

const OPENAI_HOST = "api.openai.com";
const USD_TO_GBP = 0.79;
// Web search tool calls are charged per call on top of tokens. Rounded up to be safe.
const WEB_SEARCH_USD_PER_CALL = 0.03;

// USD per 1M tokens [input, output]. Unknown models use the dearest row so estimates err high.
const MODEL_RATES: [RegExp, number, number][] = [
  [/gpt-4\.1-nano/, 0.1, 0.4],
  [/gpt-4\.1-mini/, 0.4, 1.6],
  [/gpt-4\.1/, 2, 8],
  [/gpt-4o-mini/, 0.15, 0.6],
  [/gpt-4o/, 2.5, 10],
  [/gpt-5-nano/, 0.05, 0.4],
  [/gpt-5-mini/, 0.25, 2],
  [/gpt-5/, 1.25, 10],
  [/o4-mini|o3-mini/, 1.1, 4.4],
  [/text-embedding/, 0.13, 0],
];
const FALLBACK_RATE: [number, number] = [2.5, 10];

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function aiSwitchedOff() {
  return ["1", "true", "yes", "on"].includes(String(process.env.LOOP_AI_DISABLED || "").trim().toLowerCase());
}

export function estimateCostGbp(model: string, inputTokens: number, outputTokens: number, webSearches: number) {
  const rate = MODEL_RATES.find(([pattern]) => pattern.test(model));
  const [input, output] = rate ? [rate[1], rate[2]] : FALLBACK_RATE;
  const usd = (inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output + webSearches * WEB_SEARCH_USD_PER_CALL;
  return { usd, gbp: usd * USD_TO_GBP };
}

/** The app route that made the call, read from the stack (server chunks keep their app/ path). */
export function routeFromStack(raw = new Error().stack || "") {
  const stack = raw
    .split("\n")
    .filter((line) => !/openai-guard|node:internal|node_modules|next[\\/]dist|router-utils|instrumentation/.test(line))
    .join("\n");
  const match = stack.match(/app[\\/]((?:[\w\-.[\]()@]+[\\/])*?[\w\-.[\]()@]+)[\\/](?:route|page|actions?)\.(?:js|ts|tsx)/);
  if (match) return match[1].replace(/\\/g, "/");
  const lib = stack.match(/(lib[\\/][\w\-/\\]+?)\.(?:js|ts)/);
  if (lib) return lib[1].replace(/\\/g, "/");
  const chunk = stack.match(/\b((?:app|lib)_[\w-]+?)_(?:ts|tsx|js)_/);
  return chunk ? chunk[1].replace(/_/g, "/") : "unknown";
}

export function countWebSearches(payload: any) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output.filter((item: any) => String(item?.type || "").includes("web_search")).length;
}

type Day = { day: string; gbp: number; searches: number; calls: number; loadedAt: number };
const state: { day: Day | null; loading: Promise<Day> | null } = { day: null, loading: null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function loadDay(): Promise<Day> {
  const day = today();
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("loop_ai_usage_events")
      .select("estimated_cost_gbp, web_search_tool_calls")
      .gte("created_at", `${day}T00:00:00Z`)
      .limit(5000);
    const rows = (data || []) as { estimated_cost_gbp: number | string | null; web_search_tool_calls: number | null }[];
    return {
      day,
      gbp: rows.reduce((sum, row) => sum + Number(row.estimated_cost_gbp || 0), 0),
      searches: rows.reduce((sum, row) => sum + Number(row.web_search_tool_calls || 0), 0),
      calls: rows.length,
      loadedAt: Date.now(),
    };
  } catch {
    // If the count can't be read, fall back to what this server has seen today.
    const seen = state.day && state.day.day === day ? state.day : null;
    return { day, gbp: seen?.gbp || 0, searches: seen?.searches || 0, calls: seen?.calls || 0, loadedAt: Date.now() };
  }
}

async function currentDay() {
  const day = today();
  const fresh = state.day && state.day.day === day && Date.now() - state.day.loadedAt < 60_000;
  if (fresh) return state.day as Day;
  if (!state.loading) {
    state.loading = loadDay().then((loaded) => {
      // Keep anything counted in memory since the read started.
      if (state.day && state.day.day === loaded.day) {
        loaded.gbp = Math.max(loaded.gbp, state.day.gbp);
        loaded.searches = Math.max(loaded.searches, state.day.searches);
        loaded.calls = Math.max(loaded.calls, state.day.calls);
      }
      state.day = loaded;
      state.loading = null;
      return loaded;
    });
  }
  return state.loading;
}

function refuse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message, type: "loop_ai_guard", code: status === 503 ? "ai_disabled" : "daily_limit" } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function record(row: Record<string, unknown>) {
  try {
    await createAdminClient().from("loop_ai_usage_events").insert(row);
  } catch {
    // Metering must never break the feature.
  }
}

export function checkLimits(day: Pick<Day, "gbp" | "searches">, wantsSearch: boolean) {
  const budget = envNumber("LOOP_AI_DAILY_BUDGET_GBP", 3);
  const searchLimit = envNumber("LOOP_AI_DAILY_WEB_SEARCH_LIMIT", 40);
  if (day.gbp >= budget) return `Loop's AI budget for today (£${budget.toFixed(2)}) has been used. It resets at midnight.`;
  if (wantsSearch && day.searches >= searchLimit) return `Loop's web lookups for today (${searchLimit}) have been used. They reset at midnight.`;
  return null;
}

export function installOpenAiGuard() {
  const g = globalThis as typeof globalThis & { __loopOpenAiGuard?: boolean };
  if (g.__loopOpenAiGuard || typeof g.fetch !== "function") return;
  g.__loopOpenAiGuard = true;
  const realFetch = g.fetch.bind(g);

  g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    } catch {
      return realFetch(input, init);
    }
    if (!url.includes(OPENAI_HOST)) return realFetch(input, init);

    const route = routeFromStack();
    const body = typeof init?.body === "string" ? init.body : "";
    const wantsSearch = /"web_search/.test(body);
    let requestedModel = "unknown";
    try {
      requestedModel = String(JSON.parse(body || "{}").model || "unknown");
    } catch {
      /* not JSON */
    }

    if (aiSwitchedOff()) {
      return refuse(503, "AI is switched off in Loop.");
    }

    const day = await currentDay();
    const limited = checkLimits(day, wantsSearch);
    if (limited) {
      console.warn(JSON.stringify({ event: "ai_guard_refused", route, reason: limited }));
      void record({ route_key: route, scope: route, component: "openai-guard", model: requestedModel, request_status: "refused", guardrail_result: limited });
      return refuse(429, limited);
    }

    let response = await realFetch(input, init);
    // A revoked personal key saved in Loop shouldn't break every AI feature when the
    // server has its own key: retry once with the server key.
    const serverKey = process.env.OPENAI_API_KEY || "";
    if (response.status === 401 && serverKey && init) {
      const headers = new Headers(init.headers || {});
      if (headers.get("authorization") !== `Bearer ${serverKey}`) {
        headers.set("authorization", `Bearer ${serverKey}`);
        console.warn(JSON.stringify({ event: "openai_saved_key_rejected", route }));
        void record({ route_key: route, scope: route, component: "openai-guard", model: requestedModel, request_status: "http_401_saved_key" });
        response = await realFetch(input, { ...init, headers });
      }
    }
    // Count the call straight away so parallel calls see it.
    day.calls += 1;
    if (wantsSearch) day.searches += 1;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("event-stream")) {
      // Streamed answers carry no usage block we can read without consuming the stream:
      // record the call with a conservative flat estimate.
      const flat = estimateCostGbp(requestedModel, 4000, 1000, wantsSearch ? 1 : 0);
      day.gbp += flat.gbp;
      void record({ route_key: route, scope: route, component: "openai-guard", model: requestedModel, request_status: response.ok ? "streamed" : `http_${response.status}`, web_search_tool_calls: wantsSearch ? 1 : 0, estimated_cost_usd: flat.usd, estimated_cost_gbp: flat.gbp, metadata: { estimated: true } });
      return response;
    }

    void response
      .clone()
      .json()
      .then((payload: any) => {
        const usage = payload?.usage || {};
        const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
        const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
        const searches = countWebSearches(payload);
        const model = String(payload?.model || requestedModel);
        const cost = estimateCostGbp(model, inputTokens, outputTokens, searches);
        day.gbp += cost.gbp;
        if (searches > 1) day.searches += searches - 1;
        return record({
          route_key: route,
          scope: route,
          component: "openai-guard",
          model,
          request_status: response.ok ? "completed" : `http_${response.status}`,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          estimated_input_tokens: inputTokens,
          estimated_output_tokens: outputTokens,
          web_search_tool_calls: searches,
          estimated_cost_usd: Number(cost.usd.toFixed(6)),
          estimated_cost_gbp: Number(cost.gbp.toFixed(6)),
          estimated_cost_pence: Math.ceil(cost.gbp * 100),
        });
      })
      .catch(() => record({ route_key: route, scope: route, component: "openai-guard", model: requestedModel, request_status: response.ok ? "unreadable" : `http_${response.status}` }));

    return response;
  }) as typeof fetch;
}
