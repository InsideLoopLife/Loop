"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { generateHolidayPeriodsFromTerms, parseSchoolCalendarText } from "@/lib/family/school-calendar-parser";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function requiredString(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value || "").trim();
  return text.length ? text : fallback;
}

function nullableDate(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function revalidateFamilyPlanning() {
  revalidatePath("/lifestyle");
  revalidatePath("/lifestyle/family-planning");
  revalidatePath("/dashboard");
}

export async function addFamilyCalendarSource(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const { error } = await supabase.from("family_calendar_sources").insert({
    ...householdWriteFields(householdContext, user.id),
    label: requiredString(formData.get("label"), "School calendar"),
    source_type: requiredString(formData.get("source_type"), "manual"),
    source_url: nullableString(formData.get("source_url")),
    local_authority: nullableString(formData.get("local_authority")),
    school_name: nullableString(formData.get("school_name")),
    academic_year: nullableString(formData.get("academic_year")),
    notes: nullableString(formData.get("notes")),
    last_checked_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function addFamilyCalendarPeriod(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const childId = nullableString(formData.get("child_person_id"));
  const startDate = nullableDate(formData.get("start_date"));
  const endDate = nullableDate(formData.get("end_date"));
  if (!childId) throw new Error("Choose the child this calendar period belongs to.");
  if (!startDate || !endDate) throw new Error("Start and end dates are required.");

  const { error } = await supabase.from("family_calendar_periods").insert({
    ...householdWriteFields(householdContext, user.id),
    child_person_id: childId,
    source_id: nullableString(formData.get("source_id")),
    period_type: requiredString(formData.get("period_type"), "school_holiday"),
    label: requiredString(formData.get("label"), "Holiday period"),
    start_date: startDate,
    end_date: endDate,
    requires_cover: formData.get("requires_cover") !== "off",
    expected_cost: parseNumber(formData.get("expected_cost")) ?? 0,
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function updateFamilyCalendarPeriod(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  const childId = nullableString(formData.get("child_person_id"));
  const startDate = nullableDate(formData.get("start_date"));
  const endDate = nullableDate(formData.get("end_date"));
  if (!id) throw new Error("Missing calendar period id.");
  if (!childId) throw new Error("Choose the child this calendar period belongs to.");
  if (!startDate || !endDate) throw new Error("Start and end dates are required.");

  const { error } = await applyMutableRecordFilter(supabase.from("family_calendar_periods").update({
    child_person_id: childId,
    source_id: nullableString(formData.get("source_id")),
    period_type: requiredString(formData.get("period_type"), "school_holiday"),
    label: requiredString(formData.get("label"), "Holiday period"),
    start_date: startDate,
    end_date: endDate,
    requires_cover: formData.get("requires_cover") !== "off",
    expected_cost: parseNumber(formData.get("expected_cost")) ?? 0,
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }), id, householdContext);
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function deleteFamilyCalendarPeriod(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const { error } = await applyMutableRecordFilter(supabase.from("family_calendar_periods").delete(), String(formData.get("id") || ""), householdContext);
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function saveFamilyLeaveAllowance(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const personId = nullableString(formData.get("person_id"));
  const leaveYear = parseNumber(formData.get("leave_year")) ?? new Date().getFullYear();
  if (!personId) throw new Error("Choose the adult this annual leave allowance belongs to.");

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    leave_year: leaveYear,
    allowance_days: parseNumber(formData.get("allowance_days")) ?? 25,
    carried_over_days: parseNumber(formData.get("carried_over_days")) ?? 0,
    bank_holidays_included: formData.get("bank_holidays_included") === "on",
    work_pattern: requiredString(formData.get("work_pattern"), "Mon-Fri"),
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("family_leave_allowances")
    .upsert(payload, { onConflict: "household_id,person_id,leave_year" });
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function saveFamilyCoverPolicy(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const childId = nullableString(formData.get("child_person_id"));
  if (!childId) throw new Error("Choose a child for this policy.");

  const { error } = await supabase.from("family_cover_policies").insert({
    ...householdWriteFields(householdContext, user.id),
    child_person_id: childId,
    label: requiredString(formData.get("label"), "Holiday cover policy"),
    policy_type: requiredString(formData.get("policy_type"), "one_adult_weekdays"),
    requires_adult_cover: formData.get("requires_adult_cover") !== "off",
    applies_weekends: formData.get("applies_weekends") === "on",
    default_cover_type: requiredString(formData.get("default_cover_type"), "parent_leave"),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function addFamilyCoverAssignment(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const childId = nullableString(formData.get("child_person_id"));
  const coverDate = nullableDate(formData.get("cover_date"));
  if (!childId) throw new Error("Choose the child this cover day belongs to.");
  if (!coverDate) throw new Error("Choose the cover date.");

  const { error } = await supabase.from("family_cover_assignments").insert({
    ...householdWriteFields(householdContext, user.id),
    child_person_id: childId,
    cover_date: coverDate,
    cover_type: requiredString(formData.get("cover_type"), "parent_leave"),
    person_id: nullableString(formData.get("person_id")),
    uses_leave_days: parseNumber(formData.get("uses_leave_days")) ?? 1,
    cost_estimate: parseNumber(formData.get("cost_estimate")) ?? 0,
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}

export async function deleteFamilyCoverAssignment(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const { error } = await applyMutableRecordFilter(supabase.from("family_cover_assignments").delete(), String(formData.get("id") || ""), householdContext);
  if (error) throw new Error(error.message);
  revalidateFamilyPlanning();
}


export async function importSchoolCalendarSource(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const childId = nullableString(formData.get("child_person_id"));
  const pastedText = nullableString(formData.get("calendar_text")) || "";
  const sourceUrl = nullableString(formData.get("source_url"));
  const file = formData.get("calendar_file") as File | null;
  let fileText = "";
  let fileName: string | null = null;
  let fileSize = 0;

  if (!childId) throw new Error("Choose the child this school calendar belongs to.");
  if (file && file.size > 0) {
    fileName = file.name;
    fileSize = file.size;
    const fileType = String(file.type || "").toLowerCase();
    if (fileType.includes("text") || file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".csv")) {
      fileText = await file.text();
    }
  }

  const combinedText = [pastedText, fileText].filter(Boolean).join("\n\n");
  const parsed = parseSchoolCalendarText(combinedText);
  const academicYear = nullableString(formData.get("academic_year"));
  const schoolName = nullableString(formData.get("school_name"));

  const { data: source, error: sourceError } = await supabase
    .from("family_calendar_sources")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      label: requiredString(formData.get("label"), schoolName || "School calendar import"),
      source_type: sourceUrl ? "school_website" : fileName ? "uploaded_file" : "manual_paste",
      source_url: sourceUrl,
      school_name: schoolName,
      local_authority: nullableString(formData.get("local_authority")),
      academic_year: academicYear,
      notes: [
        nullableString(formData.get("notes")),
        fileName ? `Uploaded file: ${fileName} (${Math.round(fileSize / 1024)}KB).` : null,
        parsed.notes.join(" "),
      ].filter(Boolean).join("\n\n"),
      last_checked_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);
  const sourceId = source?.id as string | undefined;

  try {
    await supabase.from("family_school_calendar_imports").insert({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childId,
      source_id: sourceId || null,
      source_url: sourceUrl,
      source_file_name: fileName,
      source_file_size_bytes: fileSize || null,
      raw_text: combinedText || null,
      parsed_payload: parsed as any,
      confidence: parsed.confidence,
      status: parsed.terms.length ? "parsed" : "needs_review",
      notes: parsed.notes.join(" ") || null,
    });
  } catch {
    // Older installs may not have the import audit table yet; period creation still works after the main SQL is run.
  }

  const periodRows: any[] = [];
  for (const row of generateHolidayPeriodsFromTerms(parsed.terms)) {
    periodRows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childId,
      source_id: sourceId || null,
      period_type: "school_holiday",
      label: row.label,
      start_date: row.start_date,
      end_date: row.end_date,
      requires_cover: true,
      expected_cost: 0,
      notes: `Generated from imported term dates${schoolName ? ` for ${schoolName}` : ""}.`,
    });
  }
  for (const inset of parsed.insetDays) {
    periodRows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childId,
      source_id: sourceId || null,
      period_type: "inset_day",
      label: inset.label,
      start_date: inset.date,
      end_date: inset.date,
      requires_cover: true,
      expected_cost: 0,
      notes: "Generated from imported school calendar inset days.",
    });
  }
  for (const holiday of parsed.bankHolidays) {
    periodRows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childId,
      source_id: sourceId || null,
      period_type: "bank_holiday",
      label: holiday.label,
      start_date: holiday.date,
      end_date: holiday.date,
      requires_cover: false,
      expected_cost: 0,
      notes: "Generated from imported term-time bank holiday.",
    });
  }

  if (periodRows.length) {
    const { error } = await supabase.from("family_calendar_periods").insert(periodRows);
    if (error) throw new Error(error.message);
  }

  revalidateFamilyPlanning();
}
