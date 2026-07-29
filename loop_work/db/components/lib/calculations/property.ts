export type StampDutyOptions = {
  purchasePrice: number;
  firstTimeBuyer?: boolean;
  additionalProperty?: boolean;
};

function taxBand(amount: number, lower: number, upper: number | null, rate: number) {
  if (amount <= lower) return 0;
  const taxable = Math.min(amount, upper ?? amount) - lower;
  return Math.max(0, taxable) * rate;
}

export function calculateStampDutyEngland({
  purchasePrice,
  firstTimeBuyer = false,
  additionalProperty = false,
}: StampDutyOptions) {
  const price = Math.max(0, purchasePrice);

  if (price <= 0) return 0;

  if (firstTimeBuyer && price <= 500000 && !additionalProperty) {
    return taxBand(price, 300000, 500000, 0.05);
  }

  const standard =
    taxBand(price, 125000, 250000, 0.02) +
    taxBand(price, 250000, 925000, 0.05) +
    taxBand(price, 925000, 1500000, 0.1) +
    taxBand(price, 1500000, null, 0.12);

  if (!additionalProperty) return standard;

  // Higher rate is normally 5 percentage points on top of the normal bands.
  return standard + price * 0.05;
}

export function calculateAffordabilityScenario({
  purchasePrice,
  depositCash,
  currentPropertySalePrice,
  currentMortgageBalance,
  grossHouseholdIncome,
  monthlyFixedCosts,
  monthlyChildcare,
  monthlyMortgagePayment,
  stressMortgagePayment,
  stampDuty,
  arrangementAndMovingCosts,
}: {
  purchasePrice: number;
  depositCash: number;
  currentPropertySalePrice: number;
  currentMortgageBalance: number;
  grossHouseholdIncome: number;
  monthlyFixedCosts: number;
  monthlyChildcare: number;
  monthlyMortgagePayment: number;
  stressMortgagePayment: number;
  stampDuty: number;
  arrangementAndMovingCosts: number;
}) {
  const equity = Math.max(0, currentPropertySalePrice - currentMortgageBalance);
  const availableDeposit = Math.max(0, depositCash + equity);
  const loanRequired = Math.max(0, purchasePrice - availableDeposit);
  const ltv = purchasePrice > 0 ? (loanRequired / purchasePrice) * 100 : 0;
  const incomeMultiple = grossHouseholdIncome > 0 ? loanRequired / grossHouseholdIncome : 0;
  const upfrontCashNeeded = stampDuty + arrangementAndMovingCosts;
  const monthlyCommitments = monthlyFixedCosts + monthlyChildcare + monthlyMortgagePayment;
  const stressMonthlyCommitments = monthlyFixedCosts + monthlyChildcare + stressMortgagePayment;

  return {
    equity,
    availableDeposit,
    loanRequired,
    ltv,
    incomeMultiple,
    upfrontCashNeeded,
    monthlyCommitments,
    stressMonthlyCommitments,
  };
}
