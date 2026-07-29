import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";

export type MortgageProductOption = {
  lender: string;
  productName: string;
  rate: number;
  rateType: "2yr_fixed" | "3yr_fixed" | "5yr_fixed" | "tracker" | "stress" | "planning";
  maxLtv: number;
  productFee: number;
  termYears: number;
  monthlyPayment: number;
  stressedPayment: number;
  totalInitialPeriodCost?: number;
  notes: string;
  sourceName?: string;
  sourceUrl?: string;
  refreshedAt?: string;
};

export type LenderAffordabilityCheck = {
  lender: string;
  style: "regulatory" | "mainstream_lender" | "building_society" | "broker_research";
  includedCosts: string[];
  resultLabel: string;
  estimatedMaxBorrowing: number;
  affordabilityGap: number;
  monthlyDeductionsUsed: number;
  notes: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type MortgageAffordabilityBreakdown = {
  loanRequired: number;
  ltv: number;
  estimatedEquityUsed: number;
  currentMortgageExcludedFromScore: boolean;
  incomeMultiple: number;
  netMonthlyIncome: number;
  monthlyCommittedBeforeNewMortgage: number;
  newMortgagePayment: number;
  stressedNewMortgagePayment: number;
  bufferAfterNewMortgage: number;
  bufferAfterStress: number;
  paymentToNetIncomePercent: number;
  stressedPaymentToNetIncomePercent: number;
};

export type MortgagePlanningContext = {
  targetPrice: number;
  depositCash: number;
  currentPropertySalePrice?: number;
  currentMortgageBalance?: number;
  grossHouseholdIncome: number;
  netMonthlyIncome?: number;
  monthlyFixedCosts: number;
  monthlyChildcare: number;
  monthlyDebtPayments?: number;
  monthlyCarFinance?: number;
  monthlyStudentLoans?: number;
  dependantChildren?: number;
  dependantAdults?: number;
  currentMortgagePayment?: number;
  termYears?: number;
  productRate?: number;
  stressRate?: number;
  includeCurrentMortgageAsBackgroundCost?: boolean;
};

export const UK_MORTGAGE_LOGIC_SOURCES = [
  {
    name: "FCA MCOB 11.6 responsible lending",
    url: "https://handbook.fca.org.uk/handbook/MCOB/11/6.html",
    note: "Lenders must assess affordability from income/expenditure and account for likely future interest-rate increases.",
  },
  {
    name: "MoneyHelper mortgage affordability",
    url: "https://www.moneyhelper.org.uk/en/homes/buying-a-home/how-much-can-you-afford-to-borrow-for-a-mortgage",
    note: "Mortgage affordability is based on income, outgoings and employment security.",
  },
  {
    name: "Nationwide intermediary outgoings criteria",
    url: "https://www.nationwide-intermediary.co.uk/lending-criteria/outgoings",
    note: "Outgoings include childcare, dependant costs, student loans, travel/car costs, school fees and credit commitments.",
  },
  {
    name: "Halifax intermediary dependants criteria",
    url: "https://www.halifax-intermediaries.co.uk/criteria.html",
    note: "Dependants include children, future dependants and financially reliant adults; some background property costs can count as commitments.",
  },
  {
    name: "HSBC residential keying guide",
    url: "https://intermediaries.hsbc.co.uk/pdfs/Residential_keying_guide_final.pdf",
    note: "For maternity leave, brokers should include future childcare costs and income/work-term changes.",
  },
  {
    name: "Coventry affordability calculator",
    url: "https://www.coventryforintermediaries.co.uk/affordability-calculators/affordability-calculator.html",
    note: "The calculator requests dependants, income and expenditure before estimating borrowing.",
  },
  {
    name: "MoneySavingExpert mortgage best buys",
    url: "https://www.moneysavingexpert.com/mortgages/best-buys/",
    note: "Useful live comparison point for product rate checks.",
  },
  {
    name: "Moneyfacts fixed-rate mortgage charts",
    url: "https://moneyfactscompare.co.uk/mortgages/fixed-rate-mortgages/",
    note: "Updated fixed-rate comparison charts across many UK lenders.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function estimateNetMonthlyIncome(grossAnnual: number, suppliedNetMonthly?: number) {
  if (Number(suppliedNetMonthly || 0) > 0) return Number(suppliedNetMonthly);
  return Number(grossAnnual || 0) / 12 * 0.68;
}

export function calculateMortgageBreakdown(input: MortgagePlanningContext): MortgageAffordabilityBreakdown {
  const targetPrice = Number(input.targetPrice || 0);
  const currentSalePrice = Number(input.currentPropertySalePrice || 0);
  const currentMortgageBalance = Number(input.currentMortgageBalance || 0);
  const equity = Math.max(0, currentSalePrice - currentMortgageBalance);
  const estimatedEquityUsed = currentSalePrice > 0 ? equity : 0;
  const loanRequired = Math.max(0, targetPrice - Number(input.depositCash || 0) - estimatedEquityUsed);
  const ltv = targetPrice > 0 ? (loanRequired / targetPrice) * 100 : 0;
  const termYears = Number(input.termYears || 30);
  const rate = Number(input.productRate || 4.75);
  const stressRate = Number(input.stressRate || Math.max(6.5, rate + 1.5));
  const netMonthlyIncome = estimateNetMonthlyIncome(input.grossHouseholdIncome, input.netMonthlyIncome);
  const baseCommitted = Number(input.monthlyFixedCosts || 0) + Number(input.monthlyChildcare || 0) + Number(input.monthlyDebtPayments || 0) + Number(input.monthlyCarFinance || 0) + Number(input.monthlyStudentLoans || 0);
  const currentMortgageInScore = Boolean(input.includeCurrentMortgageAsBackgroundCost);
  const monthlyCommittedBeforeNewMortgage = baseCommitted + (currentMortgageInScore ? Number(input.currentMortgagePayment || 0) : 0);
  const newMortgagePayment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: rate, termYears });
  const stressedNewMortgagePayment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: stressRate, termYears });

  return {
    loanRequired,
    ltv,
    estimatedEquityUsed,
    currentMortgageExcludedFromScore: !currentMortgageInScore,
    incomeMultiple: Number(input.grossHouseholdIncome || 0) > 0 ? loanRequired / Number(input.grossHouseholdIncome || 1) : 0,
    netMonthlyIncome,
    monthlyCommittedBeforeNewMortgage,
    newMortgagePayment,
    stressedNewMortgagePayment,
    bufferAfterNewMortgage: netMonthlyIncome - monthlyCommittedBeforeNewMortgage - newMortgagePayment,
    bufferAfterStress: netMonthlyIncome - monthlyCommittedBeforeNewMortgage - stressedNewMortgagePayment,
    paymentToNetIncomePercent: netMonthlyIncome > 0 ? (newMortgagePayment / netMonthlyIncome) * 100 : 0,
    stressedPaymentToNetIncomePercent: netMonthlyIncome > 0 ? (stressedNewMortgagePayment / netMonthlyIncome) * 100 : 0,
  };
}

export function scoreMortgageAffordability(breakdown: MortgageAffordabilityBreakdown) {
  let score = 100;
  if (breakdown.incomeMultiple > 4.5) score -= (breakdown.incomeMultiple - 4.5) * 22;
  if (breakdown.ltv > 90) score -= (breakdown.ltv - 90) * 2.5;
  else if (breakdown.ltv > 85) score -= (breakdown.ltv - 85) * 1.2;
  if (breakdown.paymentToNetIncomePercent > 35) score -= (breakdown.paymentToNetIncomePercent - 35) * 1.8;
  if (breakdown.stressedPaymentToNetIncomePercent > 42) score -= (breakdown.stressedPaymentToNetIncomePercent - 42) * 2.2;
  if (breakdown.bufferAfterNewMortgage < 0) score -= 25;
  else if (breakdown.netMonthlyIncome > 0 && breakdown.bufferAfterNewMortgage / breakdown.netMonthlyIncome < 0.12) score -= 12;
  if (breakdown.bufferAfterStress < 0) score -= 18;
  return Math.round(clamp(score, 5, 96));
}

function ltvBandRateAdjustment(ltv: number) {
  if (ltv <= 60) return -0.12;
  if (ltv <= 75) return 0;
  if (ltv <= 80) return 0.08;
  if (ltv <= 85) return 0.2;
  if (ltv <= 90) return 0.35;
  if (ltv <= 95) return 0.7;
  return 1.05;
}

export function fallbackMortgageProducts(input: MortgagePlanningContext): MortgageProductOption[] {
  const breakdown = calculateMortgageBreakdown(input);
  const termYears = Number(input.termYears || 30);
  const ltv = breakdown.ltv || 75;
  const base = Number(input.productRate || 4.65) + ltvBandRateAdjustment(ltv);
  const stressRate = Number(input.stressRate || Math.max(6.5, base + 1.5));
  const productInputs = [
    { lender: "Market shortlist", productName: "2-year fixed rate research option", rate: base + 0.05, rateType: "2yr_fixed" as const, maxLtv: ltv <= 90 ? Math.max(75, Math.ceil(ltv / 5) * 5) : 95, productFee: 999, notes: "Planning assumption for a shorter fix. Refresh rates before relying on it." },
    { lender: "Market shortlist", productName: "5-year fixed rate research option", rate: base + 0.18, rateType: "5yr_fixed" as const, maxLtv: ltv <= 90 ? Math.max(75, Math.ceil(ltv / 5) * 5) : 95, productFee: 999, notes: "Planning assumption for longer payment certainty. Compare fees and early repayment charges." },
    { lender: "Affordability stress", productName: "Stress-rate check", rate: stressRate, rateType: "stress" as const, maxLtv: 95, productFee: 0, notes: "Not a mortgage product. Used to test whether repayments still work at a harsher rate." },
  ];
  return productInputs.map((product) => {
    const monthlyPayment = calculateMonthlyMortgagePayment({ balance: breakdown.loanRequired, annualInterestRate: product.rate, termYears });
    return {
      ...product,
      termYears,
      monthlyPayment,
      stressedPayment: calculateMonthlyMortgagePayment({ balance: breakdown.loanRequired, annualInterestRate: stressRate, termYears }),
      sourceName: product.rateType === "stress" ? "Internal stress test" : "Market fallback until live search completes",
      sourceUrl: product.rateType === "stress" ? undefined : "https://www.moneysavingexpert.com/mortgages/best-buys/",
      refreshedAt: new Date().toISOString(),
    };
  });
}

export function buildLenderAffordabilityChecks(input: MortgagePlanningContext): LenderAffordabilityCheck[] {
  const breakdown = calculateMortgageBreakdown(input);
  const gross = Number(input.grossHouseholdIncome || 0);
  const dependants = Number(input.dependantChildren || 0) + Number(input.dependantAdults || 0);
  const monthlyDeductions = breakdown.monthlyCommittedBeforeNewMortgage;
  const annualisedDeductions = monthlyDeductions * 12;
  const adjustedIncome = Math.max(0, gross - annualisedDeductions * 0.55);
  const dependantPenalty = dependants * 0.08;

  const profiles = [
    {
      lender: "FCA baseline",
      style: "regulatory" as const,
      multiple: 4.5,
      includedCosts: ["verified income", "regular outgoings", "credit commitments", "future rate stress"],
      sourceName: "FCA MCOB 11.6",
      sourceUrl: "https://handbook.fca.org.uk/handbook/MCOB/11/6.html",
      notes: "Regulatory lens: the new payment and a stressed payment need to look sustainable after household expenditure.",
    },
    {
      lender: "Nationwide-style",
      style: "mainstream_lender" as const,
      multiple: 4.35 - dependantPenalty,
      includedCosts: ["childcare", "dependant costs", "student loans", "travel/car costs", "school fees", "credit commitments"],
      sourceName: "Nationwide outgoings criteria",
      sourceUrl: "https://www.nationwide-intermediary.co.uk/lending-criteria/outgoings",
      notes: "This lens is deliberately stricter where childcare, student loans, car/travel costs or school fees are present.",
    },
    {
      lender: "Halifax-style",
      style: "mainstream_lender" as const,
      multiple: 4.45 - dependantPenalty * 0.75,
      includedCosts: ["child dependants", "adult dependants", "maintenance", "background property commitments"],
      sourceName: "Halifax intermediary criteria",
      sourceUrl: "https://www.halifax-intermediaries.co.uk/criteria.html",
      notes: "This lens highlights dependant counts and background property commitments. Your existing mortgage is ignored only when the old home is assumed sold/replaced.",
    },
    {
      lender: "HSBC-style maternity lens",
      style: "mainstream_lender" as const,
      multiple: 4.25 - dependantPenalty,
      includedCosts: ["future childcare", "maternity income changes", "travel sensibility", "background property costs"],
      sourceName: "HSBC residential keying guide",
      sourceUrl: "https://intermediaries.hsbc.co.uk/pdfs/Residential_keying_guide_final.pdf",
      notes: "Useful when maternity, return-to-work dates and future childcare could change affordability during or shortly after the application.",
    },
    {
      lender: "Building-society calculator lens",
      style: "building_society" as const,
      multiple: 4.2 - dependantPenalty,
      includedCosts: ["dependant children", "dependant adults", "income", "expenditure", "loan term"],
      sourceName: "Coventry affordability calculator",
      sourceUrl: "https://www.coventryforintermediaries.co.uk/affordability-calculators/affordability-calculator.html",
      notes: "A calculator-style estimate, useful for seeing how dependant counts and declared expenditure move the result.",
    },
  ];

  return profiles.map((profile) => {
    const estimatedMaxBorrowing = Math.max(0, adjustedIncome * Math.max(2.5, profile.multiple));
    const affordabilityGap = estimatedMaxBorrowing - breakdown.loanRequired;
    return {
      lender: profile.lender,
      style: profile.style,
      includedCosts: profile.includedCosts,
      resultLabel: affordabilityGap >= 0 ? "Within rough lens" : "Would need more detail",
      estimatedMaxBorrowing,
      affordabilityGap,
      monthlyDeductionsUsed: monthlyDeductions,
      notes: profile.notes,
      sourceName: profile.sourceName,
      sourceUrl: profile.sourceUrl,
    };
  });
}
