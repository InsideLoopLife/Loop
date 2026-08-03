import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivacyMode = "off" | "blur" | "fake_currency";

export type PrivacySettings = {
  mode: PrivacyMode;
  fakeCurrencySeed: number;
  fakeCurrencyName: string;
};

const DEFAULT_SETTINGS: PrivacySettings = { mode: "off", fakeCurrencySeed: 1, fakeCurrencyName: "Credits" };

export async function getPrivacySettings(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<PrivacySettings> {
  const { data } = await supabase
    .from("app_user_profiles")
    .select("privacy_mode, privacy_fake_currency_seed, privacy_fake_currency_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;
  return {
    mode: (data.privacy_mode as PrivacyMode) || "off",
    fakeCurrencySeed: Number(data.privacy_fake_currency_seed) || 1,
    fakeCurrencyName: data.privacy_fake_currency_name || "Credits",
  };
}
