// Shared between the guided setup form and its server action so the two can't
// drift. Bill labels are plain names on purpose: addPlannedItem already maps a
// label to a standard spending category (standardCategoryForLabel), so
// "Council tax" or "Energy" land in the right category with no extra logic.

export const SETUP_BILLS = [
  { key: "housing", label: "Rent or mortgage", hint: "Your monthly payment" },
  { key: "council_tax", label: "Council tax", hint: "Usually paid over 10 or 12 months" },
  { key: "energy", label: "Energy", hint: "Gas and electricity" },
  { key: "water", label: "Water" },
  { key: "broadband", label: "Broadband" },
  { key: "mobile", label: "Mobile phone" },
  { key: "car", label: "Car finance" },
  { key: "car_insurance", label: "Car insurance" },
  { key: "childcare", label: "Childcare" },
  { key: "subscriptions", label: "Subscriptions", hint: "Streaming, gym, apps" },
] as const;

export const SETUP_EXTRAS = [
  { key: "savings", label: "Savings accounts", href: "/accounts", detail: "Track balances, interest and better rates." },
  { key: "pension", label: "A pension", href: "/investments", detail: "See what it could be worth when you retire." },
  { key: "investments", label: "Investments or an ISA", href: "/investments", detail: "Shares, funds and stocks & shares ISAs." },
  { key: "home", label: "A home or mortgage", href: "/mortgage", detail: "Home value, mortgage and when your deal ends." },
] as const;

export const STUDENT_LOAN_PLAN_OPTIONS = [
  { value: "plan_1", label: "Plan 1", detail: "Started uni in England or Wales before Sept 2012, or in Northern Ireland" },
  { value: "plan_2", label: "Plan 2", detail: "Started uni in England or Wales from Sept 2012 to July 2023" },
  { value: "plan_5", label: "Plan 5", detail: "Started uni in England from Aug 2023" },
  { value: "plan_4", label: "Plan 4", detail: "Studied in Scotland" },
  { value: "postgraduate", label: "Postgraduate loan", detail: "Master's or doctoral loan" },
] as const;

export type Employer = "standard" | "nhs" | "public";

export const EMPLOYER_OPTIONS: ReadonlyArray<{ value: Employer; label: string; detail: string }> = [
  { value: "standard", label: "A private company or charity", detail: "Most jobs" },
  { value: "nhs", label: "The NHS", detail: "NHS England or Wales" },
  { value: "public", label: "Other public sector", detail: "Teacher, civil service, council, police, armed forces" },
];
