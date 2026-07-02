import { decryptSecret } from "@/lib/security/secrets";

type SecretRow = {
  provider: string;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_auth_tag: string | null;
  secret_value?: string | null;
};

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
    if (isMarketWorkerProcess()) return null;
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
  if (isMarketWorkerProcess() && providerList.some((provider) => ["openai", "open_ai", "open ai"].includes(String(provider).trim().toLowerCase()))) {
    return null;
  }
  const aliases = Array.from(new Set(providerList.flatMap(providerAliases)));

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
}
