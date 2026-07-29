export type InstrumentPricePoint = {
  ticker: string | null;
  exchange_code: string | null;
  native_price: number | null;
  native_currency: string | null;
  gbp_price: number | null;
  price_gbp: number | null;
  point_at: string | null;
};

/** Shared market-data read repository. No user-sensitive records belong here. */
export async function getLatestInstrumentPrices(
  supabase: any,
  tickers: string[],
  limit = 500,
): Promise<InstrumentPricePoint[]> {
  const normalised = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
  );
  if (!normalised.length) return [];

  const { data, error } = await supabase
    .from("investment_instrument_price_points")
    .select(
      "ticker,exchange_code,native_price,native_currency,gbp_price,price_gbp,point_at",
    )
    .in("ticker", normalised)
    .order("point_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 2000)));

  if (error) throw error;
  return (data || []) as InstrumentPricePoint[];
}

export function latestPricePerTicker(
  rows: InstrumentPricePoint[],
): InstrumentPricePoint[] {
  return Array.from(
    rows.reduce((map, row) => {
      const ticker = String(row.ticker || "").toUpperCase();
      if (ticker && !map.has(ticker)) map.set(ticker, row);
      return map;
    }, new Map<string, InstrumentPricePoint>()).values(),
  );
}
