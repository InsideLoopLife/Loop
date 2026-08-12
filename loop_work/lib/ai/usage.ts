export type AiUsagePayload = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  [key: string]: any;
};

export type AiUsageLogInput = {
  provider?: string;
  model?: string | null;
  scope: string;
  component?: string | null;
  userId?: string | null;
  requestId?: string | null;
  usedWebSearch?: boolean;
  webSearchToolCalls?: number;
  metadata?: Record<string, any>;
};

function envBool(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(clean)) return true;
  if (["0", "false", "no", "n", "off"].includes(clean)) return false;
  return fallback;
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function isLoopMarketWorkerProcess() {
  return envBool("LOOP_MARKET_DATA_WORKER", false) || envBool("MARKET_DATA_WORKER_PROCESS", false);
}

export function isAiFeatureEnabled(args: { scope: string; requiresWebSearch?: boolean; worker?: boolean }) {
  if (envBool("LOOP_AI_DISABLED", false)) {
    return { allowed: false, reason: "LOOP_AI_DISABLED=true" };
  }

  const scope = String(args.scope || "").toLowerCase();
  const inWorker = args.worker ?? isLoopMarketWorkerProcess();

  if (inWorker) {
    // The worker has its own dedicated flag, checked above via
    // MARKET_DATA_WORKER_AI_COVERAGE_ENABLED. Previously the
    // scope-based check below ran unconditionally afterwards, so it
    // silently required LOOP_ENABLE_AI_MARKET_SEARCH too (a different,
    // non-worker flag) — meaning MARKET_DATA_WORKER_AI_COVERAGE_ENABLED
    // alone was never actually sufficient to turn AI coverage help on in
    // the worker, with no error or log line explaining why. The worker's
    // own flag is the single source of truth for worker context now.
    if (!envBool("MARKET_DATA_WORKER_AI_COVERAGE_ENABLED", false)) {
      return { allowed: false, reason: "MARKET_DATA_WORKER_AI_COVERAGE_ENABLED is not true" };
    }
  } else {
    if (scope.includes("investment") || scope.includes("market")) {
      if (!envBool("LOOP_ENABLE_AI_MARKET_SEARCH", false)) {
        return { allowed: false, reason: "LOOP_ENABLE_AI_MARKET_SEARCH is not true" };
      }
    }

    if (scope.includes("image") || scope.includes("holding_image")) {
      if (!envBool("LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT", false)) {
        return { allowed: false, reason: "LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT is not true" };
      }
    }
  }

  if (args.requiresWebSearch && !envBool("LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP", false)) {
    return { allowed: false, reason: "LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP is not true" };
  }

  return { allowed: true, reason: "enabled" };
}

function asNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractOpenAiUsage(payload: any) {
  const usage = (payload?.usage || {}) as AiUsagePayload;
  const inputTokens = asNumber(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens);
  const outputTokens = asNumber(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens);
  const totalTokens = asNumber(usage.total_tokens ?? usage.totalTokens) || inputTokens + outputTokens;
  const cachedInputTokens = asNumber(usage.input_token_details?.cached_tokens ?? usage.cached_tokens);
  const reasoningTokens = asNumber(usage.output_token_details?.reasoning_tokens ?? usage.reasoning_tokens);
  return { inputTokens, outputTokens, totalTokens, cachedInputTokens, reasoningTokens, rawUsage: usage };
}

export function countOpenAiWebSearchCalls(payload: any) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  let count = 0;
  for (const item of output) {
    const type = String(item?.type || "").toLowerCase();
    if (type.includes("web_search")) count += 1;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const partType = String(part?.type || "").toLowerCase();
      if (partType.includes("web_search")) count += 1;
    }
  }
  return count;
}

function estimateCostGbp(args: { model?: string | null; inputTokens: number; outputTokens: number; webSearchToolCalls: number }) {
  // Default to token-only tracking. If you want rough estimates later, set the env rates below in GBP per 1M tokens/tool-call.
  const modelKey = String(args.model || "default").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const inputRate = envNumber(`LOOP_AI_${modelKey}_INPUT_GBP_PER_1M`, envNumber("LOOP_AI_DEFAULT_INPUT_GBP_PER_1M", 0));
  const outputRate = envNumber(`LOOP_AI_${modelKey}_OUTPUT_GBP_PER_1M`, envNumber("LOOP_AI_DEFAULT_OUTPUT_GBP_PER_1M", 0));
  const webSearchRate = envNumber("LOOP_AI_WEB_SEARCH_GBP_PER_CALL", 0);
  return (args.inputTokens / 1_000_000) * inputRate + (args.outputTokens / 1_000_000) * outputRate + args.webSearchToolCalls * webSearchRate;
}

export async function recordOpenAiUsageFromPayload(supabase: any, payload: any, input: AiUsageLogInput) {
  if (!supabase?.from) return;
  const usage = extractOpenAiUsage(payload);
  const webSearchToolCalls = input.webSearchToolCalls ?? countOpenAiWebSearchCalls(payload);
  const row = {
    provider: input.provider || "openai",
    model: input.model || null,
    scope: input.scope,
    component: input.component || null,
    user_id: input.userId || null,
    request_id: input.requestId || null,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    cached_input_tokens: usage.cachedInputTokens,
    reasoning_tokens: usage.reasoningTokens,
    web_search_tool_calls: webSearchToolCalls,
    used_web_search: input.usedWebSearch ?? webSearchToolCalls > 0,
    estimated_cost_gbp: estimateCostGbp({ model: input.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, webSearchToolCalls }),
    metadata: { ...(input.metadata || {}), usage: usage.rawUsage },
  };
  try {
    await supabase.from("loop_ai_usage_events").insert(row as any);
  } catch {
    // Never let metering break the user flow or worker.
  }
}

export function aiGuardrailEnvSummary() {
  return {
    loopAiDisabled: envBool("LOOP_AI_DISABLED", false),
    marketWorkerAiCoverageEnabled: envBool("MARKET_DATA_WORKER_AI_COVERAGE_ENABLED", false),
    aiMarketSearchEnabled: envBool("LOOP_ENABLE_AI_MARKET_SEARCH", false),
    webSearchMarketLookupEnabled: envBool("LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP", false),
    holdingImageImportEnabled: envBool("LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT", false),
    marketWorkerProcess: isLoopMarketWorkerProcess(),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_PREMIUM_API_KEY || process.env.OPENAI_RESEARCH_API_KEY),
  };
}
