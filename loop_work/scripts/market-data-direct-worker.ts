/// <reference types="node" />

import { createAdminClient } from "@/lib/supabase/admin";
import { runInvestmentPriceSnapshotJob, runInvestmentSnapshotMaintenance } from "@/lib/investments/price-snapshot-runner";

process.env.LOOP_MARKET_DATA_WORKER = process.env.LOOP_MARKET_DATA_WORKER || "true";

// v28.36 safety: this Render worker must never spend on OpenAI/web-search.
// It prices known/resolved instruments only. Unknowns are queued for admin coverage review.
process.env.LOOP_AI_DISABLED = process.env.LOOP_AI_DISABLED || "true";
process.env.MARKET_DATA_WORKER_AI_COVERAGE_ENABLED = process.env.MARKET_DATA_WORKER_AI_COVERAGE_ENABLED || "false";
process.env.LOOP_ENABLE_AI_MARKET_SEARCH = process.env.LOOP_ENABLE_AI_MARKET_SEARCH || "false";
process.env.LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP = process.env.LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP || "false";
process.env.LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT = process.env.LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT || "false";

function scrubWorkerAiSecrets(): string[] {
  const aiKeys = [
    "OPENAI_API_KEY",
    "OPENAI_PREMIUM_API_KEY",
    "OPENAI_SECURITY_API_KEY",
    "OPENAI_RESEARCH_API_KEY",
    "OPENAI_TOKEN",
    "LOOP_OPENAI_API_KEY",
  ];
  const env = process.env as Record<string, string | undefined>;
  const present = aiKeys.filter((key) => Boolean(env[key]));
  for (const key of present) {
    delete env[key];
  }
  if (present.length) {
    console.warn(`[market-data-direct-worker] OpenAI env keys were present on the worker and have been ignored: ${present.join(", ")}`);
  }
  return present;
}

const scrubbedAiKeys = scrubWorkerAiSecrets();

const DEFAULT_PRICE_INTERVAL_MINUTES = 1;
const DEFAULT_SNAPTRADE_INTERVAL_MINUTES = 1;
const DEFAULT_MAINTENANCE_INTERVAL_MINUTES = 60;

type WorkerState = {
  pricesRunning: boolean;
  snapTradeRunning: boolean;
  maintenanceRunning: boolean;
  lastPriceRunAt: string | null;
  lastSnapTradeRunAt: string | null;
  lastMaintenanceRunAt: string | null;
  timers: NodeJS.Timeout[];
  shuttingDown: boolean;
};

function asPositiveInt(value: unknown, fallback: number, min = 1, max = 1440): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(clean)) return true;
  if (["0", "false", "no", "n", "off"].includes(clean)) return false;
  return fallback;
}

const priceIntervalMinutes = asPositiveInt(
  process.env.MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES || process.env.INVESTMENT_PRICE_WORKER_INTERVAL_MINUTES,
  DEFAULT_PRICE_INTERVAL_MINUTES,
);
const snapTradeIntervalMinutes = asPositiveInt(
  process.env.MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES || process.env.SNAPTRADE_POSITION_WORKER_INTERVAL_MINUTES,
  DEFAULT_SNAPTRADE_INTERVAL_MINUTES,
);
const maintenanceIntervalMinutes = asPositiveInt(
  process.env.MARKET_DATA_WORKER_MAINTENANCE_INTERVAL_MINUTES || process.env.INVESTMENT_MAINTENANCE_WORKER_INTERVAL_MINUTES,
  DEFAULT_MAINTENANCE_INTERVAL_MINUTES,
  15,
  1440,
);
const snapTradeMaxUsers = asPositiveInt(
  process.env.MARKET_DATA_WORKER_MAX_USERS || process.env.SNAPTRADE_POSITION_WORKER_MAX_USERS,
  50,
  1,
  250,
);
const snapTradeRealtimeOnly = asBool(
  process.env.MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY || process.env.SNAPTRADE_POSITION_WORKER_REALTIME_ONLY,
  false,
);
const runOnStart = asBool(process.env.MARKET_DATA_WORKER_RUN_ON_START, true);
const priceForce = asBool(
  process.env.MARKET_DATA_WORKER_FORCE_PRICE || process.env.INVESTMENT_PRICE_WORKER_FORCE,
  false,
);
const workerDisabled = asBool(process.env.MARKET_DATA_WORKER_DISABLED, false);
const pricesEnabled = asBool(process.env.MARKET_DATA_WORKER_PRICES_ENABLED, true);
const snapTradeEnabled = asBool(process.env.MARKET_DATA_WORKER_SNAPTRADE_ENABLED, true);
const maintenanceEnabled = asBool(process.env.MARKET_DATA_WORKER_MAINTENANCE_ENABLED, true);
const runMaintenanceOnStart = asBool(process.env.MARKET_DATA_WORKER_RUN_MAINTENANCE_ON_START, false);

const state: WorkerState = {
  pricesRunning: false,
  snapTradeRunning: false,
  maintenanceRunning: false,
  lastPriceRunAt: null,
  lastSnapTradeRunAt: null,
  lastMaintenanceRunAt: null,
  timers: [],
  shuttingDown: false,
};

function requiredEnvReport() {
  return {
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAdminKey: Boolean(
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ADMIN_KEY ||
      process.env.SUPABASE_SERVICE_ROLE,
    ),
    hasAppEncryptionKey: Boolean(process.env.APP_ENCRYPTION_KEY),
    hasSnapTradeClientId: Boolean(process.env.SNAPTRADE_CLIENT_ID || process.env.SNAPTRADE_CLIENTID),
    hasSnapTradeConsumerKey: Boolean(process.env.SNAPTRADE_CONSUMER_KEY || process.env.SNAPTRADE_CONSUMERKEY),
    aiCoverageEnabled: process.env.MARKET_DATA_WORKER_AI_COVERAGE_ENABLED === "true",
    aiMarketSearchEnabled: process.env.LOOP_ENABLE_AI_MARKET_SEARCH === "true",
    webSearchMarketLookupEnabled: process.env.LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP === "true",
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_PREMIUM_API_KEY || process.env.OPENAI_RESEARCH_API_KEY),
    scrubbedAiKeys,
  };
}

async function runPrices(reason = "schedule"): Promise<void> {
  if (!pricesEnabled) {
    console.log(`[market-data-direct-worker] prices disabled; reason=${reason}`);
    return;
  }
  if (state.pricesRunning) {
    console.log(`[market-data-direct-worker] prices skipped; previous run still active reason=${reason}`);
    return;
  }
  state.pricesRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[market-data-direct-worker] ${startedAt} start investment prices reason=${reason}`);
  try {
    const result = await runInvestmentPriceSnapshotJob({
      force: priceForce,
      logger: console,
      prune: false,
    });
    state.lastPriceRunAt = new Date().toISOString();
    console.log(`[market-data-direct-worker] success investment prices`, result);
  } catch (error) {
    console.error(`[market-data-direct-worker] investment prices failed`, error);
  } finally {
    state.pricesRunning = false;
  }
}

async function runSnapTrade(reason = "schedule"): Promise<void> {
  if (!snapTradeEnabled) {
    console.log(`[market-data-direct-worker] SnapTrade disabled; reason=${reason}`);
    return;
  }
  if (state.snapTradeRunning) {
    console.log(`[market-data-direct-worker] SnapTrade skipped; previous run still active reason=${reason}`);
    return;
  }
  state.snapTradeRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[market-data-direct-worker] ${startedAt} start SnapTrade positions reason=${reason}`);
  try {
    // @ts-ignore - Dynamic import may not resolve in strict frontend tsconfig contexts
    const syncModule = await import("@/lib/snaptrade/sync").catch((error: unknown) => {
      console.error("[market-data-direct-worker] SnapTrade sync module unavailable; investment prices will keep running", error);
      return null;
    }) as Record<string, any> | null;
    
    if (!syncModule?.runSnapTradeProviderSnapshotJob) {
      state.lastSnapTradeRunAt = new Date().toISOString();
      console.warn("[market-data-direct-worker] SnapTrade positions skipped because @/lib/snaptrade/sync is not available in this deploy.");
      return;
    }
    const supabase = createAdminClient();
    const result = await syncModule.runSnapTradeProviderSnapshotJob({
      supabase,
      realtimeOnly: snapTradeRealtimeOnly,
      maxUsers: snapTradeMaxUsers,
    });
    state.lastSnapTradeRunAt = new Date().toISOString();
    console.log(`[market-data-direct-worker] success SnapTrade positions`, result);
  } catch (error) {
    console.error(`[market-data-direct-worker] SnapTrade positions failed`, error);
  } finally {
    state.snapTradeRunning = false;
  }
}

async function runMaintenance(reason = "schedule"): Promise<void> {
  if (!maintenanceEnabled) {
    console.log(`[market-data-direct-worker] maintenance disabled; reason=${reason}`);
    return;
  }
  if (state.maintenanceRunning) {
    console.log(`[market-data-direct-worker] maintenance skipped; previous run still active reason=${reason}`);
    return;
  }
  state.maintenanceRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[market-data-direct-worker] ${startedAt} start investment retention maintenance reason=${reason}`);
  try {
    const supabase = createAdminClient();
    const result = await runInvestmentSnapshotMaintenance(supabase, { logger: console });
    state.lastMaintenanceRunAt = new Date().toISOString();
    console.log(`[market-data-direct-worker] success investment retention maintenance`, result);
  } catch (error) {
    console.error(`[market-data-direct-worker] investment retention maintenance failed`, error);
  } finally {
    state.maintenanceRunning = false;
  }
}

function schedule(name: string, intervalMinutes: number, fn: (reason: string) => Promise<void>): void {
  const ms = intervalMinutes * 60 * 1000;
  console.log(`[market-data-direct-worker] scheduling ${name} every ${intervalMinutes} minute(s)`);
  const timer = setInterval(() => {
    if (state.shuttingDown) return;
    void fn("schedule");
  }, ms);
  state.timers.push(timer);
}

function shutdown(signal: string): void {
  console.log(`[market-data-direct-worker] ${signal} received; stopping timers and exiting.`);
  state.shuttingDown = true;
  for (const timer of state.timers) {
    clearInterval(timer);
  }
  
  const exitTimer = setTimeout(() => process.exit(0), 750);
  if (typeof exitTimer === "object" && "unref" in exitTimer && typeof exitTimer.unref === "function") {
    exitTimer.unref();
  }
}

function start(): void {
  console.log("[market-data-direct-worker] boot", {
    mode: "direct-supabase",
    priceIntervalMinutes,
    snapTradeIntervalMinutes,
    maintenanceIntervalMinutes,
    snapTradeMaxUsers,
    snapTradeRealtimeOnly,
    runOnStart,
    priceForce,
    workerDisabled,
    pricesEnabled,
    snapTradeEnabled,
    maintenanceEnabled,
    runMaintenanceOnStart,
    ...requiredEnvReport(),
  });

  if (workerDisabled) {
    console.log("[market-data-direct-worker] disabled by MARKET_DATA_WORKER_DISABLED=true");
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[market-data-direct-worker] Missing NEXT_PUBLIC_SUPABASE_URL.");
    process.exitCode = 1;
    return;
  }

  if (!requiredEnvReport().hasSupabaseAdminKey) {
    console.error("[market-data-direct-worker] Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Direct mode needs a server-side Supabase key.");
    process.exitCode = 1;
    return;
  }

  if (runOnStart) {
    void runPrices("startup");
    void runSnapTrade("startup");
  }
  if (runMaintenanceOnStart) {
    void runMaintenance("startup");
  }

  schedule("investment prices", priceIntervalMinutes, runPrices);
  schedule("SnapTrade positions", snapTradeIntervalMinutes, runSnapTrade);
  schedule("investment retention maintenance", maintenanceIntervalMinutes, runMaintenance);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error: unknown) => {
  console.error("[market-data-direct-worker] uncaught exception", error);
});
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[market-data-direct-worker] unhandled rejection", reason);
});

start();