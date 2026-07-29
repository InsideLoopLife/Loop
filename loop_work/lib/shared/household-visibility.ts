export type ShareableRecordType =
  | "income"
  | "spending"
  | "planned_item"
  | "savings_account"
  | "investment_account"
  | "investment_holding"
  | "pension_account"
  | "health_summary";

export function canRecordBeShared(recordType: string) {
  return ["income", "spending", "planned_item", "savings_account", "investment_account", "investment_holding", "pension_account", "health_summary"].includes(recordType);
}

export function recordHiddenKey(recordType: string, recordId: string) {
  return `${recordType}:${recordId}`;
}
