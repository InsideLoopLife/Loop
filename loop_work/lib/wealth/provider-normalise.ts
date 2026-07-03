export function normaliseProviderSlug(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normaliseAccountType(value: string | null | undefined) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("isa")) return raw.includes("stocks") ? "stocks_shares_isa" : "cash_isa";
  if (raw.includes("gia") || raw.includes("general") || raw.includes("invest")) return "gia";
  if (raw.includes("sipp") || raw.includes("pension")) return "sipp";
  if (raw.includes("fixed") || raw.includes("bond")) return "fixed_saver";
  if (raw.includes("regular")) return "regular_saver";
  if (raw.includes("notice")) return "notice_account";
  if (raw.includes("easy")) return "easy_access";
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "savings";
}

export function lenderSlugAliases(value: string | null | undefined) {
  const base = normaliseProviderSlug(value);
  const aliases = new Set([base]);
  const raw = String(value || "").toLowerCase();
  if (raw.includes("nationwide")) aliases.add("nationwide_building_society");
  if (raw.includes("natwest") || raw.includes("national_westminster")) aliases.add("natwest");
  if (raw.includes("halifax")) aliases.add("halifax");
  if (raw.includes("barclays")) aliases.add("barclays");
  if (raw.includes("santander")) aliases.add("santander");
  if (raw.includes("hsbc")) aliases.add("hsbc");
  if (raw.includes("lloyds")) aliases.add("lloyds_bank");
  if (raw.includes("yorkshire")) aliases.add("yorkshire_building_society");
  return Array.from(aliases).filter(Boolean);
}
