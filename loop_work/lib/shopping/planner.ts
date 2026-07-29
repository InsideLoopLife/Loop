export type ShoppingNeed = {
  name: string;
  quantity: number;
  unit: "g" | "kg" | "ml" | "l" | "each";
  category?: string | null;
};

export type ProductCandidate = {
  card_id?: string;
  display_name: string;
  retailer?: string | null;
  source_url?: string | null;
  package_quantity: number;
  package_unit: "g" | "kg" | "ml" | "l" | "each";
  price_amount?: number | null;
  price_currency?: string | null;
  confidence?: number;
};

export type PurchasePlan = {
  need_name: string;
  required_quantity: number;
  required_unit: "g" | "ml" | "each";
  candidates: Array<{
    product: ProductCandidate;
    packs: number;
    supplied_quantity: number;
    waste_quantity: number;
    total_price?: number | null;
    unit_price?: number | null;
    reason: string;
  }>;
};

function canonicalName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(raw|fresh|sliced|diced|large|small|medium|skinless|boneless|breast|breasts)\b/g, (m) => {
      if (m === "breast" || m === "breasts") return "breast";
      return "";
    })
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toBase(quantity: number, unit: ShoppingNeed["unit"] | ProductCandidate["package_unit"]) {
  if (unit === "kg") return { quantity: quantity * 1000, unit: "g" as const };
  if (unit === "l") return { quantity: quantity * 1000, unit: "ml" as const };
  if (unit === "g") return { quantity, unit: "g" as const };
  if (unit === "ml") return { quantity, unit: "ml" as const };
  return { quantity, unit: "each" as const };
}

export function aggregateShoppingNeeds(needs: ShoppingNeed[]) {
  const map = new Map<string, { name: string; quantity: number; unit: "g" | "ml" | "each"; category?: string | null }>();

  for (const need of needs) {
    const base = toBase(need.quantity, need.unit);
    const key = `${canonicalName(need.name)}:${base.unit}`;
    const existing = map.get(key);
    if (existing) existing.quantity += base.quantity;
    else map.set(key, { name: need.name, quantity: base.quantity, unit: base.unit, category: need.category });
  }

  return [...map.values()];
}

export function planPurchases(needs: ShoppingNeed[], productCandidates: ProductCandidate[]): PurchasePlan[] {
  const aggregated = aggregateShoppingNeeds(needs);

  return aggregated.map((need) => {
    const needKey = canonicalName(need.name);
    const candidates = productCandidates
      .filter((candidate) => {
        const packageBase = toBase(candidate.package_quantity, candidate.package_unit);
        return packageBase.unit === need.unit && canonicalName(candidate.display_name).includes(needKey.split(" ")[0] || needKey);
      })
      .map((candidate) => {
        const packageBase = toBase(candidate.package_quantity, candidate.package_unit);
        const packs = Math.max(1, Math.ceil(need.quantity / packageBase.quantity));
        const supplied = packs * packageBase.quantity;
        const waste = Math.max(0, supplied - need.quantity);
        const total = candidate.price_amount != null ? Math.round(candidate.price_amount * packs * 100) / 100 : null;
        const unitPrice = candidate.price_amount != null ? candidate.price_amount / packageBase.quantity : null;
        return {
          product: candidate,
          packs,
          supplied_quantity: supplied,
          waste_quantity: waste,
          total_price: total,
          unit_price: unitPrice,
          reason: `${packs} × ${candidate.package_quantity}${candidate.package_unit} gives ${supplied}${need.unit}, leaving ${waste}${need.unit} spare.`,
        };
      })
      .sort((a, b) => {
        const aCost = a.total_price ?? Number.POSITIVE_INFINITY;
        const bCost = b.total_price ?? Number.POSITIVE_INFINITY;
        if (aCost !== bCost) return aCost - bCost;
        return a.waste_quantity - b.waste_quantity;
      })
      .slice(0, 5);

    return {
      need_name: need.name,
      required_quantity: need.quantity,
      required_unit: need.unit,
      candidates,
    };
  });
}
