export type PensionAccountValue = {
  id: string;
  current_value?: number | null;
};

export type PensionFundValue = {
  pension_account_id?: string | null;
  current_value?: number | null;
  units?: number | null;
  unit_price?: number | null;
};

function finiteNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function pensionFundValue(fund: PensionFundValue) {
  const storedValue = finiteNumber(fund.current_value);
  return storedValue > 0
    ? storedValue
    : finiteNumber(fund.units) * finiteNumber(fund.unit_price);
}

/**
 * A pension account is the parent container for its funds, not an additional
 * asset. Prefer the sum of child funds when present and use the account value
 * only as a fallback for provider-value pots without a usable fund breakdown.
 */
export function pensionAccountValue(
  account: PensionAccountValue,
  funds: PensionFundValue[],
) {
  const fundTotal = funds
    .filter((fund) => fund.pension_account_id === account.id)
    .reduce((sum, fund) => sum + pensionFundValue(fund), 0);
  return fundTotal > 0 ? fundTotal : finiteNumber(account.current_value);
}

export function totalPensionValue(
  accounts: PensionAccountValue[],
  funds: PensionFundValue[],
) {
  const accountIds = new Set(accounts.map((account) => account.id));
  const accounted = accounts.reduce(
    (sum, account) => sum + pensionAccountValue(account, funds),
    0,
  );
  const orphaned = funds
    .filter(
      (fund) =>
        !fund.pension_account_id || !accountIds.has(fund.pension_account_id),
    )
    .reduce((sum, fund) => sum + pensionFundValue(fund), 0);
  return accounted + orphaned;
}
