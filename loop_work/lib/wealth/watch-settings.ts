export type WealthWatchSettings = {
  savingsMinimumRateDelta: number;
  savingsMaxRecommendationsPerAccount: number;
  savingsStaleDays: number;
  mortgageAlertMonths: number;
  mortgageSourceFreshnessDays: number;
  mortgageMaxRecommendationsPerDeal: number;
  mortgageCatalogueRefreshLimit: number;
  mortgageCatalogueAutoPublishConfidence: number;
};

export const defaultWealthWatchSettings: WealthWatchSettings = {
  savingsMinimumRateDelta: 0.1,
  savingsMaxRecommendationsPerAccount: 5,
  savingsStaleDays: 14,
  mortgageAlertMonths: 9,
  mortgageSourceFreshnessDays: 14,
  mortgageMaxRecommendationsPerDeal: 8,
  mortgageCatalogueRefreshLimit: 12,
  mortgageCatalogueAutoPublishConfidence: 95,
};

function asNumber(value: any, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadWealthWatchSettings(supabase: any): Promise<WealthWatchSettings> {
  try {
    const { data, error } = await supabase.from("wealth_watch_settings").select("setting_key, setting_value");
    if (error) return defaultWealthWatchSettings;
    const map = new Map((data || []).map((row: any) => [row.setting_key, row.setting_value]));
    return {
      savingsMinimumRateDelta: asNumber(map.get("savings_minimum_rate_delta"), defaultWealthWatchSettings.savingsMinimumRateDelta),
      savingsMaxRecommendationsPerAccount: Math.max(1, asNumber(map.get("savings_max_recommendations_per_account"), defaultWealthWatchSettings.savingsMaxRecommendationsPerAccount)),
      savingsStaleDays: Math.max(1, asNumber(map.get("savings_stale_days"), defaultWealthWatchSettings.savingsStaleDays)),
      mortgageAlertMonths: Math.max(1, asNumber(map.get("mortgage_alert_months"), defaultWealthWatchSettings.mortgageAlertMonths)),
      mortgageSourceFreshnessDays: Math.max(1, asNumber(map.get("mortgage_source_freshness_days"), defaultWealthWatchSettings.mortgageSourceFreshnessDays)),
      mortgageMaxRecommendationsPerDeal: Math.max(1, asNumber(map.get("mortgage_max_recommendations_per_deal"), defaultWealthWatchSettings.mortgageMaxRecommendationsPerDeal)),
      mortgageCatalogueRefreshLimit: Math.max(1, asNumber(map.get("mortgage_catalogue_refresh_limit"), defaultWealthWatchSettings.mortgageCatalogueRefreshLimit)),
      mortgageCatalogueAutoPublishConfidence: Math.max(1, asNumber(map.get("mortgage_catalogue_auto_publish_confidence"), defaultWealthWatchSettings.mortgageCatalogueAutoPublishConfidence)),
    };
  } catch {
    return defaultWealthWatchSettings;
  }
}
