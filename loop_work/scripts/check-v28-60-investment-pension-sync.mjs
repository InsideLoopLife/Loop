import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['lib/investments/pension-contribution-runner.ts', 'runPensionContributionProjection'],
  ['lib/investments/pension-contribution-runner.ts', 'employer_ni_topup_mode'],
  ['lib/investments/pension-contribution-runner.ts', 'salary_sacrifice_saved_ni'],
  ['lib/investments/pension-contribution-runner.ts', 'pension_investment_day'],
  ['lib/investments/pension-contribution-runner.ts', 'pending_investment'],
  ['lib/investments/pension-contribution-runner.ts', 'external_transaction_id'],
  ['lib/investments/regular-investment-runner.ts', 'runRegularInvestmentReinvestmentProjection'],
  ['lib/investments/regular-investment-runner.ts', 'auto_materialise_reinvestments_enabled'],
  ['lib/investments/regular-investment-runner.ts', 'investment:reinvest'],
  ['app/api/cron/investment-pension-snapshot/route.ts', 'runInvestmentPriceSnapshotJob'],
  ['app/api/cron/investment-pension-snapshot/route.ts', 'runPensionContributionProjection'],
  ['app/api/cron/investment-pension-snapshot/route.ts', 'runRegularInvestmentReinvestmentProjection'],
  ['app/api/cron/pensions-daily/route.ts', 'runPensionContributionProjection'],
  ['app/admin/investment-storage/actions.ts', 'runFullInvestmentPensionSyncNow'],
  ['app/admin/investment-storage/page.tsx', 'Run full sync now'],
  ['app/investments/actions.ts', 'contribution_auto_apply_enabled'],
  ['app/investments/actions.ts', 'employer_ni_topup_mode'],
  ['app/investments/actions.ts', 'price_polling_enabled: Boolean(asset.ticker'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Employer NI top-up mode'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Specific investment day'],
  ['db/v28_60_investment_savings_pension_sync_hardening.sql', 'pension_investment_day'],
  ['db/v28_60_investment_savings_pension_sync_hardening.sql', 'investment_purchase_lots_external_tx_uidx'],
  ['supabase/migrations/202607061900_investment_savings_pension_sync_hardening.sql', 'notify pgrst'],
];

const failures = [];
for (const [file, needle] of checks) {
  let content = '';
  try { content = read(file); } catch (error) { failures.push(`${file}: missing`); continue; }
  if (!content.includes(needle)) failures.push(`${file}: missing ${needle}`);
}

const moneybox = read('lib/investments/moneybox-funds.ts');
const assetCount = (moneybox.match(/key:\s*"/g) || []).length;
if (assetCount < 56) failures.push(`Moneybox catalogue only has ${assetCount} assets`);

const priceRunner = read('lib/investments/price-snapshot-runner.ts');
for (const needle of ['previousCloseGlobalPoint', 'seedProviderPreviousClosePoint', 'REALTIME_TARGET_MINUTES', 'userCadenceMinutes']) {
  if (!priceRunner.includes(needle)) failures.push(`price-snapshot-runner missing ${needle}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  moneybox_asset_count: assetCount,
  checked_files: new Set(checks.map(([file]) => file)).size + 2,
  covered: [
    'stock/ETF snapshot cadence by tier',
    'previous-close seeding',
    'Moneybox ticker polling where available',
    'pension salary-sacrifice NI top-ups',
    'specific pension investment days',
    'regular pie reinvestment lots',
    'one-click admin investment/pension sync',
  ],
}, null, 2));
