
import type { ProductLookupCandidate } from "@/lib/nutrition/product-data";

export type LoopFoodEntityType = "recipe" | "meal" | "product" | "drink_product" | "ingredient" | "menu";

export function compactFoodWhitespace(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isProductLikeKind(value: unknown) {
  const kind = String(value || "").toLowerCase();
  return ["product", "drink_product", "ingredient"].includes(kind)
    || /product|barcode|open_food_facts|retailer|manufacturer|global_cache|household_cache|manual_label|label_photo|ingredient_url_import|product_search|ai_research/.test(kind);
}

export function inferFoodEntityType({ label, source, cardKind, ingredients }: { label?: unknown; source?: unknown; cardKind?: unknown; ingredients?: unknown }): LoopFoodEntityType {
  const kind = String(cardKind || "").toLowerCase();
  if (kind === "product" || kind === "drink_product" || kind === "ingredient" || kind === "menu" || kind === "recipe") return kind as LoopFoodEntityType;
  const text = `${label || ""} ${source || ""} ${ingredients || ""}`.toLowerCase();
  if (/restaurant|menu|takeaway|deliveroo|ubereats|just.?eat/.test(text)) return "menu";
  if (/gfuel|g fuel|sneak|x.?gamer|gamer supps|energy formula|powdered drink|supplement facts|scoop|caffeine anhydrous/.test(text)) return "drink_product";
  if (/barcode|open.?food.?facts|nutrition label|supplement facts|manufacturer|retailer|product page|packaged/.test(text)) return "product";
  if (/^\s*(\d+(\.\d+)?\s?(g|kg|ml|l)\s+)?[a-z][a-z\s-]{2,40}\s*$/i.test(String(label || "")) && !/,|with|and|on\b/i.test(String(label || ""))) return "ingredient";
  return "recipe";
}

export function cleanProductOrMealLabel(input: unknown) {
  let text = compactFoodWhitespace(input);
  if (!text) return "Food entry";

  if (/^https?:\/\//i.test(text) || text.includes("/products/")) {
    try {
      const url = new URL(text.startsWith("http") ? text : `https://${text}`);
      const slug = url.pathname.split("/").filter(Boolean).pop() || "";
      text = slug.replace(/[-_]+/g, " ").replace(/\b(uk|gb|ss|pos|gid|ss-r|r)\b/gi, " ");
    } catch {
      text = text.split("/").filter(Boolean).pop() || text;
    }
  }

  text = text
    .replace(/^i(?:'|’)?ve\s+(?:had|eaten|drunk|logged)\s+/i, "")
    .replace(/^i\s+(?:had|ate|drank|logged)\s+/i, "")
    .replace(/^please\s+log\s+/i, "")
    .replace(/^log\s+(?:me\s+)?/i, "")
    .replace(/^a\s+|^an\s+/i, "")
    .replace(/\b(?:at|around|about)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/ig, "")
    .replace(/\b(?:this\s+morning|this\s+afternoon|this\s+evening|today)\b/ig, "")
    .replace(/\b\d+(?:\.\d+)?\s?(?:ml|millilitres?|l|litres?)\s+(?:drink\s+)?(?:of\s+)?/ig, "")
    .replace(/^drink\s+of\s+/i, "")
    .replace(/^scoop\s+of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(/\bg\s*fuel\b/ig, "GFuel").replace(/\bgfuel\b/ig, "GFuel");
  text = text.replace(/\bhype sauce\s*(?:2(?:\.0)?)?\b/i, "Hype Sauce 2.0");
  text = text.replace(/\bblue ice\b/i, "Blue Ice");
  return text.slice(0, 180) || "Food entry";
}

export function extractVolumeMl(text: unknown) {
  const value = compactFoodWhitespace(text).toLowerCase();
  const ml = value.match(/(\d+(?:\.\d+)?)\s?(?:ml|millilitres?)/i);
  if (ml) return Math.round(Number(ml[1]));
  const litres = value.match(/(\d+(?:\.\d+)?)\s?(?:l|litres?)\b/i);
  if (litres) return Math.round(Number(litres[1]) * 1000);
  const flOz = value.match(/(\d+(?:\.\d+)?)\s?(?:fl\.?\s?oz|fluid ounces?)/i);
  if (flOz) return Math.round(Number(flOz[1]) * 29.5735);
  if (/\bgfuel|g fuel|powdered drink|energy formula/.test(value)) return 500;
  if (/\blatte|flat white|cappuccino\b/.test(value)) return 300;
  if (/\bcoffee|espresso\b/.test(value)) return 250;
  if (/\bcan\b/.test(value)) return 330;
  if (/\bbottle\b/.test(value)) return 500;
  return 0;
}

export function extractTimeHHMM(text: unknown) {
  const value = compactFoodWhitespace(text).toLowerCase();
  const match = value.match(/(?:\bat\b|\baround\b|\babout\b)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3];
  if (hour > 23 || minute > 59) return "";
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 5 && /evening|tonight|dinner|pm/.test(value)) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function displayProductCandidateLabel(candidate: ProductLookupCandidate | null | undefined) {
  if (!candidate) return "Food entry";
  const label = cleanProductOrMealLabel(candidate.label);
  const brand = compactFoodWhitespace(candidate.brand_name || "");
  if (!brand || label.toLowerCase().includes(brand.toLowerCase())) return label;
  return `${brand} ${label}`.replace(/\s+/g, " ").trim();
}

export function nutritionUpdateStatus(meal: any) {
  const json = meal?.nutrition_json && typeof meal.nutrition_json === "object" ? meal.nutrition_json : {};
  const status = String(json.product_update_status || json.correction_status || "").trim();
  return status || null;
}

export function productUpdateStatusLabel(status: unknown) {
  const value = String(status || "").toLowerCase();
  if (!value) return "No product correction queued";
  if (value === "queued") return "Queued — waiting to be reviewed";
  if (value === "reading_label") return "Reading label/source";
  if (value === "ai_review") return "AI is checking the nutrition record";
  if (value === "updated") return "Updated — product data has been corrected";
  if (value === "failed") return "Could not update automatically";
  return value.replace(/_/g, " ");
}
