import { decryptSecret } from "@/lib/security/secrets";

type SecretRow = {
  provider: string;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_auth_tag: string | null;
  secret_value?: string | null;
};

type ActiveIntegrationSecret = { provider: string; value: string } | null;

const marketWorkerSecretCache = new Map<
  string,
  { expiresAt: number; value: ActiveIntegrationSecret }
>();
const marketWorkerSecretLoads = new Map<
  string,
  Promise<ActiveIntegrationSecret>
>();

function marketWorkerSecretCacheMs(found: boolean) {
  // A missing user-managed market-data key is the normal worker state because
  // the shared server-side providers are tried first. Do not re-read the same
  // empty secret row on every one-minute cycle.
  const fallback = found ? 15 * 60 * 1000 : 5 * 60 * 1000;
  const parsed = Number.parseInt(
    String(process.env.MARKET_DATA_WORKER_SECRET_CACHE_MS || ""),
    10,
  );
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5_000, Math.min(parsed, 30 * 60 * 1000));
}

function isMarketWorkerProcess() {
  const value = String(process.env.LOOP_MARKET_DATA_WORKER || process.env.MARKET_DATA_WORKER_PROCESS || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function providerAliases(provider: string) {
  const key = provider.trim().toLowerCase();
  if (key === "openai" || key === "open_ai" || key === "open ai") {
    return ["openai", "open_ai", "OpenAI", "Open AI", "open ai"];
  }
  return [provider, key];
}

function envFallbackForProvider(provider: string) {
  const key = provider.trim().toLowerCase();
  if (key === "openai" || key === "open_ai" || key === "open ai") {
    // Previously hard-blocked in the market worker as a blunt fix after the
    // web_search_preview tool ran up real cost — that tool call is gone now
    // (see lib/investments/market-data.ts), and MARKET_DATA_WORKER_AI_COVERAGE_ENABLED
    // plus the one-shot-then-permanently-inactive logic in
    // lib/investments/price-snapshot-runner.ts control cost/frequency
    // properly instead. Set OPENAI_API_KEY (or OPENAI_TOKEN /
    // LOOP_OPENAI_API_KEY) on the worker service for this to have a key to
    // use — it doesn't require every individual user to have connected
    // their own OpenAI integration.
    const value = process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN || process.env.LOOP_OPENAI_API_KEY;
    return value ? { provider: "openai", value } : null;
  }
  return null;
}

export async function getActiveIntegrationSecret(
  supabase: any,
  userId: string,
  providers: string | string[],
) {
  const providerList = Array.isArray(providers) ? providers : [providers];
  const aliases = Array.from(new Set(providerList.flatMap(providerAliases)));

  const workerCacheKey = isMarketWorkerProcess()
    ? `${userId}:${aliases.map((value) => value.toLowerCase()).sort().join(",")}`
    : null;
  if (workerCacheKey) {
    const cached = marketWorkerSecretCache.get(workerCacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    marketWorkerSecretCache.delete(workerCacheKey);

    const pending = marketWorkerSecretLoads.get(workerCacheKey);
    if (pending) return pending;
  }

  const loadSecret = async (): Promise<ActiveIntegrationSecret> => {
    const { data, error } = await supabase
      .from("integration_secrets")
      .select("provider, secret_ciphertext, secret_iv, secret_auth_tag, secret_value")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("provider", aliases)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const row = data as SecretRow;
      try {
        const value = decryptSecret(row);
        if (value) return { provider: row.provider, value };
      } catch {
        // Keep going: old development rows may still have a legacy plaintext secret_value.
      }

      // Legacy/dev fallback only. New saves use encrypted fields.
      const legacy = typeof row.secret_value === "string" ? row.secret_value.trim() : "";
      if (legacy) return { provider: row.provider, value: legacy };
    }

    for (const provider of providerList) {
      const fallback = envFallbackForProvider(provider);
      if (fallback) return fallback;
    }

    return null;
  };

  if (!workerCacheKey) return loadSecret();

  const pending = loadSecret();
  marketWorkerSecretLoads.set(workerCacheKey, pending);
  try {
    const value = await pending;
    marketWorkerSecretCache.set(workerCacheKey, {
      expiresAt: Date.now() + marketWorkerSecretCacheMs(Boolean(value)),
      value,
    });
    return value;
  } finally {
    marketWorkerSecretLoads.delete(workerCacheKey);
  }
}
