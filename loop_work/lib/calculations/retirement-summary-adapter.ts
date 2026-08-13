import type {
  RetirementAsset,
  RetirementContribution,
} from "@/lib/calculations/retirement";

export type PensionSummaryAccount = {
  id: string;
  label: string;
  provider: string;
  current_value: number;
  annual_platform_fee_percent?: number | null;
  fixed_monthly_contribution?: number | null;
  employee_contribution_percent?: number | null;
  employer_contribution_percent?: number | null;
  person_id?: string | null;
};

export type InvestmentSummaryAccount = {
  id: string;
  label: string;
  provider: string;
  account_type: string;
  person_id?: string | null;
};

export type InvestmentSummaryHolding = {
  id: string;
  investment_account_id: string;
  asset_name: string;
  units: number;
  latest_price: number;
  imported_current_value?: number | null;
};

export type PensionSummaryFund = {
  id: string;
  pension_account_id: string;
  current_value: number;
};

export function pensionSourceLines(
  accounts: PensionSummaryAccount[],
  funds: PensionSummaryFund[],
) {
  return accounts
    .map((account) => {
      const fundValue = funds
        .filter((fund) => fund.pension_account_id === account.id)
        .reduce((sum, fund) => sum + Number(fund.current_value || 0), 0);
      return {
        id: account.id,
        label: account.provider || account.label,
        value: fundValue || Number(account.current_value || 0),
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function investmentSourceLines(
  accounts: InvestmentSummaryAccount[],
  holdings: InvestmentSummaryHolding[],
) {
  return accounts
    .map((account) => {
      const value = holdings
        .filter((holding) => holding.investment_account_id === account.id)
        .reduce(
          (sum, holding) =>
            sum +
            (Number(holding.imported_current_value || 0) ||
              Number(holding.units || 0) * Number(holding.latest_price || 0)),
          0,
        );
      return {
        id: account.id,
        label: account.provider || account.label,
        value,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function retirementAssetsFromCurrentWealth({
  pensionAccounts,
  pensionFunds,
  investmentAccounts,
  investmentHoldings,
  pensionAccessAge,
}: {
  pensionAccounts: PensionSummaryAccount[];
  pensionFunds: PensionSummaryFund[];
  investmentAccounts: InvestmentSummaryAccount[];
  investmentHoldings: InvestmentSummaryHolding[];
  pensionAccessAge?: number;
}): RetirementAsset[] {
  const pensions: RetirementAsset[] = pensionSourceLines(pensionAccounts, pensionFunds).map(
    (source) => ({
      id: `pension-${source.id}`,
      label: source.label,
      kind: "pension",
      currentValue: source.value,
      accessAge: pensionAccessAge ?? null,
    }),
  );

  const investments: RetirementAsset[] = investmentSourceLines(
    investmentAccounts,
    investmentHoldings,
  ).map((source) => ({
    id: `investment-${source.id}`,
    label: source.label,
    kind: "investment",
    currentValue: source.value,
    accessAge: null,
  }));

  return [...pensions, ...investments];
}

export function retirementContributionsFromPensions(
  accounts: PensionSummaryAccount[],
): RetirementContribution[] {
  return accounts
    .filter((account) => Number(account.fixed_monthly_contribution || 0) > 0)
    .map((account) => ({
      id: `pension-contribution-${account.id}`,
      label: `${account.provider || account.label} contribution`,
      monthlyAmount: Number(account.fixed_monthly_contribution || 0),
      assetId: `pension-${account.id}`,
    }));
}
