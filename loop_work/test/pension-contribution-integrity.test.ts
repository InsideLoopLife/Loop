import assert from "node:assert/strict";
import test from "node:test";
import { calculatePensionSalarySacrifice } from "../lib/investments/pension-contribution-math";
import { estimatedMonthlyPensionFundCost } from "../lib/investments/pension-management-charges";

test("saved-NI pass-back is not also treated as 100% of gross salary", () => {
  const result = calculatePensionSalarySacrifice({
    grossSalaryAnnual: 67_380,
    employeeContributionPercent: 17.5,
    employerBaseContributionPercent: 3,
    employerNiEnabled: true,
    employerNiRatePercent: 15,
    employerNiPassbackPercent: 100,
    fixedEmployerTopUpPercent: 100,
    employerNiTopUpMode: "saved_ni",
    fixedMonthlyContribution: 0,
    contributionMethod: "salary_sacrifice",
  });

  assert.equal(result.fixedMonthly, 0);
  assert.ok(result.totalMonthlyPensionInput > 1_200);
  assert.ok(result.totalMonthlyPensionInput < 1_400);
});

test("fixed-percent mode applies the configured salary top-up", () => {
  const result = calculatePensionSalarySacrifice({
    grossSalaryAnnual: 60_000,
    fixedEmployerTopUpPercent: 5,
    employerNiTopUpMode: "fixed_percent",
  });

  assert.equal(result.fixedMonthly, 250);
});

test("fund fees are estimated without reconstructing or cancelling provider units", () => {
  assert.equal(
    estimatedMonthlyPensionFundCost({
      currentValue: 28_033.23,
      annualFeePercent: 0.94,
    }),
    21.96,
  );
});
