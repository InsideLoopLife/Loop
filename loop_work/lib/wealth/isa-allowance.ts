export type IsaWrapper =
  | "cash_isa"
  | "stocks_shares_isa"
  | "innovative_finance_isa"
  | "lifetime_isa"
  | "junior_cash_isa"
  | "junior_stocks_shares_isa"
  | "not_isa";

export type IsaPerson = {
  id?: string | null;
  relationship?: string | null;
  birth_date?: string | null;
};

export type IsaAllowanceRule = {
  taxYear: string;
  startsOn: string;
  endsOn: string;
  adultTotalLimit: number;
  adultCashLimitUnder65: number;
  adultCashLimit65Plus: number;
  lifetimeIsaLimit: number;
  juniorTotalLimit: number;
  sourceUrl: string;
  status: "current" | "historical" | "announced";
};

// Keep policy in one versioned place. No savings or investment screen should
// carry its own £20,000/£9,000 constants.
export const UK_ISA_ALLOWANCE_RULES: readonly IsaAllowanceRule[] = [
  {
    taxYear: "2025/26",
    startsOn: "2025-04-06",
    endsOn: "2026-04-05",
    adultTotalLimit: 20_000,
    adultCashLimitUnder65: 20_000,
    adultCashLimit65Plus: 20_000,
    lifetimeIsaLimit: 4_000,
    juniorTotalLimit: 9_000,
    sourceUrl: "https://www.gov.uk/individual-savings-accounts",
    status: "historical",
  },
  {
    taxYear: "2026/27",
    startsOn: "2026-04-06",
    endsOn: "2027-04-05",
    adultTotalLimit: 20_000,
    adultCashLimitUnder65: 20_000,
    adultCashLimit65Plus: 20_000,
    lifetimeIsaLimit: 4_000,
    juniorTotalLimit: 9_000,
    sourceUrl: "https://www.gov.uk/individual-savings-accounts",
    status: "current",
  },
  {
    taxYear: "2027/28",
    startsOn: "2027-04-06",
    endsOn: "2028-04-05",
    adultTotalLimit: 20_000,
    adultCashLimitUnder65: 12_000,
    adultCashLimit65Plus: 20_000,
    lifetimeIsaLimit: 4_000,
    juniorTotalLimit: 9_000,
    sourceUrl: "https://www.gov.uk/government/publications/fiscal-events-2026-factsheets/isa-reform-2027-anti-circumvention-rules-factsheet",
    status: "announced",
  },
] as const;

function cleanText(value: unknown) {
  return String(value || "").trim().toLowerCase().replaceAll("&", "and");
}

export function ukTaxYear(dateInput: Date | string | number = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getUTCMonth() >= 3 && (date.getUTCMonth() > 3 || date.getUTCDate() >= 6)
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1;
  return `${year}/${String(year + 1).slice(-2)}`;
}

export function isaAllowanceRule(dateOrTaxYear: Date | string | number = new Date()) {
  const label = typeof dateOrTaxYear === "string" && /^\d{4}\/\d{2}$/.test(dateOrTaxYear)
    ? dateOrTaxYear
    : ukTaxYear(dateOrTaxYear);
  return UK_ISA_ALLOWANCE_RULES.find((rule) => rule.taxYear === label)
    || UK_ISA_ALLOWANCE_RULES.at(-1)!;
}

export function ageOn(person: IsaPerson | null | undefined, dateInput: Date | string | number = new Date()) {
  if (!person?.birth_date) return null;
  const birth = new Date(`${person.birth_date.slice(0, 10)}T00:00:00Z`);
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(date.getTime())) return null;
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = date.getUTCMonth() < birth.getUTCMonth()
    || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function classifyIsaWrapper(...values: unknown[]): IsaWrapper {
  const text = cleanText(values.filter(Boolean).join(" "));
  if (!text.includes("isa")) return "not_isa";
  const junior = /\b(junior|jisa|child|children|under[ -]?18)\b/.test(text);
  if (junior && /(stock|share|invest)/.test(text)) return "junior_stocks_shares_isa";
  if (junior) return "junior_cash_isa";
  if (/\b(lifetime|lisa)\b/.test(text)) return "lifetime_isa";
  if (/(stock|share|invest)/.test(text)) return "stocks_shares_isa";
  if (/innovative|ifisa/.test(text)) return "innovative_finance_isa";
  return "cash_isa";
}

export function isJuniorIsaWrapper(wrapper: IsaWrapper) {
  return wrapper === "junior_cash_isa" || wrapper === "junior_stocks_shares_isa";
}

export function isaPersonEligibility(
  person: IsaPerson | null | undefined,
  wrapper: IsaWrapper,
  dateInput: Date | string | number = new Date(),
) {
  if (wrapper === "not_isa") return { eligible: true, reason: "Not an ISA product", age: ageOn(person, dateInput) };
  const age = ageOn(person, dateInput);
  const childRelationship = cleanText(person?.relationship) === "child";
  const isChild = age != null ? age < 18 : childRelationship;
  if (isJuniorIsaWrapper(wrapper)) {
    return { eligible: isChild, reason: isChild ? "Junior ISA age requirement met" : "Junior ISAs are for people under 18", age };
  }
  if (isChild) return { eligible: false, reason: "Adult ISAs require the account owner to be at least 18", age };
  if (wrapper === "lifetime_isa" && age != null && (age < 18 || age >= 40)) {
    return { eligible: false, reason: "A Lifetime ISA must be opened from age 18 to 39", age };
  }
  return { eligible: true, reason: "Adult ISA age requirement met", age };
}

export function isaAllowanceLimitForPerson(
  person: IsaPerson | null | undefined,
  wrapper: IsaWrapper,
  dateOrTaxYear: Date | string | number = new Date(),
) {
  const rule = isaAllowanceRule(dateOrTaxYear);
  const age = ageOn(person, rule.endsOn);
  if (isJuniorIsaWrapper(wrapper)) return rule.juniorTotalLimit;
  if (wrapper === "lifetime_isa") return rule.lifetimeIsaLimit;
  if (wrapper === "cash_isa") return age != null && age >= 65 ? rule.adultCashLimit65Plus : rule.adultCashLimitUnder65;
  return rule.adultTotalLimit;
}

