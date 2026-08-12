export type RetirementAssetKind =
  | "pension"
  | "isa"
  | "investment"
  | "cash"
  | "other";

export type RetirementPlanStatus = "on_track" | "close" | "shortfall";

export type RetirementAsset = {
  id: string;
  label: string;
  kind: RetirementAssetKind;
  currentValue: number;
  /** Age this asset can first be used for retirement spending. */
  accessAge?: number | null;
  annualGrowthRatePercent?: number | null;
  annualFeePercent?: number | null;
};

export type RetirementContribution = {
  id: string;
  label: string;
  monthlyAmount: number;
  /** Optional asset receiving the contribution. If omitted it is treated as accessible at retirement. */
  assetId?: string | null;
  startAge?: number | null;
  endAge?: number | null;
  annualIncreasePercent?: number | null;
};

export type RetirementPlanInput = {
  currentAge: number;
  retirementAge: number;
  /** Desired gross annual retirement income, expressed in today's money. */
  targetAnnualIncome: number;
  assets: RetirementAsset[];
  contributions?: RetirementContribution[];
  /** Guaranteed annual income available from the retirement date, in today's money. */
  guaranteedAnnualIncome?: number;
  /** Pot the user wants to preserve rather than draw down, in today's money. */
  targetLegacyPot?: number;
  annualGrowthRatePercent?: number;
  annualInflationPercent?: number;
  annualFeePercent?: number;
  sustainableWithdrawalRatePercent?: number;
  /** A plan within this percentage of its required pot is marked as close. */
  closeThresholdPercent?: number;
};

export type RetirementAssetProjection = RetirementAsset & {
  projectedValueAtRetirement: number;
  projectedValueAtRetirementTodayMoney: number;
  accessibleAtRetirement: boolean;
};

export type RetirementPlanProjection = {
  currentAge: number;
  retirementAge: number;
  yearsToRetirement: number;
  targetAnnualIncome: number;
  guaranteedAnnualIncome: number;
  targetLegacyPot: number;
  currentRetirementAssets: number;
  projectedRetirementAssets: number;
  projectedRetirementAssetsTodayMoney: number;
  accessibleRetirementAssetsTodayMoney: number;
  inaccessibleRetirementAssetsTodayMoney: number;
  requiredRetirementPotTodayMoney: number;
  projectedAnnualIncomeTodayMoney: number;
  annualIncomeGapTodayMoney: number;
  potShortfallTodayMoney: number;
  requiredAdditionalMonthlyContributionTodayMoney: number;
  fundingRatio: number;
  status: RetirementPlanStatus;
  assetProjections: RetirementAssetProjection[];
  assumptions: {
    annualGrowthRatePercent: number;
    annualInflationPercent: number;
    annualFeePercent: number;
    sustainableWithdrawalRatePercent: number;
    closeThresholdPercent: number;
  };
  warnings: string[];
};

const DEFAULTS = {
  annualGrowthRatePercent: 5,
  annualInflationPercent: 2.5,
  annualFeePercent: 0.5,
  sustainableWithdrawalRatePercent: 3.5,
  closeThresholdPercent: 90,
} as const;

const EPSILON = 1e-9;

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to 0`);
  }
}

function toRate(percent: number) {
  return percent / 100;
}

function annualToMonthlyRate(annualRate: number) {
  if (annualRate <= -1) return -1;
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function inflationFactor(annualInflationRate: number, years: number) {
  return Math.pow(1 + annualInflationRate, years);
}

function contributionIsActive(
  contribution: RetirementContribution,
  ageAtMonthStart: number,
) {
  const startsAt = contribution.startAge ?? -Infinity;
  const endsAt = contribution.endAge ?? Infinity;
  return ageAtMonthStart >= startsAt && ageAtMonthStart < endsAt;
}

function projectContributionAmount(
  baseMonthlyAmount: number,
  annualIncreaseRate: number,
  activeYears: number,
) {
  return baseMonthlyAmount * Math.pow(1 + annualIncreaseRate, activeYears);
}

function calculateStatus(
  fundingRatio: number,
  closeThresholdPercent: number,
): RetirementPlanStatus {
  if (fundingRatio >= 1) return "on_track";
  if (fundingRatio >= closeThresholdPercent / 100) return "close";
  return "shortfall";
}

function projectPlanWithExtraMonthlyContribution(
  input: RetirementPlanInput,
  extraMonthlyContribution: number,
) {
  const yearsToRetirement = input.retirementAge - input.currentAge;
  const monthsToRetirement = Math.max(0, Math.round(yearsToRetirement * 12));
  const inflation = toRate(input.annualInflationPercent ?? DEFAULTS.annualInflationPercent);
  const defaultGrowth = toRate(input.annualGrowthRatePercent ?? DEFAULTS.annualGrowthRatePercent);
  const defaultFee = toRate(input.annualFeePercent ?? DEFAULTS.annualFeePercent);
  const contributions = input.contributions ?? [];

  const valuesByAsset = new Map<string, number>();
  for (const asset of input.assets) valuesByAsset.set(asset.id, asset.currentValue);
  let unassignedContributionValue = 0;

  for (let month = 0; month < monthsToRetirement; month += 1) {
    const ageAtMonthStart = input.currentAge + month / 12;

    for (const asset of input.assets) {
      const growth = toRate(asset.annualGrowthRatePercent ?? input.annualGrowthRatePercent ?? DEFAULTS.annualGrowthRatePercent);
      const fee = toRate(asset.annualFeePercent ?? input.annualFeePercent ?? DEFAULTS.annualFeePercent);
      const netAnnualReturn = (1 + growth) * (1 - fee) - 1;
      const monthlyReturn = annualToMonthlyRate(netAnnualReturn);
      const current = valuesByAsset.get(asset.id) ?? 0;
      valuesByAsset.set(asset.id, current * (1 + monthlyReturn));
    }

    const unassignedMonthlyReturn = annualToMonthlyRate((1 + defaultGrowth) * (1 - defaultFee) - 1);
    unassignedContributionValue *= 1 + unassignedMonthlyReturn;

    for (const contribution of contributions) {
      if (!contributionIsActive(contribution, ageAtMonthStart)) continue;
      const activeStartAge = contribution.startAge ?? input.currentAge;
      const activeYears = Math.max(0, Math.floor(ageAtMonthStart - activeStartAge));
      const amount = projectContributionAmount(
        contribution.monthlyAmount,
        toRate(contribution.annualIncreasePercent ?? 0),
        activeYears,
      );

      if (contribution.assetId && valuesByAsset.has(contribution.assetId)) {
        valuesByAsset.set(
          contribution.assetId,
          (valuesByAsset.get(contribution.assetId) ?? 0) + amount,
        );
      } else {
        unassignedContributionValue += amount;
      }
    }

    unassignedContributionValue += extraMonthlyContribution;
  }

  const futureInflationFactor = inflationFactor(inflation, yearsToRetirement);
  const assetFutureValues = input.assets.map((asset) => ({
    asset,
    nominal: valuesByAsset.get(asset.id) ?? 0,
    real: (valuesByAsset.get(asset.id) ?? 0) / futureInflationFactor,
  }));

  const unassignedReal = unassignedContributionValue / futureInflationFactor;
  const accessibleReal =
    assetFutureValues
      .filter(({ asset }) => asset.accessAge == null || asset.accessAge <= input.retirementAge)
      .reduce((sum, item) => sum + item.real, 0) + unassignedReal;

  return {
    assetFutureValues,
    unassignedNominal: unassignedContributionValue,
    unassignedReal,
    accessibleReal,
  };
}

function solveRequiredAdditionalMonthlyContribution(
  input: RetirementPlanInput,
  requiredPot: number,
  alreadyAccessiblePot: number,
) {
  if (alreadyAccessiblePot >= requiredPot - EPSILON) return 0;
  if (input.retirementAge <= input.currentAge) return Number.POSITIVE_INFINITY;

  const producesEnough = (monthly: number) =>
    projectPlanWithExtraMonthlyContribution(input, monthly).accessibleReal >= requiredPot;

  let high = 100;
  while (!producesEnough(high) && high < 100_000) high *= 2;
  if (!producesEnough(high)) return Number.POSITIVE_INFINITY;

  let low = 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (producesEnough(mid)) high = mid;
    else low = mid;
  }

  return high;
}

export function calculateRetirementPlan(input: RetirementPlanInput): RetirementPlanProjection {
  assertFiniteNonNegative(input.currentAge, "currentAge");
  assertFiniteNonNegative(input.retirementAge, "retirementAge");
  assertFiniteNonNegative(input.targetAnnualIncome, "targetAnnualIncome");
  if (input.retirementAge < input.currentAge) {
    throw new Error("retirementAge must be greater than or equal to currentAge");
  }

  for (const asset of input.assets) {
    assertFiniteNonNegative(asset.currentValue, `assets.${asset.id}.currentValue`);
  }
  for (const contribution of input.contributions ?? []) {
    assertFiniteNonNegative(contribution.monthlyAmount, `contributions.${contribution.id}.monthlyAmount`);
  }

  const annualGrowthRatePercent = input.annualGrowthRatePercent ?? DEFAULTS.annualGrowthRatePercent;
  const annualInflationPercent = input.annualInflationPercent ?? DEFAULTS.annualInflationPercent;
  const annualFeePercent = input.annualFeePercent ?? DEFAULTS.annualFeePercent;
  const sustainableWithdrawalRatePercent = input.sustainableWithdrawalRatePercent ?? DEFAULTS.sustainableWithdrawalRatePercent;
  const closeThresholdPercent = input.closeThresholdPercent ?? DEFAULTS.closeThresholdPercent;
  const guaranteedAnnualIncome = input.guaranteedAnnualIncome ?? 0;
  const targetLegacyPot = input.targetLegacyPot ?? 0;

  assertFiniteNonNegative(guaranteedAnnualIncome, "guaranteedAnnualIncome");
  assertFiniteNonNegative(targetLegacyPot, "targetLegacyPot");
  if (sustainableWithdrawalRatePercent <= 0 || sustainableWithdrawalRatePercent > 100) {
    throw new Error("sustainableWithdrawalRatePercent must be greater than 0 and no more than 100");
  }
  if (closeThresholdPercent < 0 || closeThresholdPercent > 100) {
    throw new Error("closeThresholdPercent must be between 0 and 100");
  }

  const yearsToRetirement = input.retirementAge - input.currentAge;
  const projection = projectPlanWithExtraMonthlyContribution(input, 0);
  const withdrawalRate = toRate(sustainableWithdrawalRatePercent);
  const incomeRequiredFromAssets = Math.max(0, input.targetAnnualIncome - guaranteedAnnualIncome);
  const requiredRetirementPotTodayMoney = incomeRequiredFromAssets / withdrawalRate + targetLegacyPot;

  const accessibleRetirementAssetsTodayMoney = projection.accessibleReal;
  const projectedRetirementAssetsTodayMoney =
    projection.assetFutureValues.reduce((sum, item) => sum + item.real, 0) + projection.unassignedReal;
  const projectedRetirementAssets =
    projection.assetFutureValues.reduce((sum, item) => sum + item.nominal, 0) + projection.unassignedNominal;
  const inaccessibleRetirementAssetsTodayMoney = Math.max(
    0,
    projectedRetirementAssetsTodayMoney - accessibleRetirementAssetsTodayMoney,
  );
  const drawablePot = Math.max(0, accessibleRetirementAssetsTodayMoney - targetLegacyPot);
  const projectedAnnualIncomeTodayMoney = guaranteedAnnualIncome + drawablePot * withdrawalRate;
  const annualIncomeGapTodayMoney = Math.max(0, input.targetAnnualIncome - projectedAnnualIncomeTodayMoney);
  const potShortfallTodayMoney = Math.max(0, requiredRetirementPotTodayMoney - accessibleRetirementAssetsTodayMoney);
  const fundingRatio = requiredRetirementPotTodayMoney <= EPSILON
    ? 1
    : accessibleRetirementAssetsTodayMoney / requiredRetirementPotTodayMoney;

  const requiredAdditionalMonthlyContributionTodayMoney = solveRequiredAdditionalMonthlyContribution(
    input,
    requiredRetirementPotTodayMoney,
    accessibleRetirementAssetsTodayMoney,
  );

  const assetProjections: RetirementAssetProjection[] = projection.assetFutureValues.map(({ asset, nominal, real }) => ({
    ...asset,
    projectedValueAtRetirement: nominal,
    projectedValueAtRetirementTodayMoney: real,
    accessibleAtRetirement: asset.accessAge == null || asset.accessAge <= input.retirementAge,
  }));

  const warnings: string[] = [];
  if (inaccessibleRetirementAssetsTodayMoney > 0) {
    warnings.push("Some projected assets are not accessible at the selected retirement age and are excluded from initial retirement income.");
  }
  if (input.retirementAge === input.currentAge && potShortfallTodayMoney > 0) {
    warnings.push("There is no contribution period before the selected retirement age, so the shortfall cannot be closed through future monthly contributions.");
  }
  if (guaranteedAnnualIncome > input.targetAnnualIncome) {
    warnings.push("Guaranteed retirement income already exceeds the selected target income; the required pot therefore reflects only any legacy target.");
  }

  return {
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    yearsToRetirement,
    targetAnnualIncome: input.targetAnnualIncome,
    guaranteedAnnualIncome,
    targetLegacyPot,
    currentRetirementAssets: input.assets.reduce((sum, asset) => sum + asset.currentValue, 0),
    projectedRetirementAssets,
    projectedRetirementAssetsTodayMoney,
    accessibleRetirementAssetsTodayMoney,
    inaccessibleRetirementAssetsTodayMoney,
    requiredRetirementPotTodayMoney,
    projectedAnnualIncomeTodayMoney,
    annualIncomeGapTodayMoney,
    potShortfallTodayMoney,
    requiredAdditionalMonthlyContributionTodayMoney,
    fundingRatio,
    status: calculateStatus(fundingRatio, closeThresholdPercent),
    assetProjections,
    assumptions: {
      annualGrowthRatePercent,
      annualInflationPercent,
      annualFeePercent,
      sustainableWithdrawalRatePercent,
      closeThresholdPercent,
    },
    warnings,
  };
}

export function calculateRetirementWhatIfs(input: RetirementPlanInput) {
  const base = calculateRetirementPlan(input);
  const plusOneHundred = calculateRetirementPlan({
    ...input,
    contributions: [
      ...(input.contributions ?? []),
      { id: "what-if-extra-100", label: "Extra retirement saving", monthlyAmount: 100 },
    ],
  });
  const oneYearLater = calculateRetirementPlan({
    ...input,
    retirementAge: input.retirementAge + 1,
  });

  return {
    base,
    plusOneHundredPerMonth: {
      projectedRetirementAssetsTodayMoney: plusOneHundred.projectedRetirementAssetsTodayMoney,
      improvementTodayMoney:
        plusOneHundred.projectedRetirementAssetsTodayMoney - base.projectedRetirementAssetsTodayMoney,
      annualIncomeImprovementTodayMoney:
        plusOneHundred.projectedAnnualIncomeTodayMoney - base.projectedAnnualIncomeTodayMoney,
    },
    retireOneYearLater: {
      projectedRetirementAssetsTodayMoney: oneYearLater.projectedRetirementAssetsTodayMoney,
      improvementTodayMoney:
        oneYearLater.projectedRetirementAssetsTodayMoney - base.projectedRetirementAssetsTodayMoney,
      annualIncomeImprovementTodayMoney:
        oneYearLater.projectedAnnualIncomeTodayMoney - base.projectedAnnualIncomeTodayMoney,
    },
  };
}
