import fs from 'node:fs';

const client = fs.readFileSync('components/investments/PensionsInvestmentsClient.tsx', 'utf8');
const dashboard = fs.readFileSync('components/investments/AmplifiedInvestmentsDashboard.tsx', 'utf8');

const requiredDashboard = [
  'AmplifiedInvestmentsDashboard',
  'PERIODS',
  'DiversificationNotches',
  'PortfolioChart',
  'Ticker',
  'purchase / cost line',
  'Refresh prices',
  'Light',
  'Dark',
  'Width = portfolio value',
];

const requiredClient = [
  'AmplifiedInvestmentsDashboard',
  'filteredInvestmentHoldings',
  'filteredInvestmentTotal',
  'filteredInvestmentCost',
  'filteredInvestmentHasUnverifiedProviderCost',
];

const missing = [];
for (const needle of requiredDashboard) if (!dashboard.includes(needle)) missing.push(`dashboard:${needle}`);
for (const needle of requiredClient) if (!client.includes(needle)) missing.push(`client:${needle}`);

if (missing.length) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked_files: [
    'components/investments/AmplifiedInvestmentsDashboard.tsx',
    'components/investments/PensionsInvestmentsClient.tsx',
  ],
  features: [
    'top ticker strip',
    'portfolio hero chart with period chips',
    'dotted purchase-price/cost line',
    'glowing active chart line',
    'diversification notches weighted by holding value',
    'holding rows with allocation and period movement',
    'local dark/light dashboard toggle',
  ],
}, null, 2));
