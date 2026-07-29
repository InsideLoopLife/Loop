export type ProductImportStatus =
  | "new"
  | "matched_existing"
  | "needs_review"
  | "ready_to_create"
  | "created"
  | "updated"
  | "ai_queued"
  | "ai_enriching"
  | "ai_enriched"
  | "skipped"
  | "failed";

export type ProductImportNormalised = {
  import_key?: string | null;
  card_kind?: "product" | "ingredient" | "recipe" | "takeaway" | null;
  visibility?: "shared_database" | "household_private" | "user_private" | null;
  product_name: string;
  formal_name?: string | null;
  brand?: string | null;
  variant_name?: string | null;
  product_type?: "drink" | "food" | "other" | null;
  category?: string | null;
  category_path?: string | null;
  shop_tag?: string | null;
  retailer_article_number?: string | null;
  dedupe_key?: string | null;
  serving_label?: string | null;
  serving_size?: number | null;
  serving_unit?: string | null;
  serving_ml?: number | null;
  serving_g?: number | null;
  prepared_volume_ml?: number | null;
  package_count?: number | null;
  pack_size?: string | null;
  product_size_text?: string | null;
  barcode?: string | null;
  source_url?: string | null;
  source_host?: string | null;
  image_url?: string | null;
  image_harvest_mode?: string | null;
  image_alt?: string | null;
  ingredients?: string | null;
  ingredients_source_type?: string | null;
  allergens?: string | null;
  may_contain?: string | null;
  inferred_possible_allergens?: string | null;
  allergen_source_type?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fibre_g?: number | null;
  sugar_g?: number | null;
  added_sugar_g?: number | null;
  saturated_fat_g?: number | null;
  salt_g?: number | null;
  sodium_mg?: number | null;
  caffeine_mg?: number | null;
  alcohol_g?: number | null;
  abv_percent?: number | null;
  is_alcohol?: boolean | null;
  nutrition_source_type?: string | null;
  estimate_confidence?: number | null;
  confidence?: number | null;
  score?: number | null;
  is_verified?: boolean | null;
  dietary_flags?: string[];
  price?: number | null;
  price_currency?: string | null;
  price_text?: string | null;
  retailer?: string | null;
  notes?: string | null;
  raw_notes?: string | null;
  consumer_notice?: string | null;
  nutrition_json?: Record<string, unknown> | null;
  source_snapshot?: Record<string, unknown> | null;
  serving_options?: Array<Record<string, unknown>>;
  source_allergens?: Array<Record<string, unknown>>;
};

export type ProductImportPackage = {
  packageKind: "single_csv" | "multi_csv_zip";
  primaryFileName: string;
  parsedFiles: string[];
  cardRows: Array<{
    raw: Record<string, string>;
    support: {
      source_snapshot?: Record<string, string>;
      serving_options?: Record<string, string>[];
      source_allergens?: Record<string, string>[];
      quality_summary?: Record<string, string>[];
      inferred_allergens_review?: Record<string, string>[];
      category_queue?: Record<string, string>[];
      field_mapping?: Record<string, string>[];
    };
  }>;
  warnings: string[];
};

export type ProductEnrichmentResult = ProductImportNormalised & {
  formal_name?: string | null;
  source_host?: string | null;
  confidence: number;
  data_quality_status: "imported" | "estimated" | "needs_review" | "verified" | "conflict";
  dietary_flags: string[];
  contains_allergens: string[];
  may_contain_allergens: string[];
  facts: Array<{
    fact_key: string;
    fact_label: string;
    value_numeric?: number | null;
    value_text?: string | null;
    unit?: string | null;
    source_kind: "import" | "ai_estimate" | "source_url" | "label_image" | "admin" | "user_correction";
    source_url?: string | null;
    confidence: number;
    is_estimated: boolean;
    notes?: string | null;
  }>;
  warnings: string[];
};

export const PRODUCT_IMPORT_COLUMNS = [
  "product_name",
  "brand",
  "product_type",
  "category",
  "serving_size",
  "serving_unit",
  "prepared_volume_ml",
  "pack_size",
  "barcode",
  "source_url",
  "image_url",
  "ingredients",
  "allergens",
  "may_contain",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fibre_g",
  "sugar_g",
  "added_sugar_g",
  "saturated_fat_g",
  "salt_g",
  "sodium_mg",
  "caffeine_mg",
  "price",
  "retailer",
  "notes",
] as const;
