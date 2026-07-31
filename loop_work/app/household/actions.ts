"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { parseNumber } from "@/lib/format/money";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { CareType, mapCareTypeToCostKind, calculateNewCareTypeMonthlyCost } from "@/lib/calculations/childcareRegistry";

const NEW_CARE_TYPES: CareType[] = ["childminder", "breakfast_club", "after_school_club", "holiday_camp", "nanny"];
import { getLatestAssumptionValue, recordAssumptionCheck } from "@/lib/assumptions/server";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields, visibleDataOrFilter } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

function adminOrUserClient<T>(fallback: T): T {
  if (!hasSupabaseAdminKey()) return fallback;
  try {
    return createAdminClient() as T;
  } catch {
    return fallback;
  }
}


async function getOrCreateHouseholdIdForUser(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }) {
  const { data: existing } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.household_id) return existing.household_id;

  const { data: householdId, error } = await supabase.rpc("app_get_or_create_household", {
    p_name: "My household",
    p_timezone: "Europe/London",
    p_currency: "GBP",
    p_image_url: null,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);
  if (!householdId) throw new Error("Could not create household.");
  return householdId as string;
}


async function avatarUrlFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  fallback: string | null = null
) {
  const file = formData.get("avatar_file");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Profile image must be an image file.");
    if (file.size > 5_000_000) throw new Error("Profile image must be under 5MB. Crop/compress the image before uploading, or use a smaller phone photo.");

    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("person-avatars")
      .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });

    if (!uploadError) {
      const { data } = supabase.storage.from("person-avatars").getPublicUrl(path);
      return data.publicUrl;
    }

    // Local/dev fallback: keeps the UI working if the Storage bucket migration has not been run yet.
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }
  return fallback || null;
}


async function householdImageUrlFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  fallback: string | null = null
) {
  const file = formData.get("household_image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Household image must be an image file.");
    if (file.size > 5_000_000) throw new Error("Household image must be under 5MB. Crop/compress the image before uploading.");
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${userId}/households/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("household-images")
      .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (!uploadError) {
      const { data } = supabase.storage.from("household-images").getPublicUrl(path);
      return data.publicUrl;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }
  return fallback;
}

async function logPayEventAssumptionChecks(supabase: any, userId: string, formData: FormData, relatedId?: string | null) {
  const payKind = String(formData.get("pay_kind") || "salary");
  const studentLoanPlan = String(formData.get("student_loan_plan") || "none");
  const pensionMethod = String(formData.get("pension_method") || "net_pay");

  if (payKind === "maternity") {
    const savedSmp = await getLatestAssumptionValue(supabase, userId, "smp_weekly_rate");
    const expected = Number(savedSmp?.value_numeric ?? 194.32);
    const entered = parseNumber(formData.get("maternity_smp_weekly_rate")) ?? expected;
    const mismatch = Math.abs(entered - expected) > 0.01;

    await recordAssumptionCheck({
      supabase,
      userId,
      area: "maternity_pay",
      relatedTable: "pay_events",
      relatedId,
      status: mismatch ? "warning" : "ok",
      message: mismatch
        ? `Maternity SMP value ${entered} differs from saved assumption ${expected}. Review before trusting projections.`
        : `Maternity SMP checked against saved assumption ${expected}.`,
      assumptionKeys: ["smp_weekly_rate"],
    });
  }

  if (studentLoanPlan !== "none") {
    const key = studentLoanPlan === "postgraduate" ? "student_loan_postgraduate_threshold" : `student_loan_${studentLoanPlan}_threshold`;
    await recordAssumptionCheck({
      supabase,
      userId,
      area: "student_loan",
      relatedTable: "pay_events",
      relatedId,
      status: "ok",
      message: `Student loan plan ${studentLoanPlan.replaceAll("_", " ")} checked against assumptions page.`,
      assumptionKeys: [key],
    });
  }

  if (pensionMethod === "salary_sacrifice" || pensionMethod === "nhs_pension") {
    await recordAssumptionCheck({
      supabase,
      userId,
      area: "pension_method",
      relatedTable: "pay_events",
      relatedId,
      status: "needs_review",
      message: `${pensionMethod.replaceAll("_", " ")} can change taxable pay, NI and student-loan calculations. Check against payslip/pension rules.`,
      assumptionKeys: ["tax_personal_allowance", "ni_primary_threshold_annual"],
    });
  }
}

export async function addPerson(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const avatarUrl = await avatarUrlFromForm(supabase, user.id, formData);
  const { error } = await supabase.from("people").insert({
    ...householdWriteFields(householdContext, user.id),
    name: String(formData.get("name") || "Person"),
    relationship: String(formData.get("relationship") || "other"),
    birth_date: String(formData.get("birth_date") || "") || null,
    email: String(formData.get("email") || "") || null,
    invite_email: String(formData.get("email") || "") || null,
    account_status: String(formData.get("account_status") || "managed_by_household"),
    income_visible_to_household: String(formData.get("income_visible_to_household") || "true") === "true",
    costs_visible_to_household: String(formData.get("costs_visible_to_household") || "true") === "true",
    household_can_add_costs: String(formData.get("household_can_add_costs") || "true") === "true",
    maturity_date: String(formData.get("maturity_date") || "") || null,
    avatar_url: avatarUrl,
    active_from: String(formData.get("active_from") || "") || new Date().toISOString().slice(0, 10),
    active_until: String(formData.get("active_until") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function updatePersonProfile(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing person id");

  const avatarUrl = await avatarUrlFromForm(supabase, user.id, formData, String(formData.get("avatar_url") || "") || null);
  const { error } = await applyMutableRecordFilter(
    supabase.from("people").update({
      name: String(formData.get("name") || "Person"),
      relationship: String(formData.get("relationship") || "other"),
      birth_date: String(formData.get("birth_date") || "") || null,
      email: String(formData.get("email") || "") || null,
      invite_email: String(formData.get("invite_email") || formData.get("email") || "") || null,
      account_status: String(formData.get("account_status") || "managed_by_household"),
      income_visible_to_household: String(formData.get("income_visible_to_household") || "false") === "true",
      costs_visible_to_household: String(formData.get("costs_visible_to_household") || "false") === "true",
      household_can_add_costs: String(formData.get("household_can_add_costs") || "false") === "true",
      maturity_date: String(formData.get("maturity_date") || "") || null,
      avatar_url: avatarUrl,
      active_from: String(formData.get("active_from") || "") || null,
      active_until: String(formData.get("active_until") || "") || null,
      notes: String(formData.get("notes") || ""),
    }), id, householdContext);

  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath(`/household/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/income");
}

export async function createPersonAccountPrompt(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const personId = String(formData.get("person_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!personId) throw new Error("Missing person id");

  const householdId = await getOrCreateHouseholdIdForUser(supabase, user);

  const { data: person } = await supabase
    .from("people")
    .select("id, name, relationship")
    .eq("id", personId)
    .or(householdVisibleFilter)
    .maybeSingle();
  if (!person) throw new Error("Person profile not found.");

  const { error: updateError } = await supabase
    .from("people")
    .update({
      email: email || null,
      invite_email: email || null,
      account_status: email ? "invited" : "managed_by_household",
      account_setup_prompted_at: new Date().toISOString(),
    })
    .eq("id", personId)
    .or(householdVisibleFilter);

  if (updateError) throw new Error(updateError.message);

  let note = email
    ? "Account setup email was prepared. Passwords and MFA will be controlled by that person through Supabase Auth."
    : "Add an email before sending an account setup prompt.";

  if (email) {
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const recipientName = person?.name || "there";
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const claimLink = `${baseUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
    const writeClient = adminOrUserClient(supabase);

    try {
      await writeClient.from("person_account_invites").insert({
        household_id: householdId,
        person_id: personId,
        invited_by_user_id: user.id,
        email,
        relationship: person.relationship,
        token_hash: tokenHash,
        status: "pending",
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      });
    } catch (err: any) {
      note = `Invite saved on profile, but invite table insert failed: ${err?.message || "unknown"}. Run the V24.6 migration.`;
    }

    try {
      // Custom branded invite route: do not ask Supabase to send an invite email here.
      // The recipient can create an account via Loop's 8-digit sign-up code flow, then claim this profile.
      const setupLink = `${baseUrl}/signup?email=${encodeURIComponent(email)}&invite=${encodeURIComponent(rawToken)}&next=${encodeURIComponent(`/accept-invite?token=${rawToken}`)}`;

      const sent = await sendTransactionalEmail({
        to: email,
        subject: `Join ${user.email ? `${user.email.split("@")[0]}'s` : "your"} Loop household`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Hi ${recipientName},</h2><p>You’ve been invited to link your Loop profile to a household.</p><p><a href="${setupLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Set up / claim profile</a></p><p>If you already have an account, sign in first and then use this claim link:</p><p><a href="${claimLink}">${claimLink}</a></p><p style="color:#64748b;font-size:13px">Passwords and two-factor authentication are controlled by the person who owns the account, not by the household owner.</p></div>`,
        text: `Hi ${recipientName},

You've been invited to link your Loop profile to a household.

Set up / claim profile: ${setupLink}

If you already have an account, sign in first and use this claim link: ${claimLink}

Passwords and two-factor authentication are controlled by the person who owns the account, not by the household owner.`,
      });
      note = sent.sent ? "Branded setup email sent using configured email provider." : `Setup email created but not sent: ${sent.skipped}`;
    } catch (err: any) {
      note = `Account prompt saved, but email could not be sent: ${err?.message || "unknown email error"}. Check SMTP/Resend/Supabase admin settings.`;
    }
  }

  const { error } = await supabase.from("person_account_prompts").insert({
    user_id: user.id,
    person_id: personId,
    email: email || null,
    status: email ? "sent_or_ready" : "draft",
    note,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath(`/household/${personId}`);
}

export async function addPayEvent(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const { error } = await supabase.from("pay_events").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: String(formData.get("person_id") || "") || null,
    label: String(formData.get("label") || "Pay change"),
    pay_kind: String(formData.get("pay_kind") || "salary"),
    gross_annual_salary: parseNumber(formData.get("gross_annual_salary")) ?? 0,
    monthly_take_home_override: parseNumber(formData.get("monthly_take_home_override")),
    pension_percent: parseNumber(formData.get("pension_percent")) ?? 0,
    pension_method: String(formData.get("pension_method") || "net_pay"),
    student_loan_plan: String(formData.get("student_loan_plan") || "none"),
    effective_from: String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10),
    effective_until: String(formData.get("effective_until") || "") || null,
    pay_timing: String(formData.get("pay_timing") || "last_workday"),
    pay_day_of_month: parseNumber(formData.get("pay_day_of_month")) ?? 28,
    pay_adjustment: String(formData.get("pay_adjustment") || "previous_workday"),
    maternity_scheme: String(formData.get("maternity_scheme") || "") || null,
    maternity_leave_start: String(formData.get("maternity_leave_start") || "") || null,
    maternity_leave_end: String(formData.get("maternity_leave_end") || "") || null,
    maternity_pay_mode: String(formData.get("maternity_pay_mode") || "") || null,
    maternity_full_pay_weeks: parseNumber(formData.get("maternity_full_pay_weeks")),
    maternity_half_pay_weeks: parseNumber(formData.get("maternity_half_pay_weeks")),
    maternity_smp_only_weeks: parseNumber(formData.get("maternity_smp_only_weeks")),
    maternity_unpaid_weeks: parseNumber(formData.get("maternity_unpaid_weeks")),
    maternity_smp_weekly_rate: parseNumber(formData.get("maternity_smp_weekly_rate")),
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  await logPayEventAssumptionChecks(supabase, user.id, formData, null);
  const personId = String(formData.get("person_id") || "");
  revalidatePath("/household");
  if (personId) revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/affordability");
}


export async function updatePayEvent(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing pay event id");

  const personId = String(formData.get("person_id") || "") || null;

  const { error } = await applyMutableRecordFilter(
    supabase.from("pay_events").update({
      person_id: personId,
      label: String(formData.get("label") || "Pay change"),
      pay_kind: String(formData.get("pay_kind") || "salary"),
      gross_annual_salary: parseNumber(formData.get("gross_annual_salary")) ?? 0,
      monthly_take_home_override: parseNumber(formData.get("monthly_take_home_override")),
      pension_percent: parseNumber(formData.get("pension_percent")) ?? 0,
      pension_method: String(formData.get("pension_method") || "net_pay"),
      student_loan_plan: String(formData.get("student_loan_plan") || "none"),
      effective_from: String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10),
      effective_until: String(formData.get("effective_until") || "") || null,
      pay_timing: String(formData.get("pay_timing") || "last_workday"),
      pay_day_of_month: parseNumber(formData.get("pay_day_of_month")) ?? 28,
      pay_adjustment: String(formData.get("pay_adjustment") || "previous_workday"),
      maternity_scheme: String(formData.get("maternity_scheme") || "") || null,
      maternity_leave_start: String(formData.get("maternity_leave_start") || "") || null,
      maternity_leave_end: String(formData.get("maternity_leave_end") || "") || null,
      maternity_pay_mode: String(formData.get("maternity_pay_mode") || "") || null,
      maternity_full_pay_weeks: parseNumber(formData.get("maternity_full_pay_weeks")),
      maternity_half_pay_weeks: parseNumber(formData.get("maternity_half_pay_weeks")),
      maternity_smp_only_weeks: parseNumber(formData.get("maternity_smp_only_weeks")),
      maternity_unpaid_weeks: parseNumber(formData.get("maternity_unpaid_weeks")),
      maternity_smp_weekly_rate: parseNumber(formData.get("maternity_smp_weekly_rate")),
      notes: String(formData.get("notes") || ""),
    }), id, householdContext);

  if (error) throw new Error(error.message);
  await logPayEventAssumptionChecks(supabase, user.id, formData, id);
  revalidatePath("/household");
  if (personId) revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

function buildChildCostPayload(userId: string, formData: FormData) {
  const billingMonth = String(formData.get("billing_month") || new Date().toISOString().slice(0, 7)).slice(0, 7);

  const rawCareType = String(formData.get("care_type") || "") as CareType | "";
  const isNewCareType = NEW_CARE_TYPES.includes(rawCareType as CareType);

  // ChildCostWizard submissions carry care_type + care_details directly.
  // Legacy NurseryCostForm submissions (fixed/nursery/activity) don't set
  // care_type, so it falls back to cost_kind to keep the column populated.
  if (isNewCareType) {
    const careType = rawCareType as CareType;
    let careDetails: Record<string, any> = {};
    try {
      careDetails = JSON.parse(String(formData.get("care_details") || "{}"));
    } catch {
      careDetails = {};
    }

    const { estimatedMonthlyCost } = calculateNewCareTypeMonthlyCost(careType, careDetails, billingMonth);
    const childId = careType === "nanny" ? (careDetails.coveredChildIds?.[0] ?? null) : String(formData.get("child_id") || "") || null;

    return {
      user_id: userId,
      child_id: childId,
      bill_person_id: String(formData.get("bill_person_id") || "") || null,
      label: String(formData.get("label") || "Child cost"),
      cost_kind: mapCareTypeToCostKind(careType),
      care_type: careType,
      care_details: careDetails,
      monthly_cost: estimatedMonthlyCost,
      billing_month: `${billingMonth}-01`,
      payment_timing: String(formData.get("payment_timing") || "fixed_day"),
      payment_day_of_month: parseNumber(formData.get("payment_day_of_month")) ?? 1,
      payment_adjustment: String(formData.get("payment_adjustment") || "previous_workday"),
      starts_on: String(formData.get("starts_on") || "") || new Date().toISOString().slice(0, 10),
      ends_on: String(formData.get("ends_on") || "") || null,
      notes: String(formData.get("notes") || ""),
    };
  }

  const costKind = String(formData.get("cost_kind") || "fixed") as "fixed" | "nursery" | "activity";

  const nurseryInput = {
    billingMonth,
    dailyRate: parseNumber(formData.get("daily_rate")) ?? 0,
    extraDailyCost: parseNumber(formData.get("extra_daily_cost")) ?? 0,
    fundedHoursPerWeek: parseNumber(formData.get("funded_hours_per_week")) ?? 0,
    fundingMode: String(formData.get("funding_mode") || "none") as FundingMode,
    hourlyFundingCredit: parseNumber(formData.get("hourly_funding_credit")) ?? 0,
    termWeeksPerYear: parseNumber(formData.get("term_weeks_per_year")) ?? 38,
    billingSchedule: String(formData.get("billing_schedule") || "all_year") as BillingSchedule,
    bankHolidaysAreFree: String(formData.get("bank_holidays_are_free") || "false") === "true",
    taxFreeChildcareEnabled: String(formData.get("tax_free_childcare_enabled") || "false") === "true",
    taxFreeChildcareCapPerQuarter: parseNumber(formData.get("tax_free_childcare_cap_per_quarter")) ?? 500,
    partDayMultiplier: parseNumber(formData.get("part_day_multiplier")) ?? 0.5,
    fullDayHours: parseNumber(formData.get("full_day_hours")) ?? 10,
    partDayHours: parseNumber(formData.get("part_day_hours")) ?? 5,
    mondaySession: String(formData.get("monday_session") || "off") as DaySession,
    tuesdaySession: String(formData.get("tuesday_session") || "off") as DaySession,
    wednesdaySession: String(formData.get("wednesday_session") || "off") as DaySession,
    thursdaySession: String(formData.get("thursday_session") || "off") as DaySession,
    fridaySession: String(formData.get("friday_session") || "off") as DaySession,
    mondayHours: parseNumber(formData.get("monday_hours")) ?? 0,
    tuesdayHours: parseNumber(formData.get("tuesday_hours")) ?? 0,
    wednesdayHours: parseNumber(formData.get("wednesday_hours")) ?? 0,
    thursdayHours: parseNumber(formData.get("thursday_hours")) ?? 0,
    fridayHours: parseNumber(formData.get("friday_hours")) ?? 0,
  };

  const activityInput = {
    billingMonth,
    weeklyCost: parseNumber(formData.get("activity_weekly_cost")) ?? 0,
    activityWeekday: parseNumber(formData.get("activity_weekday")) ?? 6,
    activityBillingMode: String(formData.get("activity_billing_mode") || "calendar") as ActivityBillingMode,
    activityTermWeeksPerYear: parseNumber(formData.get("activity_term_weeks_per_year")) ?? 38,
    bankHolidaysAreFree: nurseryInput.bankHolidaysAreFree,
  };

  const nurseryEstimate = calculateNurseryMonthlyCost(nurseryInput);
  const activityEstimate = calculateActivityMonthlyCost(activityInput);
  const monthlyCost = costKind === "nursery"
    ? nurseryEstimate.estimatedMonthlyCost
    : costKind === "activity"
      ? activityEstimate.estimatedMonthlyCost
      : parseNumber(formData.get("monthly_cost")) ?? 0;

  return {
    user_id: userId,
    child_id: String(formData.get("child_id") || "") || null,
    bill_person_id: String(formData.get("bill_person_id") || "") || null,
    label: String(formData.get("label") || "Child cost"),
    cost_kind: costKind,
    care_type: costKind,
    care_details: {},
    monthly_cost: monthlyCost,
    billing_month: `${billingMonth}-01`,
    daily_rate: nurseryInput.dailyRate,
    extra_daily_cost: nurseryInput.extraDailyCost,
    funded_hours_per_week: nurseryInput.fundedHoursPerWeek,
    funding_mode: nurseryInput.fundingMode,
    hourly_funding_credit: nurseryInput.hourlyFundingCredit,
    term_weeks_per_year: nurseryInput.termWeeksPerYear,
    billing_schedule: nurseryInput.billingSchedule,
    bank_holidays_are_free: nurseryInput.bankHolidaysAreFree,
    tax_free_childcare_enabled: nurseryInput.taxFreeChildcareEnabled,
    tax_free_childcare_cap_per_quarter: nurseryInput.taxFreeChildcareCapPerQuarter,
    part_day_multiplier: nurseryInput.partDayMultiplier,
    full_day_hours: nurseryInput.fullDayHours,
    part_day_hours: nurseryInput.partDayHours,
    monday_session: nurseryInput.mondaySession,
    tuesday_session: nurseryInput.tuesdaySession,
    wednesday_session: nurseryInput.wednesdaySession,
    thursday_session: nurseryInput.thursdaySession,
    friday_session: nurseryInput.fridaySession,
    monday_hours: nurseryInput.mondayHours,
    tuesday_hours: nurseryInput.tuesdayHours,
    wednesday_hours: nurseryInput.wednesdayHours,
    thursday_hours: nurseryInput.thursdayHours,
    friday_hours: nurseryInput.fridayHours,
    activity_weekly_cost: activityInput.weeklyCost,
    activity_weekday: activityInput.activityWeekday,
    activity_billing_mode: activityInput.activityBillingMode,
    activity_term_weeks_per_year: activityInput.activityTermWeeksPerYear,
    payment_timing: String(formData.get("payment_timing") || "fixed_day"),
    payment_day_of_month: parseNumber(formData.get("payment_day_of_month")) ?? 1,
    payment_adjustment: String(formData.get("payment_adjustment") || "previous_workday"),
    starts_on: String(formData.get("starts_on") || "") || new Date().toISOString().slice(0, 10),
    ends_on: String(formData.get("ends_on") || "") || null,
    notes: String(formData.get("notes") || ""),
  };
}

function revalidateChildCostPaths(childId: string) {
  revalidatePath("/household");
  if (childId) revalidatePath(`/household/${childId}`);
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function addChildCost(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const payload = { ...buildChildCostPayload(user.id, formData), ...householdWriteFields(householdContext, user.id) };
  const { error } = await supabase.from("child_costs").insert(payload as any);
  if (error) throw new Error(error.message);
  revalidateChildCostPaths(String(formData.get("child_id") || ""));
}

export async function updateChildCost(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing child cost id");

  const payload = buildChildCostPayload(user.id, formData);
  const { error } = await applyMutableRecordFilter(
    supabase.from("child_costs").update(payload as any),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);
  revalidateChildCostPaths(String(formData.get("child_id") || ""));
}


export async function deletePerson(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("people").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
}

export async function deletePayEvent(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("pay_events").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function deleteChildCost(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("child_costs").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function addPayEventMonthlyOverride(formData: FormData) {
  const { supabase, user } = await requireUser();
  const payEventId = String(formData.get("pay_event_id") || "");
  const personId = String(formData.get("person_id") || "") || null;
  const month = String(formData.get("month") || "").slice(0, 7);
  if (!payEventId || !month) throw new Error("Missing pay event or month.");

  const { error } = await supabase.from("pay_event_monthly_overrides").upsert({
    user_id: user.id,
    pay_event_id: payEventId,
    person_id: personId,
    month,
    statutory_pay: parseNumber(formData.get("statutory_pay")) ?? 0,
    occupational_pay: parseNumber(formData.get("occupational_pay")) ?? 0,
    net_pay_override: parseNumber(formData.get("net_pay_override")),
    source: String(formData.get("source") || "manual"),
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,pay_event_id,month" });

  if (error) throw new Error(error.message);
  revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/income");
}

export async function deletePayEventMonthlyOverride(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const personId = String(formData.get("person_id") || "");
  if (!id) throw new Error("Missing override id.");
  const { error } = await supabase.from("pay_event_monthly_overrides").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/income");
}

function normaliseEmailOrUsername(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

function hashInviteToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashEmail(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function permissionFlagsForTier(tier: string) {
  return {
    can_manage_people: ["owner", "admin"].includes(tier),
    can_manage_child_profiles: ["owner", "admin", "parent"].includes(tier),
    can_view_household_income: ["owner", "admin"].includes(tier),
    can_manage_household_costs: ["owner", "admin", "parent"].includes(tier),
    can_manage_integrations: ["owner", "admin"].includes(tier),
  };
}

async function activeHouseholdForAction(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }) {
  const client = adminOrUserClient(supabase);
  const { data: profile } = await client.from("app_user_profiles").select("household_id").eq("user_id", user.id).maybeSingle();
  let query = client
    .from("app_household_members")
    .select("household_id, role, permission_tier, can_manage_people, can_manage_child_profiles")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (profile?.household_id) query = query.eq("household_id", profile.household_id);
  const { data: membership, error } = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!membership?.household_id) return null;
  const { data: household } = await client.from("app_households").select("id, owner_user_id, name, timezone, currency, status").eq("id", membership.household_id).neq("status", "deleted").maybeSingle();
  return { household, membership };
}

async function ensureCanManageHousehold(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }) {
  const context = await activeHouseholdForAction(supabase, user);
  if (!context?.household?.id) throw new Error("Create or join a household first.");
  const tier = context.membership?.permission_tier || "member";
  const canManage = ["owner", "admin"].includes(tier) || context.membership?.can_manage_people === true;
  if (!canManage) throw new Error("Only household owners/admins can manage household members and invites.");
  return context;
}

async function findExistingAuthUser(emailOrUsername: string) {
  if (!hasSupabaseAdminKey()) return null;
  const admin = createAdminClient();
  const value = emailOrUsername.trim().toLowerCase();
  if (value.startsWith("@")) {
    const username = value.slice(1);
    const { data: profile } = await admin.from("app_user_profiles").select("user_id, email").eq("username", username).maybeSingle();
    if (profile?.user_id) return { id: profile.user_id, email: profile.email || null };
    return null;
  }
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === value);
    if (found) return { id: found.id, email: found.email || value };
    if (data.users.length < 1000) break;
  }
  return null;
}

async function createHouseholdInviteRecord(args: {
  householdId: string;
  invitedByUserId: string;
  email: string | null;
  role: string;
  permissionTier: string;
  days: number;
}) {
  const writeClient = adminOrUserClient(await createClient());
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(rawToken);
  const shortCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const { data, error } = await writeClient
    .from("household_join_invites")
    .insert({
      household_id: args.householdId,
      invited_by_user_id: args.invitedByUserId,
      invited_email: args.email,
      invited_email_hash: args.email ? hashEmail(args.email) : null,
      token_hash: tokenHash,
      short_code: shortCode,
      role: args.role,
      permission_tier: args.permissionTier,
      expires_at: new Date(Date.now() + args.days * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id, short_code")
    .single();
  if (error) throw new Error(error.message);
  return { invite: data, rawToken };
}


async function syncCurrentUserSelfPerson(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null }
) {
  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("full_name, display_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();
  const name = String(profile?.display_name || profile?.full_name || user.email?.split("@")[0] || "Me").trim();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .eq("relationship", "self")
    .limit(1)
    .maybeSingle();

  const payload = {
    linked_user_id: user.id,
    household_id: householdContext.householdId,
    owner_user_id: user.id,
    visibility_scope: householdContext.householdId ? "household" : "private",
    email: user.email || null,
    invite_email: user.email || null,
    account_status: "linked",
    name,
    avatar_url: profile?.avatar_url || null,
    income_visible_to_household: true,
    costs_visible_to_household: true,
    household_can_add_costs: true,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from("people").update(payload).eq("id", existing.id).eq("user_id", user.id);
  } else {
    await supabase.from("people").insert({
      user_id: user.id,
      relationship: "self",
      active_from: new Date().toISOString().slice(0, 10),
      ...payload,
    });
  }
}


export async function createHouseholdFromHouseholdPage(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("household_name") || "").trim() || "My household";
  const timezone = String(formData.get("timezone") || "Europe/London").trim();
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const imageUrl = await householdImageUrlFromForm(supabase, user.id, formData, null);

  const { error } = await supabase.rpc("app_get_or_create_household", {
    p_name: name,
    p_timezone: timezone,
    p_currency: currency,
    p_image_url: imageUrl || null,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);

  await syncCurrentUserSelfPerson(supabase, user);
  revalidatePath("/household");
  revalidatePath("/account");
  revalidatePath("/dashboard");
  redirect("/household?created=1");
}

export async function createManagedChildProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const context = await ensureCanManageHousehold(supabase, user);
  const householdOwnerUserId = context.household!.owner_user_id || user.id;
  const name = String(formData.get("name") || "Child").trim();
  const birthDate = String(formData.get("birth_date") || "").trim();
  if (!birthDate) throw new Error("Birth date is required for managed child profiles.");
  const dob = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) throw new Error("Enter a valid birth date.");
  const sixteenYearsAgo = new Date();
  sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16);
  if (dob < sixteenYearsAgo) throw new Error("Managed household-created profiles are only allowed for children under 16. Adults must join with their own account.");

  const writeClient = adminOrUserClient(supabase);
  const avatarUrl = await avatarUrlFromForm(supabase, user.id, formData);
  const { data: child, error } = await writeClient.from("people").insert({
    user_id: householdOwnerUserId,
    name,
    relationship: "child",
    birth_date: birthDate,
    account_status: "child_managed",
    income_visible_to_household: true,
    costs_visible_to_household: true,
    household_can_add_costs: true,
    maturity_date: new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate()).toISOString().slice(0, 10),
    avatar_url: avatarUrl,
    active_from: new Date().toISOString().slice(0, 10),
  }).select("id").single();
  if (error) throw new Error(error.message);

  const guardianIds = formData.getAll("guardian_person_id").map(String).filter(Boolean);
  if (guardianIds.length > 0) {
    const { error: guardianError } = await writeClient.from("person_guardians").insert(guardianIds.map((guardianId) => ({
      user_id: householdOwnerUserId,
      child_person_id: child.id,
      guardian_person_id: guardianId,
      relationship_type: "parent_guardian",
    })));
    if (guardianError) throw new Error(guardianError.message);
  }

  revalidatePath("/household");
  revalidatePath("/dashboard");
}


export async function inviteExistingUserToHousehold(formData: FormData) {
  const { supabase, user } = await requireUser();
  const context = await ensureCanManageHousehold(supabase, user);
  const inviteTo = normaliseEmailOrUsername(formData.get("invite_to"));
  if (!inviteTo) throw new Error("Add an email or username to invite.");

  const email = inviteTo.includes("@") ? inviteTo : null;
  const role = String(formData.get("role") || "member");
  const permissionTier = String(formData.get("permission_tier") || "member");
  const days = Math.max(1, Math.min(60, Number(formData.get("expires_days") || 14)));
  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  const { data, error } = await supabase.rpc("app_create_household_invite", {
    p_household_id: context.household!.id,
    p_invited_email: email,
    p_role: role,
    p_permission_tier: permissionTier,
    p_expires_days: days,
    p_base_url: baseUrl,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);

  const invite = Array.isArray(data) ? data[0] : data;
  const link = invite?.join_link || `${baseUrl}/household/join?token=${encodeURIComponent(invite?.raw_token || invite?.short_code || "")}`;
  const householdName = context.household!.name || invite?.household_name || "a Loop household";

  if (email) {
    await sendTransactionalEmail({
      to: email,
      subject: `You’ve been invited to join ${householdName}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Review household invite</h2><p>${user.email || "Someone"} invited you to join <strong>${householdName}</strong> as <strong>${permissionTier}</strong>.</p><p>Your private data stays yours. You must accept before joining.</p><p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Review invite</a></p><p>This invite expires in ${days} days.</p></div>`,
      text: `${user.email || "Someone"} invited you to join ${householdName}. Review invite: ${link}. This invite expires in ${days} days.`,
    }).catch((error) => console.warn("[household] invite email failed", error));
  }

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: context.household!.id,
    event_type: "household_member_invited",
    status: "success",
    metadata: { invite_id: invite?.invite_id || null, email_hash: email ? hashEmail(email) : null, role, permission_tier: permissionTier, link },
  }).then(() => null, () => null);

  revalidatePath("/household");
  revalidatePath("/account");
}


export async function createOpenHouseholdQrInvite() {
  const { supabase, user } = await requireUser();
  const context = await ensureCanManageHousehold(supabase, user);
  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const { error } = await supabase.rpc("app_create_household_invite", {
    p_household_id: context.household!.id,
    p_invited_email: null,
    p_role: "member",
    p_permission_tier: "member",
    p_expires_days: 14,
    p_base_url: baseUrl,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);
  revalidatePath("/household");
}


export async function updateHouseholdMemberRole(formData: FormData) {
  const { supabase } = await requireUser();
  const memberId = String(formData.get("member_id") || "");
  const role = String(formData.get("role") || "member");
  const permissionTier = String(formData.get("permission_tier") || "member");
  if (!memberId) throw new Error("Missing member id.");
  if (permissionTier === "owner" || role === "owner") throw new Error("Owner transfer is not available here yet.");

  const { error } = await supabase.rpc("app_update_household_member_role", {
    p_member_id: memberId,
    p_role: role,
    p_permission_tier: permissionTier,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);
  revalidatePath("/household");
  revalidatePath("/account");
}


export async function removeHouseholdMember(formData: FormData) {
  const { supabase } = await requireUser();
  const memberId = String(formData.get("member_id") || "");
  if (!memberId) throw new Error("Missing member id.");

  const { error } = await supabase.rpc("app_remove_household_member", {
    p_member_id: memberId,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);
  revalidatePath("/household");
  revalidatePath("/account");
}


export async function requestProfileDataHandover(formData: FormData) {
  const { supabase } = await requireUser();
  const personId = String(formData.get("person_id") || "");
  const message = String(formData.get("message") || "").trim();
  if (!personId) throw new Error("Missing person id.");

  const { error } = await supabase.rpc("app_request_profile_data_claim", {
    p_person_id: personId,
    p_message: message || null,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_53_household_data_handover_delete.sql in Supabase.`);

  revalidatePath("/household");
  revalidatePath(`/household/${personId}`);
  revalidatePath("/notifications");
}

export async function deleteHousehold(formData: FormData) {
  const { supabase } = await requireUser();
  const householdId = String(formData.get("household_id") || "");
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (!householdId) throw new Error("Missing household id.");

  const { error } = await supabase.rpc("app_delete_household", {
    p_household_id: householdId,
    p_confirmation: confirmation,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_53_household_data_handover_delete.sql in Supabase.`);

  revalidatePath("/household");
  revalidatePath("/account");
  revalidatePath("/dashboard");
  redirect("/account?tab=sharing&householdDeleted=1");
}


export async function leaveHousehold(formData: FormData) {
  const { supabase } = await requireUser();
  const householdId = String(formData.get("household_id") || "");
  if (!householdId) throw new Error("Missing household id.");

  const { error } = await supabase.rpc("app_leave_household", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase.`);
  revalidatePath("/household");
  revalidatePath("/account");
  redirect("/account?tab=sharing&left=1");
}

export async function addHouseholdPet(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  if (!householdContext.householdId) throw new Error("Create or join a household before adding a pet.");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Add the pet's name.");
  const { error } = await supabase.from("household_pets").insert({
    user_id: user.id,
    household_id: householdContext.householdId,
    name,
    species: String(formData.get("species") || "dog"),
    breed: String(formData.get("breed") || "").trim() || null,
    birth_date: String(formData.get("birth_date") || "") || null,
    insurer: String(formData.get("insurer") || "").trim() || null,
    vet_name: String(formData.get("vet_name") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/spending");
}

export async function archiveHouseholdPet(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id || !householdContext.householdId) return;
  const { error } = await supabase.from("household_pets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("household_id", householdContext.householdId);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/spending");
}

export async function saveHouseholdCarbonProfile(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  if (!householdContext.householdId) throw new Error("Create or join a household first.");
  const { error } = await supabase.from("household_carbon_profiles").upsert({
    user_id: user.id,
    household_id: householdContext.householdId,
    food_assumption_adopted: formData.get("food_assumption_adopted") === "on",
    annual_offset_kg: Math.max(0, parseNumber(formData.get("annual_offset_kg")) || 0),
    offset_provider: String(formData.get("offset_provider") || "").trim() || null,
    offset_notes: String(formData.get("offset_notes") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "household_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
}

export async function adoptHouseholdFoodAssumption() {
  const { supabase, user, householdContext } = await requireUser();
  if (!householdContext.householdId) throw new Error("Create or join a household first.");
  const { error } = await supabase.from("household_carbon_profiles").upsert({
    user_id: user.id,
    household_id: householdContext.householdId,
    food_assumption_adopted: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "household_id" });
  if (error) throw new Error(error.message);

  const { data: people } = await supabase.from("people").select("id, relationship").in("user_id", householdContext.memberUserIds).is("active_until", null);
  const adults = (people || []).filter((person: any) => String(person.relationship || "").toLowerCase() !== "child").length || 1;
  const children = (people || []).filter((person: any) => String(person.relationship || "").toLowerCase() === "child").length;
  const monthlyAmount = Math.round((220 + adults * 55 + children * 35) / 5) * 5;
  const visibleFilter = visibleDataOrFilter(householdContext);
  let { data: category } = await supabase.from("spending_categories").select("id").eq("standard_category_key", "food").or(visibleFilter).limit(1).maybeSingle();
  if (!category) {
    const created = await supabase.from("spending_categories").insert({
      ...householdWriteFields(householdContext, user.id),
      name: "Food shopping",
      type: "variable",
      standard_category_key: "food",
      monthly_budget: monthlyAmount,
    }).select("id").single();
    if (created.error) throw new Error(created.error.message);
    category = created.data;
  }
  const marker = "[household_assumption:food]";
  const { data: existing } = await supabase.from("planned_items").select("id").eq("household_id", householdContext.householdId).ilike("notes", `%${marker}%`).limit(1).maybeSingle();
  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: null,
    category_id: category.id,
    direction: "outgoing",
    label: "Food shopping assumption",
    amount: monthlyAmount,
    recurrence: "monthly",
    item_type: "monthly_cost",
    start_date: new Date().toISOString().slice(0, 7) + "-01",
    notes: `${marker} Adopted ONS-based household planning estimate. Replace with actual shopping when available.`,
  };
  const planResult = existing?.id
    ? await supabase.from("planned_items").update(payload).eq("id", existing.id)
    : await supabase.from("planned_items").insert(payload);
  if (planResult.error) throw new Error(planResult.error.message);
  revalidatePath("/household");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

export async function addHouseholdVehicle(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  if (!householdContext.householdId) throw new Error("Create or join a household first.");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Give the vehicle a name.");
  const { error } = await supabase.from("household_vehicles").insert({
    user_id: user.id,
    household_id: householdContext.householdId,
    name,
    registration: String(formData.get("registration") || "").replace(/\s+/g, "").toUpperCase() || null,
    owner_person_id: String(formData.get("owner_person_id") || "") || null,
    make_model: String(formData.get("make_model") || "").trim() || null,
    fuel_type: String(formData.get("fuel_type") || "petrol"),
    annual_miles: parseNumber(formData.get("annual_miles")),
    mpg: parseNumber(formData.get("mpg")),
    monthly_finance: parseNumber(formData.get("monthly_finance")),
    insurer: String(formData.get("insurer") || "").trim() || null,
    insurance_renewal_date: String(formData.get("insurance_renewal_date") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
}
