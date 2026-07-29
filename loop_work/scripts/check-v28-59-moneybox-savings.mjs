import fs from 'node:fs';

const moneybox = fs.readFileSync('lib/investments/moneybox-funds.ts', 'utf8');
const savingsParser = fs.readFileSync('lib/wealth/source-ingestion.ts', 'utf8');
const savingsActions = fs.readFileSync('app/admin/savings/actions.ts', 'utf8');
const savingsCron = fs.readFileSync('app/api/cron/savings-rate-watch/route.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const assetKeys = [...moneybox.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
const uniqueKeys = new Set(assetKeys);
assert(assetKeys.length === uniqueKeys.size, 'Moneybox asset keys must be unique');
assert(assetKeys.length >= 56, `Expected at least 56 Moneybox assets, found ${assetKeys.length}`);

const requiredKeys = [
  'moneybox-global-shares',
  'moneybox-islamic-global-shares',
  'moneybox-sp-500-etf',
  'moneybox-global-carbon-transition-etf',
  'moneybox-artificial-intelligence-etf',
  'moneybox-us-stock-apple',
  'moneybox-us-stock-nvidia',
  'moneybox-us-stock-disney',
  'moneybox-available-cash-unknown',
];
for (const key of requiredKeys) assert(assetKeys.includes(key), `Missing required Moneybox asset ${key}`);

assert(/searchMoneyboxAssets\(query, MONEYBOX_ASSETS\.length\)/.test(fs.readFileSync('components/investments/PensionsInvestmentsClient.tsx', 'utf8')), 'Moneybox modal should request the full catalogue');
assert(/parseSavingsDealsFromSource/.test(savingsParser), 'Savings parser should expose multi-deal extraction');
assert(/parsedDeals\.length > 1/.test(fs.readFileSync('lib/wealth/savings-catalogue.ts', 'utf8')), 'Savings catalogue should process multiple parsed deals');
assert(/ensureDefaultSourceUniverse\(supabase\)/.test(savingsActions), 'Admin savings optimiser should seed sources before running');
assert(/ensureDefaultSourceUniverse/.test(savingsCron), 'Savings cron should seed sources before full run');
assert(/last_result_payload/.test(fs.readFileSync('db/v28_59_moneybox_catalogue_savings_pipeline_check.sql', 'utf8')), 'v28.59 SQL should add source result payload');

console.log(JSON.stringify({ ok: true, moneybox_asset_count: assetKeys.length, required_keys_checked: requiredKeys.length }, null, 2));
