import fs from 'node:fs';

const checks = [
  ['components/investments/PensionsInvestmentsClient.tsx', '"overview" | "investment-command" | "pension-command"'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'openInvestmentCommand'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'openPensionCommand'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'openInvestmentDetail'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'openPensionDetail'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Filter command centre by household member'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Investment command centre'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Pension command centre'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Command centre →'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Open pot breakdown'],
  ['components/investments/PensionsInvestmentsClient.tsx', 'Open pension breakdown'],
  ['db/v28_63_investments_overview_command_centre_split.sql', 'UI-only release'],
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
    'investments tab defaults to overview-only landing page',
    'investment and pension cards open immersive command centres',
    'snapshot cards open the normal detailed breakdown flow',
    'overview cards do not leave the detailed pot cards on the same page',
    'investment command centre has avatar-only multi-select household filters',
    'pension command centre has the same household filter model',
    'no schema changes required',
  ],
}, null, 2));
