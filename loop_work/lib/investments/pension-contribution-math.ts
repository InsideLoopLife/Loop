export type PensionSalarySacrificeInput = {
  grossSalaryAnnual?: number | null;
  employeeContributionPercent?: number | null;
  employerBaseContributionPercent?: number | null;
  employerBaseSalaryBasis?: "pre_sacrifice" | "post_sacrifice" | string | null;
  employerNiEnabled?: boolean | null;
  employerNiRatePercent?: number | null;
  employerNiPassbackPercent?: number | null;
  fixedMonthlyContribution?: number | null;
  fixedEmployerTopUpPercent?: number | null;
  employerNiTopUpMode?: string | null;
  contributionMethod?: string | null;
};

export type PensionSalarySacrificeResult = {
  grossMonthly: number;
  employeeSacrificeMonthly: number;
  postSacrificeMonthlySalary: number;
  employerBaseMonthly: number;
  employerNiSavedMonthly: number;
  employerNiReinvestedMonthly: number;
  fixedMonthly: number;
  totalMonthlyPensionInput: number;
  totalAnnualPensionInput: number;
  usesSalarySacrifice: boolean;
  employerBaseSalaryBasis: "pre_sacrifice" | "post_sacrifice";
  warnings: string[];
};

function safe(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculatePensionSalarySacrifice(
  input: PensionSalarySacrificeInput,
): PensionSalarySacrificeResult {
  const grossAnnual = Math.max(0, safe(input.grossSalaryAnnual));
  const grossMonthly = grossAnnual / 12;
  const employeeRate = clamp(safe(input.employeeContributionPercent), 0, 100);
  const employerRate = clamp(safe(input.employerBaseContributionPercent), 0, 100);
  const niRate = clamp(safe(input.employerNiRatePercent, 15), 0, 100);
  const passbackRate = clamp(safe(input.employerNiPassbackPercent), 0, 100);
  const configuredFixedMonthly = Math.max(0, safe(input.fixedMonthlyContribution));
  const topUpMode = String(input.employerNiTopUpMode || "saved_ni")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const fixedEmployerTopUpRate = clamp(safe(input.fixedEmployerTopUpPercent), 0, 100);
  // Older saved-NI rows use 100 to mean "pass back 100% of the NI saving".
  // It is only a percentage of gross salary in explicit fixed_percent mode.
  const fixedPercentTopUpMonthly =
    topUpMode === "fixed_percent"
      ? grossMonthly * (fixedEmployerTopUpRate / 100)
      : 0;
  const fixedMonthly = configuredFixedMonthly + fixedPercentTopUpMonthly;
  const method = String(input.contributionMethod || "salary_sacrifice")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const usesSalarySacrifice = method === "salary_sacrifice";
  const employeeSacrificeMonthly = grossMonthly * (employeeRate / 100);
  const postSacrificeMonthlySalary = Math.max(0, grossMonthly - employeeSacrificeMonthly);
  const employerBaseSalaryBasis =
    input.employerBaseSalaryBasis === "post_sacrifice"
      ? "post_sacrifice"
      : "pre_sacrifice";
  const employerBaseMonthly =
    (employerBaseSalaryBasis === "post_sacrifice"
      ? postSacrificeMonthlySalary
      : grossMonthly) *
    (employerRate / 100);
  const employerNiSavedMonthly = usesSalarySacrifice
    ? employeeSacrificeMonthly * (niRate / 100)
    : 0;
  const employerNiReinvestedMonthly =
    usesSalarySacrifice && input.employerNiEnabled
      ? employerNiSavedMonthly * (passbackRate / 100)
      : 0;
  const totalMonthlyPensionInput = Math.max(
    0,
    employeeSacrificeMonthly +
      employerBaseMonthly +
      employerNiReinvestedMonthly +
      fixedMonthly,
  );
  const warnings: string[] = [];
  if (input.employerNiEnabled && !usesSalarySacrifice) {
    warnings.push("Employer NI reinvestment only applies when the contribution method is salary sacrifice.");
  }
  if (usesSalarySacrifice && employeeRate > 0 && grossAnnual <= 0) {
    warnings.push("Add an active gross salary to calculate the salary-sacrifice contribution.");
  }
  if (input.employerNiEnabled && passbackRate <= 0) {
    warnings.push("The employer NI pass-back is enabled but its pass-back percentage is 0%.");
  }
  if (employeeRate >= 100) {
    warnings.push("Salary sacrifice cannot reduce cash earnings below National Minimum Wage. Review this contribution rate.");
  }

  return {
    grossMonthly,
    employeeSacrificeMonthly,
    postSacrificeMonthlySalary,
    employerBaseMonthly,
    employerNiSavedMonthly,
    employerNiReinvestedMonthly,
    fixedMonthly,
    totalMonthlyPensionInput,
    totalAnnualPensionInput: totalMonthlyPensionInput * 12,
    usesSalarySacrifice,
    employerBaseSalaryBasis,
    warnings,
  };
}
