const DEFAULT_PRICE_INTERVAL_MINUTES = 1;
const DEFAULT_SNAPTRADE_INTERVAL_MINUTES = 30;

const rawBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.LOOP_APP_URL || "http://localhost:3000";
const baseUrl = rawBaseUrl.replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || process.env.INVESTMENT_CRON_SECRET || "";

function asPositiveInt(value, fallback, min = 1, max = 1440) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asBool(value, fallback) {
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
const snapTradeMaxUsers = asPositiveInt(process.env.MARKET_DATA_WORKER_MAX_USERS || process.env.SNAPTRADE_POSITION_WORKER_MAX_USERS, 50, 1, 250);
const snapTradeRealtimeOnly = asBool(process.env.MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY || process.env.SNAPTRADE_POSITION_WORKER_REALTIME_ONLY, true);
const runOnStart = asBool(process.env.MARKET_DATA_WORKER_RUN_ON_START, true);
const priceForce = asBool(process.env.MARKET_DATA_WORKER_FORCE_PRICE || process.env.INVESTMENT_PRICE_WORKER_FORCE, false);
const workerDisabled = asBool(process.env.MARKET_DATA_WORKER_DISABLED, false);

const state = {
  pricesRunning: false,
  snapTradeRunning: false,
  lastPriceRunAt: null,
  lastSnapTradeRunAt: null,
  continuousPricesRunning: false,
  shuttingDown: false,
};

function buildUrl(path, params = {}) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function callCronEndpoint(label, url) {
  const startedAt = new Date().toISOString();
  console.log(`[market-data-worker] ${startedAt} start ${label}: ${url.toString()}`);
  const controller = new AbortController();
  const timeoutMs = asPositiveInt(process.env.MARKET_DATA_WORKER_HTTP_TIMEOUT_SECONDS, 45, 10, 300) * 1000;
  const timeout = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "x-cron-secret": cronSecret,
        "user-agent": "InsideLoopMarketDataWorker/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${label} failed with HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }
  console.log(`[market-data-worker] success ${label}`, payload);
  return payload;
}

async function runPrices(reason = "schedule") {
  if (state.pricesRunning) {
    console.log(`[market-data-worker] prices skipped; previous run still active reason=${reason}`);
    return;
  }
  state.pricesRunning = true;
  try {
    const url = buildUrl("/api/cron/investment-price-snapshots", priceForce ? { force: "1" } : {});
    await callCronEndpoint(`investment-prices reason=${reason}`, url);
    state.lastPriceRunAt = new Date().toISOString();
  } catch (error) {
    console.error(`[market-data-worker] investment prices failed`, error?.payload || error);
  } finally {
    state.pricesRunning = false;
  }
}

async function runSnapTrade(reason = "schedule") {
  if (state.snapTradeRunning) {
    console.log(`[market-data-worker] SnapTrade skipped; previous run still active reason=${reason}`);
    return;
  }
  state.snapTradeRunning = true;
  try {
    const url = buildUrl("/api/cron/snaptrade-position-snapshots", {
      realtimeOnly: snapTradeRealtimeOnly ? "true" : "false",
      maxUsers: snapTradeMaxUsers,
    });
    await callCronEndpoint(`snaptrade-positions reason=${reason}`, url);
    state.lastSnapTradeRunAt = new Date().toISOString();
  } catch (error) {
    console.error(`[market-data-worker] SnapTrade positions failed`, error?.payload || error);
  } finally {
    state.snapTradeRunning = false;
  }
}

async function scheduleContinuousPrices(intervalMinutes) {
  const ms = intervalMinutes * 60 * 1000;
  if (state.continuousPricesRunning) return;
  state.continuousPricesRunning = true;
  console.log(`[market-data-worker] scheduling investment prices as continuous loop targeting every ${intervalMinutes} minute(s)`);
  while (!state.shuttingDown) {
    const started = Date.now();
    await runPrices("continuous-loop");
    const elapsed = Date.now() - started;
    const wait = Math.max(250, ms - elapsed);
    if (elapsed > ms) {
      console.warn(`[market-data-worker] investment price cycle took ${Math.round(elapsed / 1000)}s, longer than target ${Math.round(ms / 1000)}s; next cycle starts after a short breather.`);
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function schedule(name, intervalMinutes, fn) {
  const ms = intervalMinutes * 60 * 1000;
  console.log(`[market-data-worker] scheduling ${name} every ${intervalMinutes} minute(s)`);
  return setInterval(() => {
    if (state.shuttingDown) return;
    void fn("schedule");
  }, ms);
}

function start() {
  console.log("[market-data-worker] boot", {
    baseUrl,
    priceIntervalMinutes,
    snapTradeIntervalMinutes,
    snapTradeMaxUsers,
    snapTradeRealtimeOnly,
    runOnStart,
    priceForce,
    workerDisabled,
    hasCronSecret: Boolean(cronSecret),
  });

  if (workerDisabled) {
    console.log("[market-data-worker] disabled by MARKET_DATA_WORKER_DISABLED=true");
    return;
  }

  if (!cronSecret) {
    console.error("[market-data-worker] Missing CRON_SECRET or LOOP_CRON_SECRET. Set one shared secret on the web service and the background worker.");
    process.exitCode = 1;
    return;
  }

  if (runOnStart) {
    void runPrices("startup");
    void runSnapTrade("startup");
  }

  void scheduleContinuousPrices(priceIntervalMinutes);
  schedule("SnapTrade positions", snapTradeIntervalMinutes, runSnapTrade);
}

process.on("SIGTERM", () => {
  console.log("[market-data-worker] SIGTERM received; Render is stopping the worker.");
  state.shuttingDown = true;
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[market-data-worker] SIGINT received; stopping the worker.");
  state.shuttingDown = true;
  process.exit(0);
});

start();
