import { decryptSecret } from "@/lib/security/secrets";

type SecretRow = {
  provider: string;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_auth_tag: string | null;
};

export async function getActiveIntegrationSecret(
  supabase: any,
  userId: string,
  providers: string | string[],
) {
  const providerList = Array.isArray(providers) ? providers : [providers];

  const query = supabase
    .from("integration_secrets")
    .select("provider, secret_ciphertext, secret_iv, secret_auth_tag")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data, error } = providerList.length === 1
    ? await query.eq("provider", providerList[0]).maybeSingle()
    : await query.in("provider", providerList).maybeSingle();

  if (error || !data) return null;

  const row = data as SecretRow;

  try {
    const value = decryptSecret(row);
    return value ? { provider: row.provider, value } : null;
  } catch {
    return null;
  }
}
