// NHS Pension Scheme (England & Wales) member contribution tiers from 1 April 2026.
// Source: NHS Employers "NHS Pension Scheme member contributions" and NHSBSA
// member contributions page (checked 5 Nov 2026). The rate is chosen by ACTUAL
// annual pensionable pay and then applies to the whole of that pay — it is not
// a marginal/banded calculation like income tax.
// NHS Scotland and Northern Ireland run separate schemes with their own tables.
export const NHS_PENSION_TIERS_2026_27 = [
  { upTo: 13259, rate: 5.2 },
  { upTo: 28854, rate: 6.5 },
  { upTo: 35155, rate: 8.3 },
  { upTo: 52778, rate: 9.8 },
  { upTo: 67668, rate: 10.7 },
  { upTo: Number.POSITIVE_INFINITY, rate: 12.5 },
] as const;

export const NHS_EMPLOYER_CONTRIBUTION_PERCENT_2026_27 = 23.7;

export function nhsMemberContributionPercent(annualPensionablePay: number) {
  const pay = Math.max(0, Number(annualPensionablePay) || 0);
  return NHS_PENSION_TIERS_2026_27.find((tier) => pay <= tier.upTo)?.rate ?? 12.5;
}
