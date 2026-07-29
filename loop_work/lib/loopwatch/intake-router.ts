import { generateHolidayPeriodsFromTerms, parseSchoolCalendarText } from "@/lib/family/school-calendar-parser";
import type { LoopWatchExtraction } from "@/lib/loopwatch/extract";

export type LoopWatchPersonCandidate = {
  id: string;
  name: string;
  relationship?: string | null;
};

export type LoopWatchRoutingSuggestion = {
  type:
    | "confirm_details"
    | "track_renewal"
    | "sync_financial_flow"
    | "import_school_calendar"
    | "create_family_reminder"
    | "childcare_cost_forecast"
    | "insurance_cover_review"
    | "provider_increase_rule"
    | "savings_rate_watch"
    | "mortgage_watch"
    | "vehicle_watch"
    | "employment_review"
    | "manual_review";
  title: string;
  question: string;
  summary: string;
  confidence: number;
  target: "loopwatch" | "financial_flow" | "family_planning" | "savings" | "mortgage" | "vehicle" | "admin";
  action: "confirm" | "sync_cost" | "import_calendar" | "run_watch" | "review" | "admin_rule";
  payload?: Record<string, unknown>;
};

export type LoopWatchRouting = {
  intakeCategory:
    | "insurance_policy"
    | "household_bill"
    | "wealth_account"
    | "family_school"
    | "vehicle"
    | "employment"
    | "property_home"
    | "general_admin";
  routingSummary: string;
  suggestedOwnerPersonId: string | null;
  suggestedOwnerName: string | null;
  suggestedOwnerConfidence: number;
  detectedPersonName: string | null;
  suggestions: LoopWatchRoutingSuggestion[];
};

const INSURANCE_TYPES = new Set(["car_insurance", "home_insurance", "life_insurance", "pet_insurance", "travel_insurance"]);
const TELECOM_TYPES = new Set(["mobile_contract", "broadband_contract", "utility_contract", "council_tax_bill", "bill_statement"]);
const SCHOOL_TYPES = new Set(["school_nursery_contract", "school_calendar", "school_agenda"]);
const VEHICLE_TYPES = new Set(["car_finance", "vehicle_contract", "vehicle_service", "warranty"]);

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function firstName(name: string) {
  return normalise(name).split(" ").filter(Boolean)[0] || "";
}

function isChild(person: LoopWatchPersonCandidate) {
  return /child|son|daughter|baby|dependant|nursery|school/i.test(String(person.relationship || ""));
}

function inferIntakeCategory(itemType: string): LoopWatchRouting["intakeCategory"] {
  if (INSURANCE_TYPES.has(itemType)) return "insurance_policy";
  if (TELECOM_TYPES.has(itemType)) return "household_bill";
  if (itemType === "savings_terms" || itemType === "mortgage_offer") return "wealth_account";
  if (SCHOOL_TYPES.has(itemType)) return "family_school";
  if (VEHICLE_TYPES.has(itemType)) return "vehicle";
  if (itemType === "employment_contract") return "employment";
  if (itemType === "tenancy_agreement") return "property_home";
  return "general_admin";
}

function suggestOwner(args: {
  text: string;
  filename: string;
  userNote?: string | null;
  selectedOwnerPersonId?: string | null;
  people: LoopWatchPersonCandidate[];
  itemType: string;
}) {
  if (args.selectedOwnerPersonId) {
    const chosen = args.people.find((person) => person.id === args.selectedOwnerPersonId) || null;
    return {
      suggestedOwnerPersonId: args.selectedOwnerPersonId,
      suggestedOwnerName: chosen?.name || null,
      suggestedOwnerConfidence: 1,
      detectedPersonName: chosen?.name || null,
    };
  }

  const haystack = normalise([args.filename, args.userNote, args.text.slice(0, 8000)].filter(Boolean).join(" "));
  let best: { person: LoopWatchPersonCandidate; score: number; detected: string } | null = null;
  for (const person of args.people) {
    const full = normalise(person.name);
    const first = firstName(person.name);
    let score = 0;
    let detected = "";
    if (full && haystack.includes(full)) {
      score += 0.92;
      detected = person.name;
    } else if (first && first.length >= 3 && new RegExp(`\\b${first}\\b`, "i").test(haystack)) {
      score += 0.78;
      detected = person.name;
    }
    if (SCHOOL_TYPES.has(args.itemType) && isChild(person)) score += 0.08;
    if (score > (best?.score || 0)) best = { person, score: Math.min(0.98, score), detected };
  }

  const children = args.people.filter(isChild);
  if ((!best || best.score < 0.55) && SCHOOL_TYPES.has(args.itemType) && children.length === 1) {
    best = { person: children[0], score: 0.66, detected: children[0].name };
  }

  return {
    suggestedOwnerPersonId: best && best.score >= 0.55 ? best.person.id : null,
    suggestedOwnerName: best && best.score >= 0.55 ? best.person.name : null,
    suggestedOwnerConfidence: best?.score || 0,
    detectedPersonName: best?.detected || null,
  };
}

function costQuestion(extraction: LoopWatchExtraction) {
  const amount = extraction.paymentAmount || (extraction.annualCost ? Math.round((extraction.annualCost / 12) * 100) / 100 : null);
  if (!amount) return null;
  const frequency = extraction.paymentAmount ? extraction.paymentFrequency || "monthly" : "monthly";
  return `This looks like ${extraction.providerName || "a provider"} at £${amount} ${frequency}. Do you want Loop to put this into the household financial forecast?`;
}

function schoolNameFromText(text: string) {
  const school = text.match(/([A-Z][A-Za-z'&. -]{3,80}\s(?:School|Nursery|Academy|College))/)?.[1];
  return school ? school.replace(/\s+/g, " ").trim() : null;
}

function academicYearFromText(text: string) {
  const match = text.match(/\b(20\d{2})\s*[/-]\s*(20\d{2}|\d{2})\b/);
  if (!match) return null;
  const end = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${match[1]}/${end}`;
}

export function routeLoopWatchIntake(args: {
  extraction: LoopWatchExtraction;
  text: string;
  filename: string;
  userNote?: string | null;
  selectedOwnerPersonId?: string | null;
  people: LoopWatchPersonCandidate[];
}): LoopWatchRouting {
  const parsedSchoolForRouting = parseSchoolCalendarText(args.text);
  const extractedType = String(args.extraction.documentType || "general_contract");
  const itemType = (parsedSchoolForRouting.terms.length >= 2 || parsedSchoolForRouting.insetDays.length >= 2 || /term dates|inset days?|school holidays?|academic year/i.test(args.text)) ? "school_calendar" : extractedType;
  const intakeCategory = inferIntakeCategory(itemType);
  const owner = suggestOwner({
    text: args.text,
    filename: args.filename,
    userNote: args.userNote,
    selectedOwnerPersonId: args.selectedOwnerPersonId,
    people: args.people,
    itemType,
  });
  const suggestions: LoopWatchRoutingSuggestion[] = [];
  const typeLabel = itemType.replace(/_/g, " ");
  const ownerBit = owner.suggestedOwnerName ? ` for ${owner.suggestedOwnerName}` : "";

  suggestions.push({
    type: "confirm_details",
    title: "Confirm extracted details",
    question: `This looks like a ${typeLabel}${ownerBit}. Is that right?`,
    summary: "Loop will only use the dates, cost and terms after the user confirms the card.",
    confidence: Math.max(0.35, Number(args.extraction.confidence?.documentType || 0.55)),
    target: "loopwatch",
    action: "confirm",
    payload: { item_type: itemType, suggested_owner_person_id: owner.suggestedOwnerPersonId },
  });

  const trackedDate = args.extraction.renewalDate || args.extraction.endDate;
  if (trackedDate) {
    suggestions.push({
      type: "track_renewal",
      title: "Track renewal/end date",
      question: `Should LoopWatch track ${trackedDate} and remind the household before it becomes urgent?`,
      summary: "Creates comparison, renewal and notice-window reminders without storing the source document.",
      confidence: 0.82,
      target: "loopwatch",
      action: "run_watch",
      payload: { tracked_date: trackedDate, notice_period_days: args.extraction.noticePeriodDays || null },
    });
  }

  const costPrompt = costQuestion(args.extraction);
  if (costPrompt) {
    suggestions.push({
      type: "sync_financial_flow",
      title: "Add to Financial Flow",
      question: costPrompt,
      summary: "Creates or updates the monthly planned cost after user confirmation.",
      confidence: Number(args.extraction.confidence?.paymentAmount || 0.75),
      target: "financial_flow",
      action: "sync_cost",
      payload: {
        payment_amount: args.extraction.paymentAmount,
        payment_frequency: args.extraction.paymentFrequency,
        annual_cost: args.extraction.annualCost,
        provider_name: args.extraction.providerName,
      },
    });
  }

  if (SCHOOL_TYPES.has(itemType) || /term dates|inset day|school holiday|parents evening|school trip|agenda|homework/i.test(args.text)) {
    const parsed = parsedSchoolForRouting;
    const holidayPeriods = generateHolidayPeriodsFromTerms(parsed.terms);
    if (parsed.terms.length || parsed.insetDays.length || parsed.bankHolidays.length) {
      suggestions.push({
        type: "import_school_calendar",
        title: "Import school dates",
        question: `This looks like school/nursery dates${owner.suggestedOwnerName ? ` for ${owner.suggestedOwnerName}` : ""}. Add them to Family Planning?`,
        summary: `${holidayPeriods.length} holiday periods, ${parsed.insetDays.length} inset days and ${parsed.bankHolidays.length} bank holidays were detected.`,
        confidence: parsed.confidence / 100,
        target: "family_planning",
        action: "import_calendar",
        payload: {
          terms: parsed.terms,
          holiday_periods: holidayPeriods,
          inset_days: parsed.insetDays,
          bank_holidays: parsed.bankHolidays,
          school_name: schoolNameFromText(args.text),
          academic_year: academicYearFromText(args.text),
          notes: parsed.notes,
        },
      });
    } else {
      suggestions.push({
        type: "create_family_reminder",
        title: "Family/school reminder",
        question: `This looks like a school or nursery notice${owner.suggestedOwnerName ? ` for ${owner.suggestedOwnerName}` : ""}. Keep it as a family reminder card?`,
        summary: "LoopWatch did not confidently find a term-date table, so it will keep a review card and ask for manual dates.",
        confidence: 0.45,
        target: "family_planning",
        action: "review",
        payload: {},
      });
    }
  }

  if (INSURANCE_TYPES.has(itemType)) {
    suggestions.push({
      type: "insurance_cover_review",
      title: "Insurance cover check",
      question: "Should LoopWatch flag cover gaps like missing cover level, high excess, mileage limits or auto-renewal?",
      summary: "This is a safety check only, not regulated insurance advice.",
      confidence: 0.78,
      target: "loopwatch",
      action: "run_watch",
      payload: { flags_only: true },
    });
  }

  if (itemType === "mobile_contract" || itemType === "broadband_contract") {
    suggestions.push({
      type: "provider_increase_rule",
      title: "Price increase logic",
      question: "Do you want LoopWatch to apply provider annual increase logic once the provider is confirmed?",
      summary: "Useful for mobile/broadband where disclosed annual increases can be projected into household costs.",
      confidence: 0.72,
      target: "admin",
      action: "admin_rule",
      payload: { provider_name: args.extraction.providerName, item_type: itemType },
    });
  }

  if (itemType === "savings_terms") {
    suggestions.push({
      type: "savings_rate_watch",
      title: "Savings rate watch",
      question: "Should LoopWatch compare this savings rate against the savings catalogue and track maturity?",
      summary: "Good for fixed-rate maturity, variable-rate drops and better-rate alerts.",
      confidence: 0.8,
      target: "savings",
      action: "run_watch",
      payload: { interest_rate_percent: args.extraction.interestRatePercent },
    });
  }

  if (itemType === "mortgage_offer") {
    suggestions.push({
      type: "mortgage_watch",
      title: "Mortgage watch",
      question: "Should this mortgage document feed the mortgage renewal/deal watch after the balance and fixed-end date are confirmed?",
      summary: "Loop can use rate, APR, end date and notice windows to warn before the deal ends.",
      confidence: 0.76,
      target: "mortgage",
      action: "run_watch",
      payload: { interest_rate_percent: args.extraction.interestRatePercent, apr_percent: args.extraction.aprPercent },
    });
  }

  if (VEHICLE_TYPES.has(itemType)) {
    suggestions.push({
      type: "vehicle_watch",
      title: "Vehicle watch",
      question: "Should LoopWatch track mileage, renewal, warranty or finance-end points for this vehicle item?",
      summary: "Useful for PCP mileage caps, optional final payment, warranty expiry and renewal windows.",
      confidence: 0.72,
      target: "vehicle",
      action: "run_watch",
      payload: { mileage_limit: args.extraction.mileageLimit, apr_percent: args.extraction.aprPercent },
    });
  }

  if (itemType === "employment_contract") {
    suggestions.push({
      type: "employment_review",
      title: "Employment terms summary",
      question: "Keep notice period, salary/review dates and holiday entitlement as a private reference?",
      summary: "Loop can hold key terms without storing the source contract.",
      confidence: 0.62,
      target: "loopwatch",
      action: "review",
      payload: {},
    });
  }

  const routingSummary = suggestions[0]?.question || `LoopWatch created a ${typeLabel} review card.`;
  return {
    intakeCategory,
    routingSummary,
    suggestedOwnerPersonId: owner.suggestedOwnerPersonId,
    suggestedOwnerName: owner.suggestedOwnerName,
    suggestedOwnerConfidence: owner.suggestedOwnerConfidence,
    detectedPersonName: owner.detectedPersonName,
    suggestions: suggestions.slice(0, 8),
  };
}
