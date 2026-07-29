"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, applyVisibleDataFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

function emptyToNull(value: FormDataEntryValue | null) {
  const stringValue = String(value || "").trim();
  return stringValue || null;
}

function parseInteger(value: FormDataEntryValue | null) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function revalidateSpendingViews(personId?: string | null) {
  revalidatePath("/spending");
  revalidatePath("/dashboard");
  if (personId) revalidatePath(`/household/${personId}`);
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
    monthly_budget: parseNumber(formData.get("monthly_budget")) ?? 0,
    type: String(formData.get("type") || "variable"),
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
  const categoryId = emptyToNull(formData.get("category_id"));
  const personId = emptyToNull(formData.get("person_id"));

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    category_id: categoryId,
    label: String(formData.get("label") || "Spend"),
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
  const categoryId = emptyToNull(formData.get("category_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const recurrence = String(formData.get("recurrence") || "monthly") === "one_off" ? "one_off" : "monthly";

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    category_id: categoryId,
    direction: String(formData.get("direction") || "outgoing"),
    item_type: String(formData.get("item_type") || (recurrence === "monthly" ? "monthly_cost" : "one_off")),
    label: String(formData.get("label") || "Planned item"),
    amount: parseNumber(formData.get("amount")) ?? 0,
    recurrence,
    start_date: startDate,
    end_date: recurrence === "monthly" ? emptyToNull(formData.get("end_date")) : null,
    day_of_month: recurrence === "monthly" ? parseInteger(formData.get("day_of_month")) ?? Number(startDate.slice(8, 10)) : null,
    payment_timing: recurrence === "monthly" ? String(formData.get("payment_timing") || "fixed_day") : null,
    payment_adjustment: recurrence === "monthly" ? String(formData.get("payment_adjustment") || "previous_workday") : null,
    notes: String(formData.get("notes") || ""),
  };

  const { error } = await supabase.from("planned_items").insert(payload);
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
  const categoryId = emptyToNull(formData.get("category_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const recurrence = String(formData.get("recurrence") || "monthly") === "one_off" ? "one_off" : "monthly";

  const payload = {
    person_id: personId,
    category_id: categoryId,
    direction: String(formData.get("direction") || "outgoing"),
    item_type: String(formData.get("item_type") || (recurrence === "monthly" ? "monthly_cost" : "one_off")),
    label: String(formData.get("label") || "Planned item"),
    amount: parseNumber(formData.get("amount")) ?? 0,
    recurrence,
    start_date: startDate,
    end_date: recurrence === "monthly" ? emptyToNull(formData.get("end_date")) : null,
    day_of_month: recurrence === "monthly" ? parseInteger(formData.get("day_of_month")) ?? Number(startDate.slice(8, 10)) : null,
    payment_timing: recurrence === "monthly" ? String(formData.get("payment_timing") || "fixed_day") : null,
    payment_adjustment: recurrence === "monthly" ? String(formData.get("payment_adjustment") || "previous_workday") : null,
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  };

  const { error } = await applyMutableRecordFilter(supabase.from("planned_items").update(payload), id, householdContext);

  if (error) throw new Error(error.message);

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
  const { error } = await applyMutableRecordFilter(supabase.from("planned_items").delete(), id, householdContext);

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
  const { error } = await applyMutableRecordFilter(supabase.from("spending_categories").delete(), id, householdContext);

  if (error) throw new Error(error.message);

  revalidateSpendingViews();
}

export async function deleteSpendingEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("spending_entries").delete(), id, householdContext);

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

  const file = formData.get("csv_file");
  if (!(file instanceof File)) throw new Error("Choose a CSV file to import.");

  const text = await file.text();
  const parsed = parseBankCsv(text);
  if (parsed.length === 0) throw new Error("No valid transactions were found in that CSV.");

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
      imported_rows: parseCsvRows(text).length - 1,
      detected_rows: parsed.length,
      notes: String(formData.get("notes") || ""),
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

  const allTransactionsQuery = supabase
    .from("bank_transactions")
    .select("transaction_date, description, normalized_description, amount, direction")
    .eq("account_name", accountName)
    .limit(2500);

  const { data: allTransactions, error: allError } = await applyVisibleDataFilter(allTransactionsQuery, householdContext);

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
    const existingQuery = supabase
      .from("bank_regular_payment_candidates")
      .select("id, status")
      .eq("normalized_key", candidate.normalized)
      .eq("direction", candidate.direction);

    const { data: existing } = await applyVisibleDataFilter(existingQuery, householdContext).maybeSingle();

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

  const candidateId = String(formData.get("candidate_id") || "");
  const personId = emptyToNull(formData.get("person_id"));
  const categoryId = emptyToNull(formData.get("category_id"));
  const startDate = String(formData.get("start_date") || new Date().toISOString().slice(0, 10));
  const noEndDate = String(formData.get("no_end_date") || "") === "on";

  const candidateQuery = supabase
    .from("bank_regular_payment_candidates")
    .select("id, direction, label_suggestion, amount_average, day_of_month");

  const { data: candidate, error: candidateError } = await applyMutableRecordFilter(candidateQuery, candidateId, householdContext).single();

  if (candidateError) throw new Error(candidateError.message);

  const { data: plannedItem, error: itemError } = await supabase
    .from("planned_items")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      person_id: personId,
      category_id: categoryId,
      direction: String(formData.get("direction") || candidate.direction || "outgoing"),
      item_type: "subscription",
      label: String(formData.get("label") || candidate.label_suggestion || "Regular payment"),
      amount: parseNumber(formData.get("amount")) ?? Number(candidate.amount_average ?? 0),
      recurrence: "monthly",
      start_date: startDate,
      end_date: noEndDate ? null : emptyToNull(formData.get("end_date")),
      day_of_month: parseInteger(formData.get("day_of_month")) ?? Number(candidate.day_of_month ?? startDate.slice(8, 10)),
      notes: String(formData.get("notes") || "Created from bank CSV recurring-payment suggestion."),
    })
    .select("id")
    .single();

  if (itemError) throw new Error(itemError.message);

  const { error: updateError } = await applyMutableRecordFilter(
    supabase
      .from("bank_regular_payment_candidates")
      .update({ status: "accepted", planned_item_id: plannedItem.id, updated_at: new Date().toISOString() }),
    candidateId,
    householdContext
  );

  if (updateError) throw new Error(updateError.message);

  revalidateSpendingViews(personId);
}

export async function dismissRegularPaymentCandidate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const id = String(formData.get("candidate_id") || "");
  const { error } = await applyMutableRecordFilter(
    supabase.from("bank_regular_payment_candidates").update({ status: "dismissed", updated_at: new Date().toISOString() }),
    id,
    householdContext
  );

  if (error) throw new Error(error.message);
  revalidatePath("/spending");
}
