export type AssumptionDefault = {
  rate_key: string;
  label: string;
  value_numeric?: number;
  value_text?: string;
  source_url: string;
  source_name: string;
  effective_from: string;
  effective_until?: string | null;
  notes: string;
  category: "maternity" | "tax" | "ni" | "student_loan" | "stamp_duty" | "mortgage";
};

// Current working assumptions for England/Wales/Northern Ireland planning.
// These are seeded for each user so calculators have a source trail instead of silent hard-coded values.
export const OFFICIAL_ASSUMPTION_DEFAULTS: AssumptionDefault[] = [
  {
    rate_key: "smp_weekly_rate",
    label: "SMP flat weekly rate",
    value_numeric: 194.32,
    source_name: "GOV.UK maternity pay and leave",
    source_url: "https://www.gov.uk/maternity-pay-leave/pay",
    effective_from: "2026-04-06",
    notes: "Used after the first 6 weeks of SMP, subject to the lower-of rule versus 90% of average weekly earnings.",
    category: "maternity",
  },
  {
    rate_key: "smp_initial_weeks_percent",
    label: "SMP first 6 weeks percentage of average weekly earnings",
    value_numeric: 90,
    source_name: "GOV.UK maternity pay and leave",
    source_url: "https://www.gov.uk/maternity-pay-leave/pay",
    effective_from: "2026-04-06",
    notes: "First 6 weeks of SMP are 90% of average weekly earnings before tax.",
    category: "maternity",
  },
  {
    rate_key: "tax_personal_allowance",
    label: "Income tax personal allowance",
    value_numeric: 12570,
    source_name: "GOV.UK income tax rates",
    source_url: "https://www.gov.uk/income-tax-rates",
    effective_from: "2026-04-06",
    notes: "Standard personal allowance before tapering above £100,000 adjusted net income.",
    category: "tax",
  },
  {
    rate_key: "tax_basic_rate_limit_after_allowance",
    label: "Basic rate band after personal allowance",
    value_numeric: 37700,
    source_name: "GOV.UK income tax rates and allowances",
    source_url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
    effective_from: "2026-04-06",
    notes: "20% band on taxable income after allowances for England/Wales/NI.",
    category: "tax",
  },
  {
    rate_key: "ni_primary_threshold_annual",
    label: "Employee NI primary threshold annual",
    value_numeric: 12570,
    source_name: "GOV.UK employer rates and thresholds",
    source_url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027",
    effective_from: "2026-04-06",
    notes: "Annual equivalent of £242 per week / £1,048 per month primary threshold.",
    category: "ni",
  },
  {
    rate_key: "student_loan_plan_1_threshold",
    label: "Student loan Plan 1 annual threshold",
    value_numeric: 26900,
    source_name: "GOV.UK student loan repayment thresholds",
    source_url: "https://www.gov.uk/repaying-your-student-loan/what-you-pay",
    effective_from: "2026-04-06",
    notes: "Repay 9% over the threshold.",
    category: "student_loan",
  },
  {
    rate_key: "student_loan_plan_2_threshold",
    label: "Student loan Plan 2 annual threshold",
    value_numeric: 29385,
    source_name: "GOV.UK student loan repayment thresholds",
    source_url: "https://www.gov.uk/repaying-your-student-loan/what-you-pay",
    effective_from: "2026-04-06",
    notes: "Repay 9% over the threshold.",
    category: "student_loan",
  },
  {
    rate_key: "student_loan_plan_4_threshold",
    label: "Student loan Plan 4 annual threshold",
    value_numeric: 33795,
    source_name: "GOV.UK student loan repayment thresholds",
    source_url: "https://www.gov.uk/repaying-your-student-loan/what-you-pay",
    effective_from: "2026-04-06",
    notes: "Repay 9% over the threshold.",
    category: "student_loan",
  },
  {
    rate_key: "student_loan_plan_5_threshold",
    label: "Student loan Plan 5 annual threshold",
    value_numeric: 25000,
    source_name: "GOV.UK student loan repayment thresholds",
    source_url: "https://www.gov.uk/repaying-your-student-loan/what-you-pay",
    effective_from: "2026-04-06",
    notes: "Repay 9% over the threshold.",
    category: "student_loan",
  },
  {
    rate_key: "student_loan_postgraduate_threshold",
    label: "Postgraduate loan annual threshold",
    value_numeric: 21000,
    source_name: "GOV.UK student loan repayment thresholds",
    source_url: "https://www.gov.uk/repaying-your-student-loan/what-you-pay",
    effective_from: "2026-04-06",
    notes: "Repay 6% over the threshold.",
    category: "student_loan",
  },
  {
    rate_key: "sdlt_standard_bands_england_ni",
    label: "SDLT standard residential bands England/NI",
    value_text: "0% to £125k; 2% £125k-£250k; 5% £250k-£925k; 10% £925k-£1.5m; 12% above £1.5m",
    source_name: "GOV.UK residential SDLT rates",
    source_url: "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates",
    effective_from: "2025-04-01",
    notes: "For standard residential purchases. Additional property/first-time buyer/non-resident rules need separate handling.",
    category: "stamp_duty",
  },
  {
    rate_key: "mortgage_planning_stress_rate",
    label: "Mortgage planning stress-rate assumption",
    value_numeric: 7.0,
    source_name: "Internal planning assumption",
    source_url: "",
    effective_from: "2026-01-01",
    notes: "Not an official rate. Used for affordability stress testing until live/source mortgage rate research is added.",
    category: "mortgage",
  },
];

export function assumptionCategoryLabel(category: AssumptionDefault["category"] | string) {
  return String(category).replaceAll("_", " ");
}
