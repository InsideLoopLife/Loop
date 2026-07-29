export const WORKER_DOMAIN_TABLES = {
  market: [
    "investment_instruments",
    "investment_instrument_price_points",
    "investment_price_snapshots",
    "market_data_worker_runs",
  ],
  rates: [
    "savings_rate_sources",
    "savings_rate_deals",
    "mortgage_market_deals",
    "wealth_watch_source_jobs",
  ],
  health: ["meals", "food_logs", "nutrition_products"],
  wealth: [
    "investment_accounts",
    "investment_holdings",
    "pension_accounts",
    "financial_accounts",
  ],
} as const;

export type WorkerDomain = keyof typeof WORKER_DOMAIN_TABLES;

export function isTableDeclaredForWorker(
  domain: WorkerDomain,
  table: string,
): boolean {
  return (WORKER_DOMAIN_TABLES[domain] as readonly string[]).includes(table);
}
