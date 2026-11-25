"use server";

import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext, householdMemberDataOrFilter, visibleDataOrFilter } from "@/lib/auth/household-context";

/** Money in easy-access and fixed savings (not pensions or investments) — what an emergency fund draws on. */
async function loadHouseholdSavings__read() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const [{ data }, { data: pets }, { data: items }, { data: categories }] = await Promise.all([
    supabase.from("financial_accounts").select("account_type, current_balance, is_liability").or(filter),
    supabase.from("household_pets").select("name").or(householdMemberDataOrFilter(household)),
    supabase.from("planned_items").select("label, amount, recurrence, start_date, end_date, category_id, item_type, person_id").eq("direction", "outgoing").or(filter),
    supabase.from("spending_categories").select("id, name").or(filter),
  ]);
  // Each bill's spending category, by its name, so household costs can group the same way Spending does.
  const names = new Map(((categories || []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const categoryByLabel: Record<string, string> = {};
  // Monthly bills starting in the next two months (e.g. a new energy deal) — an emergency fund should cover them too.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 61 * 86_400_000).toISOString().slice(0, 10);
  const startingSoon = ((items || []) as any[])
    .filter((item) => item.recurrence === "monthly" && item.start_date > today && item.start_date <= soon && (!item.end_date || item.end_date > item.start_date))
    .map((item) => ({ label: String(item.label), value: Number(item.amount || 0), startDate: String(item.start_date), categoryLabel: item.category_id ? names.get(item.category_id) || null : null }));
  for (const item of (items || []) as { label: string; category_id: string | null; item_type: string | null }[]) {
    const name = item.category_id ? names.get(item.category_id) : null;
    const key = String(item.label || "").trim().toLowerCase();
    if (key && (name || item.item_type === "saving_investment")) categoryByLabel[key] = name || "Savings";
  }
  const savings = ((data || []) as { account_type: string; current_balance: number | null; is_liability: boolean | null }[])
    .filter((a) => !a.is_liability && ["savings", "cash_isa", "fixed_saver", "regular_saver"].includes(String(a.account_type)))
    .reduce((sum, a) => sum + Math.abs(Number(a.current_balance || 0)), 0);
  return { savings: Math.round(savings * 100) / 100, categoryByLabel, startingSoon, petNames: ((pets || []) as { name: string | null }[]).map((p) => String(p.name || "")).filter(Boolean) };
}

export async function loadHouseholdSavings() { return runFriendly(() => loadHouseholdSavings__read()); }
