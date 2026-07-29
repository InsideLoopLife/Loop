export type CardKind = "product" | "ingredient" | "recipe" | "takeaway";
export type ProductType = "drink" | "food" | "other";
export type Visibility = "shared_database" | "household_private" | "user_private";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "drink" | "meal";
export type ServingMode = "each_person" | "split_shared";
export type AllergenPresence = "contains" | "may_contain" | "not_present" | "unknown";

export type PersonOption = {
  id: string;
  name: string;
  relationship?: string | null;
  avatar_url?: string | null;
  initials?: string | null;
  is_self?: boolean;
  user_id?: string | null;
};

export type NutritionCard = {
  id: string;
  card_kind: CardKind;
  visibility?: Visibility;
  product_type: ProductType;
  display_name: string;
  formal_name?: string | null;
  brand_name?: string | null;
  variant_name?: string | null;
  source_url?: string | null;
  source_host?: string | null;
  main_image_url?: string | null;
  serving_label?: string | null;
  serving_ml?: number | null;
  serving_g?: number | null;
  prepared_volume_ml?: number | null;
  package_count?: number | null;
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
  nutrition?: Record<string, unknown>;
  dietary_flags?: string[];
  confidence?: number | null;
  score?: number | null;
};

export type ServingOption = {
  id: string;
  card_id?: string | null;
  canonical_name: string;
  serving_label: string;
  serving_ml?: number | null;
  serving_g?: number | null;
  prepared_volume_ml?: number | null;
  package_count?: number | null;
  is_default?: boolean;
  confidence?: number | null;
  requires_user_confirmation?: boolean;
  display_name?: string;
};

export type IngredientTreeItem = {
  id: string;
  card_id?: string;
  parent_id?: string | null;
  section_label?: string;
  ingredient_name: string;
  quantity_text?: string | null;
  percentage?: number | null;
  raw_text?: string | null;
  info_mode?: "raw_only" | "expand" | "link_to_product";
  linked_card_id?: string | null;
  linked_card?: NutritionCard | null;
  children?: IngredientTreeItem[];
};

export type AllergenFact = {
  id?: string;
  card_id?: string;
  allergen_key: string;
  allergen_label: string;
  presence: AllergenPresence;
  evidence_text?: string | null;
  source_url?: string | null;
  confidence?: number | null;
};

export type FoodLogEntry = {
  id: string;
  household_id?: string | null;
  card_id?: string | null;
  display_name: string;
  log_date: string;
  time_eaten?: string | null;
  meal_slot: MealSlot;
  serving_multiplier?: number | null;
  serving_mode?: ServingMode | null;
  drink_volume_ml?: number | null;
  nutrition_snapshot?: Record<string, unknown>;
  notes?: string | null;
  image_url?: string | null;
  people?: PersonOption[];
};

export type NutritionClientInitialData = {
  householdId?: string | null;
  currentUserPersonId?: string | null;
  people?: PersonOption[];
  cards?: NutritionCard[];
  logs?: FoodLogEntry[];
  selectedDate?: string;
};
