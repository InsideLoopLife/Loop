export type AiFeatureGuardInput = {
  scope?: string;
  requiresWebSearch?: boolean;
  worker?: boolean;
};

function envBool(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(clean)) return true;
  if (["0", "false", "no", "n", "off"].includes(clean)) return false;
  return fallback;
}

function marketWorkerProcess() {
  return (
    envBool("LOOP_MARKET_DATA_WORKER", false) ||
    envBool("MARKET_DATA_WORKER_PROCESS", false) ||
    process.env.RENDER_SERVICE_TYPE === "worker"
  );
}

export function isAiFeatureEnabled(input: AiFeatureGuardInput = {}) {
  const scope = input.scope || "unknown";
  const isWorker = input.worker === true || marketWorkerProcess();

  if (envBool("LOOP_AI_DISABLED", false)) {
    return { allowed: false, reason: "LOOP_AI_DISABLED=true", scope };
  }

  if (isWorker) {
    if (scope === "investment_market_search") {
      return { allowed: false, reason: "AI market search is blocked in the market-data worker", scope };
    }
    if (!envBool("MARKET_DATA_WORKER_AI_COVERAGE_ENABLED", false)) {
      return { allowed: false, reason: "MARKET_DATA_WORKER_AI_COVERAGE_ENABLED is not true", scope };
    }
  }

  if (scope === "investment_market_search" && !envBool("LOOP_ENABLE_AI_MARKET_SEARCH", false)) {
    return { allowed: false, reason: "LOOP_ENABLE_AI_MARKET_SEARCH is not true", scope };
  }

  if (input.requiresWebSearch && !envBool("LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP", false)) {
    return { allowed: false, reason: "LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP is not true", scope };
  }

  return { allowed: true, reason: "enabled", scope };
}

function usageFromPayload(payload: any) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens || 0);
  return { inputTokens, outputTokens, totalTokens };
}

export async function recordOpenAiUsageFromPayload(
  supabase: any,
  payload: any,
  context: {
    model?: string | null;
    scope?: string | null;
    component?: string | null;
    userId?: string | null;
    usedWebSearch?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
) {
  if (!supabase?.from) return;
  if (marketWorkerProcess()) return;
  const { inputTokens, outputTokens, totalTokens } = usageFromPayload(payload);
  try {
    await supabase.from("loop_ai_usage_events").insert({
      user_id: context.userId || null,
      scope: context.scope || "unknown",
      component: context.component || "unknown",
      provider: "openai",
      model: context.model || null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      web_search_tool_calls: context.usedWebSearch ? 1 : 0,
      estimated_cost_gbp: 0,
      estimated_cost_usd: 0,
      request_reason: context.scope || null,
      guardrail_result: "recorded",
      metadata: context.metadata || {},
    });
  } catch (error) {
    console.warn("[ai-usage] usage log skipped", error instanceof Error ? error.message : error);
  }
}
