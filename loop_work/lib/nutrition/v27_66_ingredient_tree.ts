export type IngredientTreeItem = {
  id: string;
  name: string;
  quantityText?: string | null;
  percentage?: number | null;
  rawText: string;
  children: IngredientTreeItem[];
  infoMode: "expand" | "link_to_product" | "raw_only";
};

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

function cleanName(value: string) {
  return value
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(/^\s*and\s+/i, "")
    .trim();
}

function extractPercentage(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function extractNested(value: string) {
  const bracket = value.match(/([^\[(]+)[\[(]([^\])]+)[\])]/);
  if (!bracket) return null;
  return {
    parent: bracket[1].trim(),
    inner: bracket[2].trim(),
  };
}

/**
 * Converts a product ingredient declaration into expandable rows.
 *
 * Example:
 * "lemon flavour topping (14%) [sugar, vegetable fats (palm kernel, palm, shea)]"
 * becomes a parent "lemon flavour topping" with nested children.
 *
 * Info button logic:
 * - raw ingredients with nested make-up use infoMode="expand"
 * - branded/reusable products can be marked later as link_to_product
 * - raw one-line ingredients stay raw_only or expand when they have children
 */
export function parseIngredientDeclarationToTree(input: string): IngredientTreeItem[] {
  const top = splitTopLevel(input);
  return top.map((part, index) => parseIngredientPart(part, `${index + 1}`));
}

function parseIngredientPart(part: string, id: string): IngredientTreeItem {
  const nested = extractNested(part);
  const percentage = extractPercentage(part);

  if (nested) {
    const children = splitTopLevel(nested.inner).map((child, childIndex) =>
      parseIngredientPart(child, `${id}.${childIndex + 1}`)
    );

    return {
      id,
      name: cleanName(nested.parent.replace(/\d+(?:\.\d+)?\s*%/g, "")),
      quantityText: percentage ? `${percentage}%` : null,
      percentage,
      rawText: part,
      children,
      infoMode: "expand",
    };
  }

  const name = cleanName(part.replace(/\d+(?:\.\d+)?\s*%/g, ""));
  return {
    id,
    name,
    quantityText: percentage ? `${percentage}%` : null,
    percentage,
    rawText: part,
    children: [],
    infoMode: "raw_only",
  };
}

export function flattenIngredientTreeForInsert(tree: IngredientTreeItem[]) {
  const rows: Array<{
    clientId: string;
    parentClientId: string | null;
    sortOrder: number;
    ingredientName: string;
    quantityText: string | null;
    percentage: number | null;
    rawText: string;
    hasChildren: boolean;
    infoMode: IngredientTreeItem["infoMode"];
  }> = [];

  function visit(item: IngredientTreeItem, parentClientId: string | null, index: number) {
    rows.push({
      clientId: item.id,
      parentClientId,
      sortOrder: index,
      ingredientName: item.name,
      quantityText: item.quantityText || null,
      percentage: item.percentage || null,
      rawText: item.rawText,
      hasChildren: item.children.length > 0,
      infoMode: item.infoMode,
    });

    item.children.forEach((child, childIndex) => visit(child, item.id, childIndex));
  }

  tree.forEach((item, index) => visit(item, null, index));
  return rows;
}
