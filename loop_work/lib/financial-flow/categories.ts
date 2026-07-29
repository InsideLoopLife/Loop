export type StandardFinancialCategory = {
  key: string;
  label: string;
  type: "spending" | "saving" | "debt";
  tone: "orange" | "green" | "blue" | "slate";
  aliases: string[];
};

export const STANDARD_FINANCIAL_CATEGORIES: StandardFinancialCategory[] = [
  { key: "house", label: "House", type: "spending", tone: "orange", aliases: ["mortgage", "rent", "home", "property"] },
  { key: "bills", label: "Bills", type: "spending", tone: "orange", aliases: ["bill", "energy", "water", "council", "broadband", "phone", "gas", "electric"] },
  { key: "insurance", label: "Insurance", type: "spending", tone: "orange", aliases: ["insurance", "cover", "policy"] },
  { key: "food", label: "Food shopping", type: "spending", tone: "orange", aliases: ["food", "grocery", "tesco", "aldi", "asda", "sainsbury", "morrisons"] },
  { key: "eating_out", label: "Eating out", type: "spending", tone: "orange", aliases: ["restaurant", "cafe", "coffee", "takeaway", "deliveroo", "uber eats", "just eat"] },
  { key: "transport", label: "Transport", type: "spending", tone: "orange", aliases: ["fuel", "parking", "train", "bus", "uber", "taxi", "toll"] },
  { key: "car", label: "Car & motoring", type: "spending", tone: "orange", aliases: ["car finance", "pcp", "lease", "mot", "servicing", "tyre", "vehicle"] },
  { key: "holidays", label: "Holidays", type: "spending", tone: "orange", aliases: ["holiday", "hotel", "flight", "airbnb", "booking.com"] },
  { key: "childcare", label: "Childcare", type: "spending", tone: "orange", aliases: ["child", "nursery", "school", "wraparound", "club"] },
  { key: "subscriptions", label: "Subscriptions", type: "spending", tone: "orange", aliases: ["subscription", "netflix", "spotify", "prime", "disney", "icloud", "streaming"] },
  { key: "fun", label: "Fun", type: "spending", tone: "orange", aliases: ["postcode lottery", "lottery", "fun", "leisure", "entertainment", "hobby"] },
  { key: "health", label: "Health", type: "spending", tone: "orange", aliases: ["health", "gym", "dental", "doctor", "pharmacy", "medical"] },
  { key: "shopping", label: "Shopping", type: "spending", tone: "orange", aliases: ["amazon", "clothing", "clothes", "retail", "shopping"] },
  { key: "personal_care", label: "Personal care", type: "spending", tone: "orange", aliases: ["hair", "beauty", "barber", "cosmetic"] },
  { key: "pets", label: "Pets", type: "spending", tone: "orange", aliases: ["pet", "vet", "dog", "cat", "pet food"] },
  { key: "gifts", label: "Gifts & giving", type: "spending", tone: "orange", aliases: ["gift", "charity", "donation"] },
  { key: "debt", label: "Debt", type: "debt", tone: "orange", aliases: ["loan", "debt", "credit card", "repayment"] },
  { key: "savings", label: "Savings", type: "saving", tone: "green", aliases: ["saving", "savings", "isa", "cash", "top up", "top-up"] },
  { key: "investments", label: "Investments", type: "saving", tone: "green", aliases: ["investment", "stocks", "shares", "etf", "trading"] },
  { key: "pension", label: "Pension", type: "saving", tone: "green", aliases: ["pension", "retirement"] },
  { key: "other", label: "Other", type: "spending", tone: "slate", aliases: [] },
];

export function standardCategoryForLabel(label?: string | null) {
  const text = String(label || "").toLowerCase();
  return STANDARD_FINANCIAL_CATEGORIES.find((category) => category.aliases.some((alias) => text.includes(alias))) || STANDARD_FINANCIAL_CATEGORIES.find((category) => category.key === "other")!;
}
