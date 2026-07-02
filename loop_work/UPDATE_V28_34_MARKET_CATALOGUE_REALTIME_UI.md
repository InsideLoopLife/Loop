export type PaymentTier = "free" | "starter" | "plus" | "pro" | "realtime" | "enterprise";
export type PaymentTierStatus = "active" | "trialing" | "manual_review" | "past_due" | "cancelled" | "inactive";
export type MarketDataTier = "manual" | "delayed" | "enhanced_delayed" | "realtime";

export type InvestmentDataEntitlement = {
  paymentTier: PaymentTier;
  paymentStatus: PaymentTierStatus;
  marketDataTier: MarketDataTier;
  label: string;
  badge: string;
  refreshCadence: string;
  historyDepth: string;
  chartInteraction: "basic" | "interactive" | "pro";
  canUseAiInstrumentSearch: boolean;
  canUseDelayedPrices: boolean;
  canUseRealtimePrices: boolean;
  canUsePaidProvider: boolean;
  canConnectPaidProvider: boolean;
  maxTrackedSymbols: number | null;
  reason: string;
};

export type TierProfile = {
  payment_tier?: string | null;
  payment_tier_status?: string | null;
  payment_tier_override?: string | null;
  market_data_tier?: string | null;
  market_data_tier_override?: string | null;
  market_data_realtime_enabled?: boolean | null;
  market_data_provider_status?: string | null;
};

const PAYMENT_TIERS: PaymentTier[] = ["free", "starter", "plus", "pro", "realtime", "enterprise"];
const PAYMENT_STATUSES: PaymentTierStatus[] = ["active", "trialing", "manual_review", "past_due", "cancelled", "inactive"];
const MARKET_DATA_TIERS: MarketDataTier[] = ["manual", "delayed", "enhanced_delayed", "realtime"];

export function normalisePaymentTier(value?: string | null): PaymentTier {
  const clean = String(value || "free").trim().toLowerCase().replace(/[^a-z_]/g, "");
  return PAYMENT_TIERS.includes(clean as PaymentTier) ? clean as PaymentTier : "free";
}

export function normalisePaymentStatus(value?: string | null): PaymentTierStatus {
  const clean = String(value || "inactive").trim().toLowerCase();
  return PAYMENT_STATUSES.includes(clean as PaymentTierStatus) ? clean as PaymentTierStatus : "inactive";
}

export function normaliseMarketDataTier(value?: string | null): MarketDataTier {
  const clean = String(value || "delayed").trim().toLowerCase();
  return MARKET_DATA_TIERS.includes(clean as MarketDataTier) ? clean as MarketDataTier : "delayed";
}

function isPaying(status: PaymentTierStatus) {
  return ["active", "trialing", "manual_review"].includes(status);
}

function defaultMarketDataTier(paymentTier: PaymentTier): MarketDataTier {
  if (paymentTier === "realtime" || paymentTier === "enterprise") return "realtime";
  if (paymentTier === "pro") return "enhanced_delayed";
  if (paymentTier === "plus") return "enhanced_delayed";
  if (paymentTier === "starter") return "delayed";
  return "delayed";
}

export function investmentDataEntitlementForProfile(profile?: TierProfile | null): InvestmentDataEntitlement {
  const paymentTier = normalisePaymentTier(profile?.payment_tier_override || profile?.payment_tier);
  const paymentStatus = normalisePaymentStatus(profile?.payment_tier_status || (paymentTier === "free" ? "inactive" : "manual_review"));
  const configuredMarketTier = normaliseMarketDataTier(profile?.market_data_tier_override || profile?.market_data_tier || defaultMarketDataTier(paymentTier));
  const hasPaidOrReviewedPlan = paymentTier !== "free" && isPaying(paymentStatus);
  const providerLive = profile?.market_data_realtime_enabled === true || String(profile?.market_data_provider_status || "").toLowerCase() === "connected";
  const requestedRealtime = configuredMarketTier === "realtime" || paymentTier === "realtime" || paymentTier === "enterprise";
  // Connecting a paid provider is allowed before the provider is already live.
  // Otherwise SnapTrade becomes a chicken-and-egg flow: users cannot connect because
  // the app waits for providerLive, but providerLive can only become true after connection.
  const canConnectPaidProvider = hasPaidOrReviewedPlan && (requestedRealtime || paymentTier === "pro" || paymentTier === "realtime" || paymentTier === "enterprise");
  const canUseRealtimePrices = hasPaidOrReviewedPlan && requestedRealtime && providerLive;
  const realtimeBlockedReason = requestedRealtime && !hasPaidOrReviewedPlan
    ? "Realtime was requested, but the payment tier/status is not eligible yet."
    : requestedRealtime && !providerLive
      ? "Realtime was requested, but the paid data provider is not connected yet."
      : null;
  const marketDataTier: MarketDataTier = canUseRealtimePrices ? "realtime" : (configuredMarketTier === "realtime" ? "enhanced_delayed" : configuredMarketTier);

  if (marketDataTier === "realtime") {
    return {
      paymentTier,
      paymentStatus,
      marketDataTier,
      label: "Realtime market data",
      badge: "Realtime",
      refreshCadence: "Realtime/streaming where the paid provider supports the instrument",
      historyDepth: "Intraday + historical ranges",
      chartInteraction: "pro",
      canUseAiInstrumentSearch: true,
      canUseDelayedPrices: true,
      canUseRealtimePrices: true,
      canUsePaidProvider: true,
      canConnectPaidProvider: true,
      maxTrackedSymbols: null,
      reason: "Payment tier is eligible and the market-data provider is connected.",
    };
  }

  if (marketDataTier === "enhanced_delayed") {
    return {
      paymentTier,
      paymentStatus,
      marketDataTier,
      label: "Enhanced delayed data",
      badge: "Enhanced",
      refreshCadence: "Manual/on-demand refresh with broader quote and history lookup",
      historyDepth: "1D to 5Y where delayed history exists",
      chartInteraction: "interactive",
      canUseAiInstrumentSearch: true,
      canUseDelayedPrices: true,
      canUseRealtimePrices: false,
      canUsePaidProvider: canConnectPaidProvider,
      canConnectPaidProvider,
      maxTrackedSymbols: 250,
      reason: realtimeBlockedReason || "Tier allows richer delayed lookups without paid realtime costs.",
    };
  }

  if (marketDataTier === "delayed") {
    return {
      paymentTier,
      paymentStatus,
      marketDataTier,
      label: "Delayed market data",
      badge: "Delayed",
      refreshCadence: "Manual refresh / delayed provider snapshots",
      historyDepth: "Basic historical ranges where available",
      chartInteraction: "interactive",
      canUseAiInstrumentSearch: true,
      canUseDelayedPrices: true,
      canUseRealtimePrices: false,
      canUsePaidProvider: canConnectPaidProvider,
      canConnectPaidProvider,
      maxTrackedSymbols: 80,
      reason: "Tier uses delayed quote sources to avoid paid realtime market-data costs.",
    };
  }

  return {
    paymentTier,
    paymentStatus,
    marketDataTier: "manual",
    label: "Free delayed lookup",
    badge: "Free",
    refreshCadence: "Manual/on-demand delayed lookup for stocks, ETFs and common funds",
    historyDepth: "Saved app snapshots + basic delayed lookup",
    chartInteraction: "basic",
    canUseAiInstrumentSearch: true,
    canUseDelayedPrices: true,
    canUseRealtimePrices: false,
    canUsePaidProvider: false,
    canConnectPaidProvider: false,
    maxTrackedSymbols: 25,
    reason: "Free tier can search and add stocks/ETFs using delayed or manual data; paid tiers unlock broader/realtime feeds.",
  };
}

export function tierOptions() {
  return PAYMENT_TIERS;
}

export function marketDataTierOptions() {
  return MARKET_DATA_TIERS;
}

export function paymentStatusOptions() {
  return PAYMENT_STATUSES;
}
