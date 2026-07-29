import type { IngredientTreeItem } from "./types";

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of input) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractNested(value: string) {
  const square = value.match(/^(.+?)\s*\[([\s\S]+)\]\s*$/);
  if (square) return { parent: square[1].trim(), inner: square[2].trim() };

  const round = value.match(/^(.+?)\s*\(([\s\S]+)\)\s*$/);
  if (round && round[2].includes(",")) return { parent: round[1].trim(), inner: round[2].trim() };

  return null;
}

function percentage(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function quantityText(value: string) {
  const pct = percentage(value);
  if (pct !== null) return `${pct}%`;

  const amount = value.match(/\b(\d+(?:\.\d+)?\s*(?:g|mg|mcg|ml|l|tsp|tbsp|scoop|scoops|medium|large))\b/i);
  return amount?.[1] || null;
}

function cleanName(value: string) {
  return value
    .replace(/\b\d+(?:\.\d+)?\s*%\b/g, "")
    .replace(/^\s*(?:from|and)\s+/i, "")
    .trim();
}

function shouldLinkToProduct(name: string) {
  return /\b(zoe|daily\s*30|nutella|biscoff|gfuel|g fuel|red bull|coca cola|coke|pepsi|lidl|aldi|tesco|sainsbury|mcdonald|greggs)\b/i.test(name);
}

function parsePart(part: string, id: string): IngredientTreeItem {
  const nested = extractNested(part);
  const pct = percentage(part);
  const qty = quantityText(part);

  if (nested) {
    const children = splitTopLevel(nested.inner).map((child, index) => parsePart(child, `${id}.${index + 1}`));
    return {
      id,
      ingredient_name: cleanName(nested.parent),
      quantity_text: qty || (pct !== null ? `${pct}%` : null),
      percentage: pct,
      raw_text: part,
      info_mode: "expand",
      children,
    };
  }

  const name = cleanName(part);
  return {
    id,
    ingredient_name: name,
    quantity_text: qty,
    percentage: pct,
    raw_text: part,
    info_mode: shouldLinkToProduct(name) ? "link_to_product" : "raw_only",
    children: [],
  };
}

export function parseIngredientTextToTree(input: string): IngredientTreeItem[] {
  return splitTopLevel(input).map((part, index) => parsePart(part, `${index + 1}`));
}

export function nestIngredientRows(rows: IngredientTreeItem[]): IngredientTreeItem[] {
  const byId = new Map<string, IngredientTreeItem>();
  const roots: IngredientTreeItem[] = [];

  rows.forEach((row) => byId.set(row.id, { ...row, children: [] }));

  rows.forEach((row) => {
    const item = byId.get(row.id)!;
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)!.children!.push(item);
    } else {
      roots.push(item);
    }
  });

  return roots;
}
