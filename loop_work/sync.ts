export type InvestmentSnapshotSettings = {
  enabled: boolean;
  minMinutesBetweenPoints: number;
  retainDays: number;
  maxPointsPerHolding: number;
  marketHoursOnly: boolean;
  realtimeUsersOnly: boolean;
  globalRawPricePoints: boolean;
  realtimeMinutes: number;
  plusProMinutes: number;
  freeMinutes: number;
  manualRefreshUsesLatestGlobal: boolean;
};

export const defaultInvestmentSnapshotSettings: InvestmentSnapshotSettings = {
  enabled: true,
  minMinutesBetweenPoints: 15,
  retainDays: 365,
  maxPointsPerHolding: 5000,
  marketHoursOnly: true,
  realtimeUsersOnly: false,
  globalRawPricePoints: true,
  realtimeMinutes: 1,
  plusProMinutes: 10,
  freeMinutes: 30,
  manualRefreshUsesLatestGlobal: true,
};

function asNumber(value: any, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: any, fallback: boolean) {
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === "off") return false;
  return fallback;
}

export async function loadInvestmentSnapshotSettings(supabase: any): Promise<InvestmentSnapshotSettings> {
  try {
    const { data, error } = await supabase.from("wealth_watch_settings").select("setting_key, setting_value").in("setting_key", [
      "investment_snapshots_enabled",
      "investment_snapshots_min_minutes",
      "investment_snapshots_retain_days",
      "investment_snapshots_max_points_per_holding",
      "investment_snapshots_market_hours_only",
      "investment_snapshots_realtime_users_only",
      "investment_global_raw_price_points",
      "investment_realtime_minutes_between_points",
      "investment_plus_pro_minutes_between_points",
      "investment_free_minutes_between_points",
      "investment_manual_refresh_uses_latest_global",
    ]);
    if (error) return defaultInvestmentSnapshotSettings;
    const map = new Map((data || []).map((row: any) => [row.setting_key, row.setting_value]));
    return {
      enabled: asBoolean(map.get("investment_snapshots_enabled"), defaultInvestmentSnapshotSettings.enabled),
      minMinutesBetweenPoints: Math.max(5, asNumber(map.get("investment_snapshots_min_minutes"), defaultInvestmentSnapshotSettings.minMinutesBetweenPoints)),
      retainDays: Math.max(1, asNumber(map.get("investment_snapshots_retain_days"), defaultInvestmentSnapshotSettings.retainDays)),
      maxPointsPerHolding: Math.max(10, asNumber(map.get("investment_snapshots_max_points_per_holding"), defaultInvestmentSnapshotSettings.maxPointsPerHolding)),
      marketHoursOnly: asBoolean(map.get("investment_snapshots_market_hours_only"), defaultInvestmentSnapshotSettings.marketHoursOnly),
      realtimeUsersOnly: asBoolean(map.get("investment_snapshots_realtime_users_only"), defaultInvestmentSnapshotSettings.realtimeUsersOnly),
      globalRawPricePoints: asBoolean(map.get("investment_global_raw_price_points"), defaultInvestmentSnapshotSettings.globalRawPricePoints),
      realtimeMinutes: Math.max(1, asNumber(map.get("investment_realtime_minutes_between_points"), defaultInvestmentSnapshotSettings.realtimeMinutes)),
      plusProMinutes: Math.max(1, asNumber(map.get("investment_plus_pro_minutes_between_points"), defaultInvestmentSnapshotSettings.plusProMinutes)),
      freeMinutes: Math.max(1, asNumber(map.get("investment_free_minutes_between_points"), defaultInvestmentSnapshotSettings.freeMinutes)),
      manualRefreshUsesLatestGlobal: asBoolean(map.get("investment_manual_refresh_uses_latest_global"), defaultInvestmentSnapshotSettings.manualRefreshUsesLatestGlobal),
    };
  } catch {
    return defaultInvestmentSnapshotSettings;
  }
}
