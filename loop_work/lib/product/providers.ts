export type ProviderKey =
  | "admin_verified"
  | "manual_import"
  | "open_food_facts"
  | "gs1_digital_link"
  | "gs1_verified_by_gs1"
  | "affiliate_feed"
  | "retailer_source_url"
  | "ai_estimate";

export type ProductCandidate = {
  card_id?: string;
  display_name: string;
  formal_name?: string | null;
  brand_name?: string | null;
  retailer_name?: string | null;
  product_type?: string | null;
  card_kind?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  gtin14?: string | null;
  source_provider?: ProviderKey | string | null;
  source_priority?: number | null;
  main_image_url?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fibre_g?: number | null;
  sugar_g?: number | null;
  salt_g?: number | null;
  caffeine_mg?: number | null;
  confidence?: number | null;
  match_score: number;
  match_reason: string;
};

export function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function isValidGtin(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  let sum = 0;
  let posFromRight = 1;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    const digit = Number(body[i]);
    sum += posFromRight % 2 === 1 ? digit * 3 : digit;
    posFromRight += 1;
  }
  const calculated = (10 - (sum % 10)) % 10;
  return calculated === check;
}

export function gtinTo14(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!isValidGtin(digits)) return null;
  return digits.padStart(14, "0");
}

export function shouldAllowAiEstimate(candidates: ProductCandidate[], minimumScore = 72) {
  return !candidates.some((candidate) => Number(candidate.match_score || 0) >= minimumScore);
}
