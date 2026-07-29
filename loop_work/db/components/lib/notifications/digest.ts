import { formatMoney } from "@/lib/format/money";

type MoneyRow = { amount?: number | string | null; net_amount?: number | string | null; monthly_cost?: number | string | null; label?: string | null; provider?: string | null; contract_end?: string | null; notice_days?: number | null };

function numberish(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function buildDigestVariables({
  email,
  payEvents = [],
  plannedItems = [],
  lifestyleBills = [],
  meals = [],
}: {
  email?: string | null;
  payEvents?: MoneyRow[];
  plannedItems?: MoneyRow[];
  lifestyleBills?: MoneyRow[];
  meals?: { label?: string | null; estimated_cost?: number | string | null; calories?: number | string | null; protein_g?: number | string | null }[];
}) {
  const firstName = String(email || "there").split("@")[0].split(/[._-]/)[0] || "there";
  const monthlyIncome = payEvents.reduce((sum, item) => sum + numberish(item.net_amount || item.amount), 0);
  const monthlyOutgoings = plannedItems
    .filter((item) => numberish(item.amount) < 0 || numberish(item.monthly_cost) > 0)
    .reduce((sum, item) => sum + Math.abs(numberish(item.amount || item.monthly_cost)), 0);
  const buffer = monthlyIncome - monthlyOutgoings;
  const renewals = lifestyleBills
    .map((bill) => ({ bill, days: daysUntil(bill.contract_end) }))
    .filter((entry) => entry.days !== null && entry.days <= numberish(entry.bill.notice_days ?? 45) + 30)
    .slice(0, 5);

  const financeNudges = buffer >= 0
    ? `- You are forecast to have ${formatMoney(buffer)} available after tracked outgoings.`
    : `- You are forecast to be ${formatMoney(Math.abs(buffer))} short based on tracked items.`;
  const renewalNudges = renewals.length
    ? renewals.map(({ bill, days }) => `- ${bill.label || bill.provider || "A bill"}: ${days} day(s) until deal/end date.`).join("\n")
    : "- No renewal checks are due soon from your tracked bills.";
  const mealNudges = meals.length
    ? meals.slice(0, 5).map((meal) => `- ${meal.label}: approx ${formatMoney(numberish(meal.estimated_cost))}, ${numberish(meal.calories)} kcal, ${numberish(meal.protein_g)}g protein.`).join("\n")
    : "- Add meals or recipe links to build a weekly shopping and nutrition plan.";

  return {
    first_name: firstName.charAt(0).toUpperCase() + firstName.slice(1),
    period_label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date()),
    monthly_income: formatMoney(monthlyIncome),
    monthly_outgoings: formatMoney(monthlyOutgoings),
    monthly_buffer: formatMoney(buffer),
    finance_nudges: financeNudges,
    renewal_nudges: renewalNudges,
    savings_action: buffer > 0 ? `Consider allocating part of the ${formatMoney(buffer)} forecast buffer to savings or mortgage overpayments.` : "Review discretionary spending and upcoming renewals before committing to new savings.",
    mortgage_note: "Mortgage/equity projection is pulled from the Mortgage page assumptions.",
    meal_nudges: mealNudges,
    shopping_nudges: meals.length ? "- Generate a phone-friendly shopping checklist from the Lifestyle page." : "- Add a few regular meals to create a reusable shopping checklist.",
    health_nudges: "- Keep an eye on protein, fibre, sugar and salt trends as meals are added.",
  };
}

export function renderTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (body, [key, value]) => body.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}

export function markdownToBasicHtml(markdown: string) {
  const escaped = markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return escaped
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("- ")) return `<p>• ${line.slice(2)}</p>`;
      if (!line.trim()) return "<br />";
      return `<p>${line}</p>`;
    })
    .join("\n");
}
