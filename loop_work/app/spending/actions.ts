"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import { standardCategoryForLabel } from "@/lib/financial-flow/categories";

function emptyToNull(value: FormDataEntryValue | null) {
  const stringValue = String(value || "").trim();
  return stringValue || null;
}

function parseInteger(value: FormDataEntryValue | null) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function normaliseEndBehavior(value: FormDataEntryValue | null) {
  const stringValue = String(value || "drops_off");
  return stringValue === "renews" || stringValue === "review_needed" || stringValue === "drops_off" ? stringValue : "drops_off";
}

function normaliseCategoryIcon(value: FormDataEntryValue | null) {
  const icon = String(value || "").trim().slice(0, 12);
  return icon || "🏷️";
}

async function resolvedCategoryId(supabase: any, householdContext: any, explicit: FormDataEntryValue | null, label: string, itemType?: string | null) {
  const selected = emptyToNull(explicit);
  if (selected) return selected;
  const suggestion = standardCategoryForLabel(`${label} ${String(itemType || "").replaceAll("_", " ")}`);
  if (suggestion.key === "other") return null;
  const { data } = await supabase.from("spending_categories")
    .select("id")
    .or(householdMemberDataOrFilter(householdContext))
    .or(`standard_category_key.eq.${suggestion.key},name.ilike.${suggestion.label}`)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

function revalidateSpendingViews(personId?: string | null) {
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
  revalidatePath("/account");
  revalidatePath("/dashboard");
  if (personId) revalidatePath(`/household/${personId}`);
}

const COMMON_BRAND_DOMAINS: { match: RegExp; brandName: string; domain: string }[] = [
  { match: /spotify/i, brandName: "Spotify", domain: "spotify.com" },
  { match: /netflix/i, brandName: "Netflix", domain: "netflix.com" },
  { match: /apple|icloud/i, brandName: "Apple", domain: "apple.com" },
  { match: /barclays/i, brandName: "Barclays", domain: "barclays.co.uk" },
  { match: /ecologi/i, brandName: "Ecologi", domain: "ecologi.com" },
  { match: /omaze/i, brandName: "Omaze", domain: "omaze.co.uk" },
  { match: /postcode lottery|people.?s postcode/i, brandName: "People's Postcode Lottery", domain: "postcodelottery.co.uk" },
  { match: /volkswagen|\bvw\b/i, brandName: "Volkswagen", domain: "volkswagen.co.uk" },
  { match: /plum/i, brandName: "Plum", domain: "withplum.com" },
  { match: /cottontails/i, brandName: "Cottontails", domain: "cottontailsdaynursery.co.uk" },
];

function normaliseDomain(value: string | null | undefined) {
  const clean = String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "")
    .trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean) ? clean : null;
}

function logoUrlForDomain(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function guessBrandFromLabel(label: string) {
  const hit = COMMON_BRAND_DOMAINS.find((entry) => entry.match.test(label));
  if (!hit) return null;
  return { brandName: hit.brandName, domain: hit.domain, logoUrl: logoUrlForDomain(hit.domain), source: "known_brand" };
}

async function inferBrandWithOpenAi(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, label: string) {
  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `Find the official consumer-facing brand/domain for this household bill or subscription label: "${label}". Return JSON only, no markdown, with keys brandName, domain and confidence. The domain must be the official website host only, no protocol, no path. If uncertain, return confidence below 0.6.`,
        }],
      }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const text = String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((content) => content.text) || []).join("\n") || "");
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || "";
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as { brandName?: string; domain?: string; confidence?: number };
    const domain = normaliseDomain(parsed.domain);
    const confidence = Number(parsed.confidence ?? 0);
    if (!domain || confidence < 0.55) return null;
    return {
      brandName: String(parsed.brandName || label).slice(0, 80),
      domain,
      logoUrl: logoUrlForDomain(domain),
      source: "openai_web_search",
    };
  } catch {
    return null;
  }
}

async function resolveBillBrand(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, label: string) {
  return guessBrandFromLabel(label) || await inferBrandWithOpenAi(supabase, userId, label);
}

function brandColumns(brand: Awaited<ReturnType<typeof resolveBillBrand>> | null) {
  if (!brand) {
    return {
      brand_name: null,
      brand_domain: null,
      brand_logo_url: null,
      brand_logo_source: "not_found",
      brand_logo_checked_at: new Date().toISOString(),
    };
  }

  return {
    brand_name: brand.brandName,
    brand_domain: brand.domain,
    brand_logo_url: brand.logoUrl,
    brand_logo_source: brand.source,
    brand_logo_checked_at: new Date().toISOString(),
  };
}

export async function addSpendingCategory(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    name: String(formData.get("name") || "Category"),
    monthly_budget: parseNumber(formData.get("monthly_budget")),
    type: String(formData.get("type") || "variable"),
    category_icon: normaliseCategoryIcon(formData.get("category_icon")),
    group_id: emptyToNull(formData.get("group_id")),
  };

  const { error } = await supabase.from("spending_categories").insert(payload);
  if (error) throw new Error(error.message);

  revalidateSpendingViews();
}

export async function addSpendingEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const personId = emptyToNull(formData.get("person_id"));
  const label = String(formData.get("label") || "Spend");
  const categoryId = await resolvedCategoryId(supabase, householdContext, formData.get("category_id"), label, "one_off");

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    category_id: categoryId,
    label,
    payment_account_id: emptyToNull(formData.get("payment_account_id")),
    pet_id: emptyToNull(formData.get("pet_id")),
    amount: parseNumber(formData.get("amount")) ?? 0,
    spent_at: String(formData.get("spent_at") || new Date().toISOString().slice(0, 10)),
    notes: String(formData.get("notes") || ""),
  };

  const { error } = await supabase.from("spending_entries").insert(payload);
  if (error) throw new Error(error.message);

  revalidateSpendingViews(personId);
}

export async function addPlannedItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const personId = emptyToNull(formData.get("person_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const recurrenceValue = String(formData.get("recurrence") || "monthly");
  const recurrence = ["monthly", "four_weekly", "custom_interval", "one_off"].includes(recurrenceValue) ? recurrenceValue : "monthly";
  const recurrenceIntervalDays = recurrence === "custom_interval" ? Math.max(1, parseInteger(formData.get("recurrence_interval_days")) ?? 7) : null;

  const direction = String(formData.get("direction") || "outgoing");
  const label = String(formData.get("label") || "Planned item");
  const itemType = String(formData.get("item_type") || (recurrence !== "one_off" ? "monthly_cost" : "one_off"));
  const categoryId = await resolvedCategoryId(supabase, householdContext, formData.get("category_id"), label, itemType);
  const brand = direction === "outgoing" ? await resolveBillBrand(supabase, user.id, label) : null;

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    category_id: categoryId,
    direction,
    item_type: itemType,
    payment_account_id: emptyToNull(formData.get("payment_account_id")),
    pet_id: emptyToNull(formData.get("pet_id")),
    label,
    amount: parseNumber(formData.get("amount")) ?? 0,
    recurrence,
    recurrence_interval_days: recurrenceIntervalDays,
    start_date: startDate,
    end_date: recurrence !== "one_off" ? emptyToNull(formData.get("end_date")) : null,
    end_behavior: recurrence !== "one_off" ? normaliseEndBehavior(formData.get("end_behavior")) : "drops_off",
    renewal_notice_days: recurrence !== "one_off" ? parseInteger(formData.get("renewal_notice_days")) ?? 30 : 30,
    early_upgrade_date: recurrence !== "one_off" ? emptyToNull(formData.get("early_upgrade_date")) : null,
    expected_refund_amount: recurrence !== "one_off" ? parseNumber(formData.get("expected_refund_amount")) ?? 0 : 0,
    day_of_month: recurrence === "monthly" ? parseInteger(formData.get("day_of_month")) ?? Number(startDate.slice(8, 10)) : null,
    payment_timing: recurrence !== "one_off" ? String(formData.get("payment_timing") || "fixed_day") : null,
    payment_adjustment: recurrence !== "one_off" ? String(formData.get("payment_adjustment") || "previous_workday") : null,
    ...(direction === "outgoing" ? brandColumns(brand) : { brand_name: null, brand_domain: null, brand_logo_url: null, brand_logo_source: null, brand_logo_checked_at: null }),
    notes: String(formData.get("notes") || ""),
  };

  const { error } = await supabase.from("planned_items").insert(payload as any);
  if (error) throw new Error(error.message);

  revalidateSpendingViews(personId);
}

export async function updatePlannedItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const personId = emptyToNull(formData.get("person_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const recurrenceValue = String(formData.get("recurrence") || "monthly");
  const recurrence = ["monthly", "four_weekly", "custom_interval", "one_off"].includes(recurrenceValue) ? recurrenceValue : "monthly";
  const recurrenceIntervalDays = recurrence === "custom_interval" ? Math.max(1, parseInteger(formData.get("recurrence_interval_days")) ?? 7) : null;

  const direction = String(formData.get("direction") || "outgoing");
  const label = String(formData.get("label") || "Planned item");
  const itemType = String(formData.get("item_type") || (recurrence !== "one_off" ? "monthly_cost" : "one_off"));
  const categoryId = await resolvedCategoryId(supabase, householdContext, formData.get("category_id"), label, itemType);
  const brand = direction === "outgoing" ? await resolveBillBrand(supabase, user.id, label) : null;

  const payload = {
    person_id: personId,
    category_id: categoryId,
    direction,
    item_type: itemType,
    payment_account_id: emptyToNull(formData.get("payment_account_id")),
    pet_id: emptyToNull(formData.get("pet_id")),
    label,
    amount: parseNumber(formData.get("amount")) ?? 0,
    recurrence,
    recurrence_interval_days: recurrenceIntervalDays,
    start_date: startDate,
    end_date: recurrence !== "one_off" ? emptyToNull(formData.get("end_date")) : null,
    end_behavior: recurrence !== "one_off" ? normaliseEndBehavior(formData.get("end_behavior")) : "drops_off",
    renewal_notice_days: recurrence !== "one_off" ? parseInteger(formData.get("renewal_notice_days")) ?? 30 : 30,
    early_upgrade_date: recurrence !== "one_off" ? emptyToNull(formData.get("early_upgrade_date")) : null,
    expected_refund_amount: recurrence !== "one_off" ? parseNumber(formData.get("expected_refund_amount")) ?? 0 : 0,
    day_of_month: recurrence === "monthly" ? parseInteger(formData.get("day_of_month")) ?? Number(startDate.slice(8, 10)) : null,
    payment_timing: recurrence !== "one_off" ? String(formData.get("payment_timing") || "fixed_day") : null,
    payment_adjustment: recurrence !== "one_off" ? String(formData.get("payment_adjustment") || "previous_workday") : null,
    ...(direction === "outgoing" ? brandColumns(brand) : { brand_name: null, brand_domain: null, brand_logo_url: null, brand_logo_source: null, brand_logo_checked_at: null }),
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  };

  const { error } = await applyMutableRecordFilter(
    supabase.from("planned_items").update(payload as any),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);

  revalidateSpendingViews(personId);
}

export async function updateFinancialFlowLineCategories(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);

  const categoryId = emptyToNull(formData.get("category_id"));
  const lineIds = formData.getAll("line_id").map((value) => String(value));
  const plannedIds = lineIds.filter((id) => id.startsWith("planned:")).map((id) => id.replace("planned:", "")).filter(Boolean);
  const entryIds = lineIds.filter((id) => id.startsWith("entry:")).map((id) => id.replace("entry:", "")).filter(Boolean);
  const childCostIds = lineIds.filter((id) => id.startsWith("child:")).map((id) => id.replace("child:", "")).filter(Boolean);

  if (plannedIds.length === 0 && entryIds.length === 0 && childCostIds.length === 0) return;

  if (plannedIds.length > 0) {
    const { error } = await supabase
      .from("planned_items")
      .update({ category_id: categoryId, updated_at: new Date().toISOString() } as any)
      .in("id", plannedIds)
      .or(householdVisibleFilter);
    if (error) throw new Error(error.message);
  }

  if (entryIds.length > 0) {
    const { error } = await supabase
      .from("spending_entries")
      .update({ category_id: categoryId } as any)
      .in("id", entryIds)
      .or(householdVisibleFilter);
    if (error) throw new Error(error.message);
  }

  if (childCostIds.length > 0) {
    const { error } = await supabase
      .from("child_costs")
      .update({ category_id: categoryId } as any)
      .in("id", childCostIds)
      .or(householdVisibleFilter);
    if (error) throw new Error(error.message);
  }

  revalidateSpendingViews();
}

export async function upsertStudentLoanAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = emptyToNull(formData.get("id"));
  const personId = emptyToNull(formData.get("person_id"));
  const planValue = String(formData.get("plan") || "plan_1");
  const plan = ["plan_1", "plan_2", "plan_4", "plan_5", "postgraduate"].includes(planValue) ? planValue : "plan_1";
  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    plan,
    current_balance: parseNumber(formData.get("current_balance")) ?? 0,
    balance_date: String(formData.get("balance_date") || new Date().toISOString().slice(0, 10)),
    interest_rate: parseNumber(formData.get("interest_rate")),
    payroll_monthly_override: parseNumber(formData.get("payroll_monthly_override")),
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  };

  let response;
  if (id) {
    response = await applyMutableRecordFilter(supabase.from("student_loan_accounts").update(payload as any), id, householdContext);
  } else {
    let existingQuery = supabase
      .from("student_loan_accounts")
      .select("id")
      .or(householdMemberDataOrFilter(householdContext))
      .eq("plan", plan)
      .limit(1);
    existingQuery = personId ? existingQuery.eq("person_id", personId) : existingQuery.is("person_id", null);
    const { data: existingRows, error: lookupError } = await existingQuery;
    if (lookupError) throw new Error(lookupError.message);
    const existingId = existingRows?.[0]?.id;
    response = existingId
      ? await applyMutableRecordFilter(supabase.from("student_loan_accounts").update(payload as any), existingId, householdContext)
      : await supabase.from("student_loan_accounts").insert(payload as any);
  }

  if (response.error) throw new Error(response.error.message);

  revalidateSpendingViews(personId);
}

export async function deletePlannedItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(
    supabase.from("planned_items").delete(),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);

  revalidateSpendingViews();
}

export async function deleteSpendingCategory(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(
    supabase.from("spending_categories").delete(),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);

  revalidateSpendingViews();
}

export async function addCategoryGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    name: String(formData.get("name") || "Group"),
    icon: emptyToNull(formData.get("icon")),
  };

  const { error } = await supabase.from("spending_category_groups").insert(payload);
  if (error) throw new Error(error.message);

  revalidateSpendingViews();
  revalidatePath("/spending/categories");
}

export async function renameCategoryGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));

  const { error } = await applyMutableRecordFilter(
    supabase.from("spending_category_groups").update({
      name: String(formData.get("name") || "Group"),
      icon: emptyToNull(formData.get("icon")),
      updated_at: new Date().toISOString(),
    } as any),
    id,
    householdContext,
  );
  if (error) throw new Error(error.message);

  revalidateSpendingViews();
  revalidatePath("/spending/categories");
}

export async function deleteCategoryGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));

  // Categories in this group aren't deleted, just ungrouped, so their bills are never orphaned.
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const { error: ungroupError } = await supabase
    .from("spending_categories")
    .update({ group_id: null } as any)
    .eq("group_id", id)
    .or(householdVisibleFilter);
  if (ungroupError) throw new Error(ungroupError.message);

  const { error } = await applyMutableRecordFilter(
    supabase.from("spending_category_groups").delete(),
    id,
    householdContext,
  );
  if (error) throw new Error(error.message);

  revalidateSpendingViews();
  revalidatePath("/spending/categories");
}

// Used by the "Manage categories and groups" drag-and-drop board: dropping a category
// card onto a group box assigns it to that group; dropping onto "Ungrouped" clears it.
export async function assignCategoryGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const categoryId = String(formData.get("category_id"));
  const groupId = emptyToNull(formData.get("group_id"));

  const { error } = await supabase
    .from("spending_categories")
    .update({ group_id: groupId } as any)
    .eq("id", categoryId)
    .or(householdVisibleFilter);
  if (error) throw new Error(error.message);

  revalidateSpendingViews();
  revalidatePath("/spending/categories");
}

export async function deleteSpendingEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(
    supabase.from("spending_entries").delete(),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);

  revalidateSpendingViews();
}

type ParsedBankTransaction = {
  date: string;
  description: string;
  normalized: string;
  amount: number;
  direction: "income" | "outgoing";
  rowIndex: number;
  raw: Record<string, string>;
};

function detectDelimiter(firstLine: string) {
  const candidates = [",", ";", "\t"];
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0] || ",";
}

function parseCsvRows(text: string) {
  const delimiter = detectDelimiter(text.split(/\r?\n/)[0] || "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normaliseHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalised = headers.map(normaliseHeader);
  for (const candidate of candidates) {
    const exactIndex = normalised.findIndex((header) => header === candidate);
    if (exactIndex >= 0) return exactIndex;
  }
  for (const candidate of candidates) {
    if (candidate.length <= 2) continue;
    const looseIndex = normalised.findIndex((header) => header.includes(candidate));
    if (looseIndex >= 0) return looseIndex;
  }
  return -1;
}

function parseBankNumber(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/[£,$]/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseBankDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const uk = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function normaliseTransactionDescription(description: string) {
  const cleaned = description
    .toUpperCase()
    .replace(/CARD PAYMENT TO|DIRECT DEBIT|DD PAYMENT|FASTER PAYMENT|STANDING ORDER|APPLE PAY|GOOGLE PAY|CONTACTLESS/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || description.trim().toUpperCase().slice(0, 80);
}

function titleCaseFromKey(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function parseBankCsv(text: string): ParsedBankTransaction[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const dateIndex = findHeaderIndex(headers, ["date", "transaction date", "posted date", "booking date", "completed date"]);
  const descriptionIndex = findHeaderIndex(headers, ["description", "details", "transaction description", "merchant", "payee", "name", "reference", "narrative"]);
  const amountIndex = findHeaderIndex(headers, ["amount", "value", "transaction amount"]);
  const debitIndex = findHeaderIndex(headers, ["debit", "money out", "paid out", "withdrawal", "out"]);
  const creditIndex = findHeaderIndex(headers, ["credit", "money in", "paid in", "deposit", "in"]);

  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error("I couldn't detect the CSV columns. Make sure it has Date, Description/Details and Amount or Money In/Money Out columns.");
  }

  const parsed: ParsedBankTransaction[] = [];

  rows.slice(1).forEach((row, rowOffset) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => {
      raw[header || `Column ${index + 1}`] = row[index] || "";
    });

    const date = parseBankDate(row[dateIndex] || "");
    const description = String(row[descriptionIndex] || "").trim();
    if (!date || !description) return;

    let amount: number | null = null;
    const singleAmount = amountIndex >= 0 ? parseBankNumber(row[amountIndex]) : null;
    const debit = debitIndex >= 0 ? parseBankNumber(row[debitIndex]) : null;
    const credit = creditIndex >= 0 ? parseBankNumber(row[creditIndex]) : null;

    if (singleAmount !== null) amount = singleAmount;
    else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    else if (debit !== null && debit !== 0) amount = -Math.abs(debit);

    if (amount === null || amount === 0) return;

    parsed.push({
      date,
      description,
      normalized: normaliseTransactionDescription(description),
      amount: Math.abs(amount),
      direction: amount > 0 ? "income" : "outgoing",
      rowIndex: rowOffset + 2,
      raw,
    });
  });

  return parsed;
}


async function extractTransactionsTextFromDocument(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, file: File) {
  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) throw new Error("PDF/image imports need an OpenAI token saved in Integrations. CSV imports still work without AI.");
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extract bank/bill transactions from this PDF/image. Return CSV only with these exact headers: Date,Description,Amount. Use negative amounts for outgoings and positive for income. If this is a bill rather than a bank statement, return the bill/payment rows you can infer, such as provider monthly cost and due date." },
          { type: "input_file", filename: file.name || "statement.pdf", file_data: dataUrl },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "OpenAI could not read that document.");
  const text = String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "");
  return text.replace(/^```(?:csv)?/i, "").replace(/```$/g, "").trim();
}

function buildRegularPaymentCandidates(transactions: ParsedBankTransaction[]) {
  const groups = new Map<string, ParsedBankTransaction[]>();
  for (const transaction of transactions) {
    const key = `${transaction.direction}:${transaction.normalized}`;
    groups.set(key, [...(groups.get(key) || []), transaction]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const months = new Set(items.map((item) => item.date.slice(0, 7)));
      const amounts = items.map((item) => item.amount);
      const average = amounts.reduce((sum, value) => sum + value, 0) / Math.max(1, amounts.length);
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      const spread = max - min;
      const spreadRatio = average > 0 ? spread / average : 1;
      const days = items.map((item) => Number(item.date.slice(8, 10)));
      const direction = key.startsWith("income:") ? "income" as const : "outgoing" as const;
      const normalized = key.replace(/^income:|^outgoing:/, "");
      const confidence = Math.max(0.1, Math.min(0.98, 0.38 + months.size * 0.14 + items.length * 0.04 - spreadRatio * 0.2));

      return {
        normalized,
        direction,
        label: titleCaseFromKey(normalized),
        average,
        min,
        max,
        day: median(days),
        firstSeen: items.map((item) => item.date).sort()[0],
        lastSeen: items.map((item) => item.date).sort().at(-1) || items[0].date,
        occurrenceCount: items.length,
        seenMonthCount: months.size,
        confidence,
        sampleDescriptions: Array.from(new Set(items.map((item) => item.description))).slice(0, 5),
        sampleDates: items.map((item) => item.date).sort().slice(-6),
        notes: `Detected ${items.length} similar ${direction === "income" ? "incoming" : "outgoing"} payments across ${months.size} month(s). Amount range ${min.toFixed(2)}-${max.toFixed(2)}.`,
      };
    })
    .filter((candidate) => candidate.occurrenceCount >= 2 && candidate.seenMonthCount >= 2 && candidate.confidence >= 0.52)
    .sort((a, b) => b.confidence - a.confidence);
}

export async function importBankCsv(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);

  const file = formData.get("csv_file");
  if (!(file instanceof File)) throw new Error("Choose a CSV, PDF or image file to import.");

  const lowerName = file.name.toLowerCase();
  const canReadAsText = lowerName.endsWith(".csv") || lowerName.endsWith(".txt") || file.type.includes("csv") || file.type.startsWith("text/");
  const text = canReadAsText ? await file.text() : await extractTransactionsTextFromDocument(supabase, user.id, file);
  const parsed = parseBankCsv(text);
  if (parsed.length === 0) throw new Error("No valid transactions were found in that file.");

  const personId = emptyToNull(formData.get("person_id"));
  const accountName = String(formData.get("account_name") || "Bank account").trim() || "Bank account";
  const providerName = emptyToNull(formData.get("provider_name"));

  const { data: importRow, error: importError } = await supabase
    .from("bank_imports")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      person_id: personId,
      account_name: accountName,
      provider_name: providerName,
      original_filename: file.name,
      imported_rows: Math.max(0, parseCsvRows(text).length - 1),
      detected_rows: parsed.length,
      notes: String(formData.get("notes") || (canReadAsText ? "" : "Imported from PDF/image using OpenAI extraction. Review the parsed transactions.")),
    })
    .select("id")
    .single();

  if (importError) throw new Error(importError.message);

  const transactionRows = parsed.map((transaction) => ({
    ...householdWriteFields(householdContext, user.id),
    import_id: importRow.id,
    person_id: personId,
    account_name: accountName,
    transaction_date: transaction.date,
    description: transaction.description,
    normalized_description: transaction.normalized,
    amount: transaction.amount,
    direction: transaction.direction,
    source_row_index: transaction.rowIndex,
    raw_data: transaction.raw,
  }));

  const { error: transactionError } = await supabase.from("bank_transactions").insert(transactionRows);
  if (transactionError) throw new Error(transactionError.message);

  const { data: allTransactions, error: allError } = await supabase
    .from("bank_transactions")
    .select("transaction_date, description, normalized_description, amount, direction")
    .or(householdVisibleFilter)
    .eq("account_name", accountName)
    .limit(2500);

  if (allError) throw new Error(allError.message);

  const candidateInput: ParsedBankTransaction[] = (allTransactions || []).map((transaction, index) => ({
    date: String(transaction.transaction_date),
    description: String(transaction.description),
    normalized: String(transaction.normalized_description),
    amount: Number(transaction.amount),
    direction: transaction.direction as "income" | "outgoing",
    rowIndex: index,
    raw: {},
  }));

  const candidates = buildRegularPaymentCandidates(candidateInput).slice(0, 25);

  for (const candidate of candidates) {
    const { data: existing } = await supabase
      .from("bank_regular_payment_candidates")
      .select("id, status")
      .or(householdVisibleFilter)
      .eq("normalized_key", candidate.normalized)
      .eq("direction", candidate.direction)
      .maybeSingle();

    if (existing?.status === "accepted" || existing?.status === "dismissed") continue;

    const payload = {
      ...householdWriteFields(householdContext, user.id),
      person_id: personId,
      account_name: accountName,
      normalized_key: candidate.normalized,
      direction: candidate.direction,
      label_suggestion: candidate.label,
      amount_average: candidate.average,
      amount_min: candidate.min,
      amount_max: candidate.max,
      day_of_month: candidate.day,
      first_seen: candidate.firstSeen,
      last_seen: candidate.lastSeen,
      occurrence_count: candidate.occurrenceCount,
      seen_month_count: candidate.seenMonthCount,
      confidence: candidate.confidence,
      sample_descriptions: candidate.sampleDescriptions,
      sample_dates: candidate.sampleDates,
      notes: candidate.notes,
      status: "suggested",
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await applyMutableRecordFilter(supabase.from("bank_regular_payment_candidates").update(payload), existing.id, householdContext);
    } else {
      await supabase.from("bank_regular_payment_candidates").insert(payload);
    }
  }

  revalidatePath("/spending");
  revalidatePath("/dashboard");
}

export async function acceptRegularPaymentCandidate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);

  const candidateId = String(formData.get("candidate_id") || "");
  const personId = emptyToNull(formData.get("person_id"));
  const categoryId = emptyToNull(formData.get("category_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const noEndDate = String(formData.get("no_end_date") || "") === "on";

  const { data: candidate, error: candidateError } = await supabase
    .from("bank_regular_payment_candidates")
    .select("id, direction, label_suggestion, amount_average, day_of_month")
    .eq("id", candidateId)
    .or(householdVisibleFilter)
    .single();

  if (candidateError) throw new Error(candidateError.message);

  const acceptedDirection = String(formData.get("direction") || candidate.direction || "outgoing");
  const acceptedLabel = String(formData.get("label") || candidate.label_suggestion || "Regular payment");
  const acceptedBrand = acceptedDirection === "outgoing" ? await resolveBillBrand(supabase, user.id, acceptedLabel) : null;

  const { data: plannedItem, error: itemError } = await supabase
    .from("planned_items")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      person_id: personId,
      category_id: categoryId,
      direction: acceptedDirection,
      item_type: "subscription",
      label: acceptedLabel,
      amount: parseNumber(formData.get("amount")) ?? Number(candidate.amount_average ?? 0),
      recurrence: "monthly",
      start_date: startDate,
      end_date: noEndDate ? null : emptyToNull(formData.get("end_date")),
      day_of_month: parseInteger(formData.get("day_of_month")) ?? Number(candidate.day_of_month ?? startDate.slice(8, 10)),
      payment_timing: "fixed_day",
      payment_adjustment: "previous_workday",
      ...(acceptedDirection === "outgoing" ? brandColumns(acceptedBrand) : {}),
      notes: String(formData.get("notes") || "Created from bank CSV recurring-payment suggestion."),
    })
    .select("id")
    .single();

  if (itemError) throw new Error(itemError.message);

  const { error: updateError } = await supabase
    .from("bank_regular_payment_candidates")
    .update({ status: "accepted", planned_item_id: plannedItem.id, updated_at: new Date().toISOString() })
    .eq("id", candidateId)
    .or(householdVisibleFilter);

  if (updateError) throw new Error(updateError.message);

  revalidateSpendingViews(personId);
}

export async function refreshMissingBillLogos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("spending_bill_logo_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  if ((profile as { spending_bill_logo_mode?: string } | null)?.spending_bill_logo_mode === "off") {
    revalidateSpendingViews();
    return;
  }

  const { data: items, error } = await supabase
    .from("planned_items")
    .select("id, label")
    .eq("user_id", user.id)
    .eq("direction", "outgoing")
    .is("brand_logo_url", null)
    .order("updated_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);

  for (const item of items || []) {
    const brand = await resolveBillBrand(supabase, user.id, String(item.label || ""));
    if (!brand) {
      await supabase
        .from("planned_items")
        .update({ brand_logo_source: "not_found", brand_logo_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("user_id", user.id);
      continue;
    }

    await supabase
      .from("planned_items")
      .update({
        brand_name: brand.brandName,
        brand_domain: brand.domain,
        brand_logo_url: brand.logoUrl,
        brand_logo_source: brand.source,
        brand_logo_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id);
  }

  revalidateSpendingViews();
}

export async function dismissRegularPaymentCandidate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("candidate_id") || "");
  const { error } = await applyMutableRecordFilter(supabase
    .from("bank_regular_payment_candidates")
    .update({ status: "dismissed", updated_at: new Date().toISOString() }), id, householdContext);

  if (error) throw new Error(error.message);
  revalidatePath("/spending");
}
