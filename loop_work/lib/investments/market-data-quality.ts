export type MarketDataQuality = {
  label: string;
  detail: string;
  kind: "realtime" | "minute" | "delayed" | "eod" | "provider" | "unknown";
};

export function marketDataQuality(source?: string | null): MarketDataQuality {
  const value = String(source || "").toLowerCase();
  if (value.includes("alpaca")) {
    return {
      label: "realtime quote",
      detail: "Realtime US quote via Alpaca IEX",
      kind: "realtime",
    };
  }
  if (value.includes("yahoo delayed/eod")) {
    return {
      label: "Yahoo quote · latency unconfirmed",
      detail: "Legacy worker label; the next observation will record Yahoo's exchange delay metadata",
      kind: "delayed",
    };
  }
  if (value.includes("daily fund quote") || value.includes("eod") || value.includes("regular close") || value.includes("stooq")) {
    return {
      label: "end-of-day quote",
      detail: "Latest close or daily fund price from the upstream provider",
      kind: "eod",
    };
  }
  if (
    value.includes("pre-market delayed") ||
    value.includes("post-market delayed") ||
    value.includes("delayed") ||
    value.includes("exchange delay")
  ) {
    return {
      label: "delayed quote",
      detail: "The worker checks frequently, but the upstream quote is delayed",
      kind: "delayed",
    };
  }
  if (value.includes("yahoo 1-minute market feed")) {
    return {
      label: "1-minute market feed",
      detail: "Yahoo supplied a new timestamped market observation for this minute",
      kind: "minute",
    };
  }
  if (value.includes("finance.yahoo.com")) {
    return {
      label: "Yahoo market quote",
      detail: "Yahoo can be realtime or delayed by exchange; the next worker update will retain its declared cadence",
      kind: "unknown",
    };
  }
  if (value.includes("snaptrade") || value.includes("provider")) {
    return {
      label: "provider value",
      detail: "Value supplied by the connected investment provider",
      kind: "provider",
    };
  }
  return {
    label: "source unverified",
    detail: "Price cadence is known, but the upstream quote latency is not",
    kind: "unknown",
  };
}

export function quoteObservationTime(
  observedAt: string | null | undefined,
  fallback: string,
) {
  if (!observedAt) return fallback;
  const parsed = new Date(observedAt);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}
