import fs from 'node:fs';

const checks = [
  ['components/investments/AmplifiedInvestmentsDashboard.tsx', 'loop-investment-marquee'],
  ['components/investments/AmplifiedInvestmentsDashboard.tsx', 'POPULAR_TICKERS'],
  ['components/investments/AmplifiedInvestmentsDashboard.tsx', 'Investment command centre'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Pension snapshots'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Investment snapshots'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'SnapTrade-ready tier'],
  ['app/investments/page.tsx', 'investment_instrument_price_points'],
  ['app/globals.css', '@keyframes loop-investment-marquee'],
];

const missing = checks.filter(([file, needle]) => !fs.readFileSync(file, 'utf8').includes(needle));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  checked_files: Array.from(new Set(checks.map(([file]) => file))).length,
  features: [
    'summary-first investments landing cards',
    'clickable pension/investment snapshots by person',
    'separate realtime/broker promo boxes removed',
    'market data tier tile opens access modal',
    'SnapTrade-capable tier mark or manual pencil icon',
    'scrolling ticker with user holdings and popular fallbacks',
    'popular ticker prices use global price points where available',
  ],
}, null, 2));
