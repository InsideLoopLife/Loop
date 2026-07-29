import { envForProvider, type LoopAiProviderKey } from "@/lib/ai/provider-catalog";

export type LoopAiTaskKind =
  | "quick_runtime"
  | "security_review"
  | "product_enrichment"
  | "nutrition_estimate"
  | "investment_research"
  | "household_assistant"
  | "vision_label_scan"
  | "profile_insight"
  | "nutrition_recommendation"
  | "property_insight";

export type LoopTierKey = "free" | "plus" | "premium" | "pro" | "staff" | string;

export type LoopAiRoute = {
  task: LoopAiTaskKind;
  tierKey?: LoopTierKey | null;
  provider: LoopAiProviderKey;
  model: string;
  apiKeyEnvName: string;
  reason: string;
  dailyLimit?: number | null;
  monthlyBudgetPence?: number | null;
};

type ResolveArgs = {
  task: LoopAiTaskKind;
  tierKey?: LoopTierKey | null;
  severity?: "low" | "medium" | "high" | "critical" | string | null;
  needsVision?: boolean;
  env?: NodeJS.ProcessEnv;
  providerOverride?: LoopAiProviderKey | string | null;
  modelOverride?: string | null;
  apiKeyEnvOverride?: string | null;
};

const tierRank: Record<string, number> = {
  free: 0,
  plus: 1,
  premium: 2,
  pro: 3,
  staff: 4,
  admin: 4,
};

function rank(tierKey?: string | null) {
  return tierRank[String(tierKey || "free").toLowerCase()] ?? 0;
}

function envValue(env: NodeJS.ProcessEnv, names: string[], fallback: string) {
  for (const name of names) {
    if (env[name]) return String(env[name]);
  }
  return fallback;
}

function normaliseProvider(provider?: string | null): LoopAiProviderKey {
  if (provider === "anthropic" || provider === "google" || provider === "manual") return provider;
  return "openai";
}

function customerLimit(tierKey: string, route: "profile_insight" | "nutrition_recommendation" | "property_insight") {
  const tier = String(tierKey || "free").toLowerCase();
  const limits: Record<string, Record<typeof route, { daily: number; budget: number }>> = {
    free: {
      profile_insight: { daily: 5, budget: 25 },
      nutrition_recommendation: { daily: 5, budget: 25 },
      property_insight: { daily: 2, budget: 20 },
    },
    plus: {
      profile_insight: { daily: 35, budget: 250 },
      nutrition_recommendation: { daily: 35, budget: 250 },
      property_insight: { daily: 10, budget: 200 },
    },
    premium: {
      profile_insight: { daily: 100, budget: 900 },
      nutrition_recommendation: { daily: 100, budget: 900 },
      property_insight: { daily: 35, budget: 700 },
    },
    pro: {
      profile_insight: { daily: 250, budget: 2500 },
      nutrition_recommendation: { daily: 250, budget: 2500 },
      property_insight: { daily: 100, budget: 2000 },
    },
    staff: {
      profile_insight: { daily: 1000, budget: 0 },
      nutrition_recommendation: { daily: 1000, budget: 0 },
      property_insight: { daily: 1000, budget: 0 },
    },
  };
  return limits[tier]?.[route] || limits.free[route];
}

export function resolveLoopAiRoute({ task, tierKey = "free", severity, needsVision, env = process.env, providerOverride, modelOverride, apiKeyEnvOverride }: ResolveArgs): LoopAiRoute {
  const tier = String(tierKey || "free").toLowerCase();
  const userRank = rank(tier);
  const severe = severity === "high" || severity === "critical";
  const provider = normaliseProvider(providerOverride);
  const providerEnv = apiKeyEnvOverride || envForProvider(provider);

  if (task === "profile_insight" || task === "nutrition_recommendation" || task === "property_insight") {
    const route = task as "profile_insight" | "nutrition_recommendation" | "property_insight";
    const limits = customerLimit(tier, route);
    const defaultModel = userRank >= 2 ? "gpt-4.1" : "gpt-4.1-mini";
    return {
      task,
      tierKey: tier,
      provider,
      model: modelOverride || envValue(env, [`LOOP_${route.toUpperCase()}_MODEL`, "LOOP_CUSTOMER_AI_MODEL"], defaultModel),
      apiKeyEnvName: providerEnv || envValue(env, [`LOOP_${route.toUpperCase()}_KEY_ENV`, "LOOP_CUSTOMER_AI_KEY_ENV"], userRank >= 2 ? "OPENAI_PREMIUM_API_KEY" : "OPENAI_API_KEY"),
      reason: "Customer-facing AI is budgeted per user and per route, using the tier's daily request limit and monthly pence budget.",
      dailyLimit: limits.daily,
      monthlyBudgetPence: limits.budget || null,
    };
  }

  if (needsVision || task === "vision_label_scan") {
    return {
      task: "vision_label_scan",
      tierKey: tier,
      provider,
      model: modelOverride || envValue(env, ["LOOP_VISION_AI_MODEL", "OPENAI_VISION_MODEL", "OPENAI_RESEARCH_MODEL"], userRank >= 2 ? "gpt-4.1" : "gpt-4.1-mini"),
      apiKeyEnvName: providerEnv || envValue(env, ["LOOP_VISION_AI_KEY_ENV"], userRank >= 2 ? "OPENAI_PREMIUM_API_KEY" : "OPENAI_API_KEY"),
      reason: "Vision/image work is routed separately from text-only quick checks.",
      dailyLimit: userRank >= 2 ? 500 : 50,
    };
  }

  if (task === "security_review" || severe) {
    return {
      task,
      tierKey: tier,
      provider: providerOverride ? provider : "openai",
      model: modelOverride || envValue(env, ["LOOP_SECURITY_AI_MODEL", "OPENAI_SECURITY_MODEL", "OPENAI_RESEARCH_MODEL"], "gpt-4.1"),
      apiKeyEnvName: apiKeyEnvOverride || envValue(env, ["LOOP_SECURITY_AI_KEY_ENV"], "OPENAI_SECURITY_API_KEY"),
      reason: "Security/high-severity issues use a slower, stronger system lane and can use a separate key/budget.",
      dailyLimit: 100,
    };
  }

  if (task === "investment_research") {
    return {
      task,
      tierKey: tier,
      provider,
      model: modelOverride || envValue(env, ["LOOP_INVESTMENT_AI_MODEL", "OPENAI_RESEARCH_MODEL"], "gpt-4.1-mini"),
      apiKeyEnvName: providerEnv || envValue(env, ["LOOP_INVESTMENT_AI_KEY_ENV"], "OPENAI_API_KEY"),
      reason: "Investment coverage is an admin/system research lane. User-facing access should be governed by market-data entitlements separately.",
      dailyLimit: 250,
    };
  }

  if (task === "product_enrichment" || task === "nutrition_estimate") {
    return {
      task,
      tierKey: tier,
      provider,
      model: modelOverride || envValue(env, ["LOOP_PRODUCT_IMPORT_AI_MODEL", "OPENAI_RESEARCH_MODEL"], "gpt-4.1-mini"),
      apiKeyEnvName: providerEnv || envValue(env, ["LOOP_PRODUCT_AI_KEY_ENV"], "OPENAI_API_KEY"),
      reason: "High-volume product/nutrition enrichment defaults to a low-cost system lane unless overridden.",
      dailyLimit: 1000,
    };
  }

  return {
    task,
    tierKey: tier,
    provider,
    model: modelOverride || envValue(env, ["LOOP_RUNTIME_ISSUE_AI_MODEL", "OPENAI_HELP_MODEL", "OPENAI_RESEARCH_MODEL"], "gpt-4.1-mini"),
    apiKeyEnvName: providerEnv || envValue(env, ["LOOP_QUICK_AI_KEY_ENV"], "OPENAI_API_KEY"),
    reason: "Quick runtime/admin checks use the cheapest fast system model by default.",
    dailyLimit: 500,
  };
}
