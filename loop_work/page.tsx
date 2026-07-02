export type MoneyDisplayPrecision = "rounded" | "exact";

export function formatMoney(value: number | null | undefined, options?: { precision?: MoneyDisplayPrecision }) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const exact = options?.precision === "exact";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: exact ? 2 : 0,
    maximumFractionDigits: exact ? 2 : 0,
  }).format(safeValue);
}

export function formatMoneyExact(value: number | null | undefined) {
  return formatMoney(value, { precision: "exact" });
}

export function parseNumber(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
