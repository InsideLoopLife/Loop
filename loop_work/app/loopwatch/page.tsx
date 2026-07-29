import { redirect } from "next/navigation";
import { BellRing, CalendarClock, CheckCircle2, FileText, RefreshCw, ShieldCheck, Sparkles, Trash2, WalletCards } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { createClient } from "@/lib/supabase/server";
import { dedupeHouseholdPeople, getActiveHouseholdContext, householdMemberDataOrFilter, householdPeopleOrFilter } from "@/lib/auth/household-context";
import { formatMoney } from "@/lib/format/money";
import { LoopWatchUploadClient, type LoopWatchPerson } from "@/components/loopwatch/LoopWatchUploadClient";
import { LoopWatchDiscoverClient } from "@/components/loopwatch/LoopWatchDiscoverClient";
import { applyLoopWatchCostAction, applyLoopWatchSchoolCalendarAction, archiveLoopWatchItem, confirmLoopWatchItem, dismissLoopWatchOpportunityAction, runLoopWatchItemAction, updateLoopWatchItem } from "./actions";

type LoopWatchItem = {
  id: string;
  user_id: string;
  household_id: string | null;
  owner_person_id: string | null;
  item_type: string;
  provider_name: string | null;
  product_name: string | null;
  reference_hint: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  notice_period_days: number | null;
  payment_amount: number | null;
  payment_frequency: string | null;
  annual_cost: number | null;
  auto_renews: boolean | null;
  cover_level: string | null;
  excess_total: number | null;
  mileage_limit: number | null;
  interest_rate_percent: number | null;
  apr_percent: number | null;
  cancellation_summary: string | null;
  increase_summary: string | null;
  summary: string | null;
  risk_flags_json: string[] | null;
  confidence_json: Record<string, number> | null;
  confidence_score: number | null;
  current_monthly_cost?: number | null;
  projected_monthly_cost?: number | null;
  projected_annual_cost?: number | null;
  next_increase_date?: string | null;
  next_increase_amount?: number | null;
  increase_source?: string | null;
  linked_planned_item_id?: string | null;
  next_price_check_at?: string | null;
  price_check_cadence_days?: number | null;
  bill_allocation_mode?: string | null;
  review_state?: string | null;
  suggested_owner_person_id?: string | null;
  detected_person_name?: string | null;
  intake_category?: string | null;
  routing_status?: string | null;
  routing_summary?: string | null;
  routing_suggestions_json?: Array<{ type?: string; title?: string; question?: string; summary?: string; confidence?: number; target?: string; action?: string; payload?: Record<string, unknown> }> | null;
  last_watch_checked_at?: string | null;
  watch_status?: string | null;
  watch_summary?: string | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  loopwatch_document_jobs?: {
    original_filename: string | null;
    source_file_deleted_at: string | null;
    extraction_warning: string | null;
    extraction_method: string | null;
  } | null;
};

type LoopWatchEvent = {
  id: string;
  loopwatch_item_id: string;
  event_type: string;
  event_date: string;
  status: string;
  message: string;
};


type LoopWatchPlannedItem = {
  id: string;
  label: string;
  amount: number | null;
  item_type: string | null;
  direction: string | null;
  person_id: string | null;
  category_id: string | null;
  brand_name?: string | null;
};

type LoopWatchOpportunity = {
  id: string;
  loopwatch_item_id: string;
  opportunity_type: string;
  status: string;
  priority: number;
  title: string;
  summary: string | null;
  due_date: string | null;
  estimated_monthly_change: number | null;
  estimated_annual_change: number | null;
  action_href: string | null;
};

type Person = LoopWatchPerson & { linked_user_id?: string | null; user_id?: string | null };

function prettyType(value?: string | null) {
  return String(value || "general_contract")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateLabel(value?: string | null) {
  if (!value) return "Not found";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

function initials(name?: string | null) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function PersonBadge({ person }: { person?: Person | null }) {
  if (!person) return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">Household</span>;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-xs font-black text-slate-700">
      <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-slate-950 text-[10px] text-white">
        {person.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.avatar_url} alt={person.name} className="h-full w-full object-cover" />
        ) : (
          initials(person.name)
        )}
      </span>
      {person.name}
    </span>
  );
}

function itemUrgency(item: LoopWatchItem) {
  const tracked = item.renewal_date || item.end_date;
  const days = daysUntil(tracked);
  if (days === null) return { label: "Needs date", className: "bg-amber-100 text-amber-800" };
  if (days < 0) return { label: "Past date", className: "bg-red-100 text-red-700" };
  if (days <= 30) return { label: `${days} days`, className: "bg-red-100 text-red-700" };
  if (days <= 90) return { label: `${days} days`, className: "bg-orange-100 text-orange-700" };
  return { label: `${days} days`, className: "bg-emerald-100 text-emerald-700" };
}

function SelectType({ defaultValue }: { defaultValue?: string | null }) {
  const options = [
    "car_insurance",
    "home_insurance",
    "life_insurance",
    "pet_insurance",
    "travel_insurance",
    "car_finance",
    "vehicle_contract",
    "mortgage_offer",
    "savings_terms",
    "broadband_contract",
    "mobile_contract",
    "utility_contract",
    "employment_contract",
    "tenancy_agreement",
    "warranty",
    "school_nursery_contract",
    "school_calendar",
    "school_agenda",
    "bill_statement",
    "council_tax_bill",
    "appointment_letter",
    "vehicle_service",
    "general_contract",
  ];
  return (
    <select name="item_type" defaultValue={defaultValue || "general_contract"} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950">
      {options.map((option) => <option key={option} value={option}>{prettyType(option)}</option>)}
    </select>
  );
}

function Field({ label, name, defaultValue, type = "text", step }: { label: string; name: string; defaultValue?: string | number | null; type?: string; step?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
      <input name={name} type={type} step={step} defaultValue={defaultValue ?? ""} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2" />
    </label>
  );
}

function AutoRenewSelect({ value }: { value: boolean | null }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-400">Auto-renewal</span>
      <select name="auto_renews" defaultValue={value === true ? "true" : value === false ? "false" : ""} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950">
        <option value="">Not found</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

function PaymentFrequencySelect({ value }: { value: string | null }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-400">Frequency</span>
      <select name="payment_frequency" defaultValue={value || ""} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950">
        <option value="">Not found</option>
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
        <option value="weekly">Weekly</option>
        <option value="quarterly">Quarterly</option>
        <option value="one_off">One-off</option>
      </select>
    </label>
  );
}

function OwnerSelect({ people, value }: { people: Person[]; value: string | null }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-400">Owner</span>
      <select name="owner_person_id" defaultValue={value || ""} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950">
        <option value="">Household / shared</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </label>
  );
}

function ExistingBillSelect({ plannedItems, value }: { plannedItems: LoopWatchPlannedItem[]; value?: string | null }) {
  const billRows = plannedItems.filter((item) => String(item.direction || "outgoing") === "outgoing");
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-400">Allocate to existing bill</span>
      <select name="linked_planned_item_id" defaultValue={value || ""} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950">
        <option value="">Create or auto-match Financial Flow bill</option>
        {billRows.map((item) => (
          <option key={item.id} value={item.id}>{item.label} · {formatMoney(Number(item.amount || 0))}/mo</option>
        ))}
      </select>
    </label>
  );
}

function LoopWatchItemCard({ item, people, events, opportunities, plannedItems }: { item: LoopWatchItem; people: Person[]; events: LoopWatchEvent[]; opportunities: LoopWatchOpportunity[]; plannedItems: LoopWatchPlannedItem[] }) {
  const owner = people.find((person) => person.id === item.owner_person_id) || null;
  const riskFlags = Array.isArray(item.risk_flags_json) ? item.risk_flags_json : [];
  const urgency = itemUrgency(item);
  const confirmed = item.status === "confirmed";
  const warning = item.loopwatch_document_jobs?.extraction_warning;
  const routingSuggestions = Array.isArray(item.routing_suggestions_json) ? item.routing_suggestions_json : [];
  const hasSchoolImport = routingSuggestions.some((suggestion) => suggestion.type === "import_school_calendar");
  const suggestedOwner = people.find((person) => person.id === item.suggested_owner_person_id) || null;
  const hasCost = Boolean(item.payment_amount || item.annual_cost || item.current_monthly_cost);
  const projectedMove = item.current_monthly_cost && item.projected_monthly_cost && item.projected_monthly_cost !== item.current_monthly_cost
    ? item.projected_monthly_cost - item.current_monthly_cost
    : null;

  return (
    <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-60px_rgba(15,23,42,.7)]">
      <div className="border-b border-slate-100 bg-slate-50/80 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">{prettyType(item.item_type)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${urgency.className}`}>{urgency.label}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{confirmed ? "Confirmed" : "Needs review"}</span>
            </div>
            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">{item.provider_name || "Provider not found"}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">{item.product_name || item.summary || "Review extracted details"}</p>
          </div>
          <PersonBadge person={owner} />
        </div>

        {(item.routing_summary || suggestedOwner || item.intake_category) ? (
          <div className="mt-4 rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
            <p className="text-xs font-black uppercase tracking-wide text-orange-700">LoopWatch suggestion</p>
            <p className="mt-1 text-sm font-black text-orange-950">{item.routing_summary || `This looks like ${prettyType(item.item_type)}.`}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-orange-800">
              {item.intake_category ? <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-100">{prettyType(item.intake_category)}</span> : null}
              {suggestedOwner ? <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-100">Suggested owner: {suggestedOwner.name}</span> : null}
              {item.routing_status ? <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-100">{prettyType(item.routing_status)}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Renewal / end</p>
            <p className="mt-1 text-lg font-black text-slate-950">{dateLabel(item.renewal_date || item.end_date)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cost</p>
            <p className="mt-1 text-lg font-black text-slate-950">{item.payment_amount ? `${formatMoney(item.payment_amount)} ${item.payment_frequency || ""}` : "Not found"}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Confidence</p>
            <p className="mt-1 text-lg font-black text-slate-950">{item.confidence_score ? `${Math.round(item.confidence_score * 100)}%` : "Review"}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Watch</p>
            <p className="mt-1 text-lg font-black text-slate-950">{item.watch_status === "opportunities" ? `${opportunities.length} actions` : item.watch_status === "ok" ? "OK" : "Not checked"}</p>
          </div>
        </div>
      </div>

      <form action={updateLoopWatchItem} className="space-y-4 p-5">
        <input type="hidden" name="id" value={item.id} />
        <div className="grid gap-3 md:grid-cols-4">
          <OwnerSelect people={people} value={item.owner_person_id} />
          <label className="block md:col-span-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Type</span>
            <div className="mt-1"><SelectType defaultValue={item.item_type} /></div>
          </label>
          <Field label="Provider" name="provider_name" defaultValue={item.provider_name} />
          <Field label="Product / policy" name="product_name" defaultValue={item.product_name} />
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Start" name="start_date" type="date" defaultValue={item.start_date} />
          <Field label="End" name="end_date" type="date" defaultValue={item.end_date} />
          <Field label="Renewal" name="renewal_date" type="date" defaultValue={item.renewal_date} />
          <Field label="Notice days" name="notice_period_days" type="number" defaultValue={item.notice_period_days} />
          <AutoRenewSelect value={item.auto_renews} />
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Payment" name="payment_amount" type="number" step="0.01" defaultValue={item.payment_amount} />
          <PaymentFrequencySelect value={item.payment_frequency} />
          <Field label="Annual cost" name="annual_cost" type="number" step="0.01" defaultValue={item.annual_cost} />
          <Field label="Excess" name="excess_total" type="number" step="0.01" defaultValue={item.excess_total} />
          <Field label="Mileage" name="mileage_limit" type="number" defaultValue={item.mileage_limit} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ExistingBillSelect plannedItems={plannedItems} value={item.linked_planned_item_id} />
          <Field label="Next price check" name="next_price_check_at" type="date" defaultValue={item.next_price_check_at} />
          <Field label="Check every days" name="price_check_cadence_days" type="number" defaultValue={item.price_check_cadence_days || 90} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Cover level" name="cover_level" defaultValue={item.cover_level} />
          <Field label="Interest %" name="interest_rate_percent" type="number" step="0.01" defaultValue={item.interest_rate_percent} />
          <Field label="APR %" name="apr_percent" type="number" step="0.01" defaultValue={item.apr_percent} />
          <Field label="Summary" name="summary" defaultValue={item.summary} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Cancellation / exit terms</span>
            <textarea name="cancellation_summary" defaultValue={item.cancellation_summary || ""} rows={3} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2" />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Price increase / renewal terms</span>
            <textarea name="increase_summary" defaultValue={item.increase_summary || ""} rows={3} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2" />
          </label>
        </div>

        {(item.current_monthly_cost || item.projected_monthly_cost || item.next_increase_date || item.watch_summary) ? (
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-950"><WalletCards className="h-4 w-4" /> Cost and renewal logic</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Current monthly</p>
                <p className="font-black text-slate-950">{item.current_monthly_cost ? formatMoney(item.current_monthly_cost) : "—"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Projected monthly</p>
                <p className="font-black text-slate-950">{item.projected_monthly_cost ? formatMoney(item.projected_monthly_cost) : "—"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Next increase</p>
                <p className="font-black text-slate-950">{item.next_increase_date ? dateLabel(item.next_increase_date) : "—"}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Movement</p>
                <p className="font-black text-slate-950">{projectedMove ? `${projectedMove > 0 ? "+" : ""}${formatMoney(projectedMove)}/mo` : "—"}</p>
              </div>
            </div>
            {item.watch_summary ? <p className="mt-3 text-sm font-bold text-emerald-900">{item.watch_summary}</p> : null}
          </div>
        ) : null}

        {routingSuggestions.length > 0 ? (
          <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
            <p className="flex items-center gap-2 text-sm font-black text-blue-950"><Sparkles className="h-4 w-4" /> Smart setup questions</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {routingSuggestions.slice(0, 6).map((suggestion, index) => (
                <div key={`${suggestion.type || "suggestion"}-${index}`} className="rounded-xl bg-white p-3 text-sm ring-1 ring-blue-100">
                  <p className="font-black text-slate-950">{suggestion.title || "LoopWatch suggestion"}</p>
                  <p className="mt-1 font-bold text-slate-600">{suggestion.question || suggestion.summary}</p>
                  {typeof suggestion.confidence === "number" ? <p className="mt-2 text-xs font-black text-blue-700">Confidence {Math.round(suggestion.confidence * 100)}%</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {opportunities.length > 0 ? (
          <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
            <p className="flex items-center gap-2 text-sm font-black text-orange-950"><Sparkles className="h-4 w-4" /> LoopWatch actions</p>
            <div className="mt-3 space-y-2">
              {opportunities.map((opportunity) => (
                <div key={opportunity.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-orange-100">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-950">{opportunity.title}</p>
                      <p className="mt-1 font-bold text-slate-600">{opportunity.summary}</p>
                    </div>
                    {opportunity.due_date ? <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">{dateLabel(opportunity.due_date)}</span> : null}
                  </div>
                  <button form={`dismiss-loopwatch-opportunity-${opportunity.id}`} className="mt-2 text-xs font-black text-slate-500 underline" type="submit">Dismiss</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {riskFlags.length > 0 || warning ? (
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <p className="text-sm font-black text-amber-900">Review flags</p>
            <ul className="mt-2 space-y-1 text-sm font-bold text-amber-800">
              {warning ? <li>• {warning}</li> : null}
              {riskFlags.map((flag, index) => <li key={`${flag}-${index}`}>• {flag}</li>)}
            </ul>
          </div>
        ) : null}

        {events.length > 0 ? (
          <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
            <p className="flex items-center gap-2 text-sm font-black text-blue-950"><CalendarClock className="h-4 w-4" /> Scheduled LoopWatch points</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {events.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-900 ring-1 ring-blue-100">
                  <span className="font-black">{dateLabel(event.event_date)}</span> · {event.message}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15" type="submit">Save edits</button>
          <button formAction={confirmLoopWatchItem} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/15" type="submit"><CheckCircle2 className="h-4 w-4" /> Confirm & watch</button>
          <button formAction={runLoopWatchItemAction} className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-5 py-3 text-sm font-black text-orange-800" type="submit"><RefreshCw className="h-4 w-4" /> Run checks</button>
          <button formAction={applyLoopWatchCostAction} disabled={!hasCost} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-40" type="submit"><WalletCards className="h-4 w-4" /> Sync cost</button>
          <button formAction={applyLoopWatchSchoolCalendarAction} disabled={!hasSchoolImport} className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-5 py-3 text-sm font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40" type="submit"><CalendarClock className="h-4 w-4" /> Import school dates</button>
          <button formAction={archiveLoopWatchItem} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-5 py-3 text-sm font-black text-red-600" type="submit"><Trash2 className="h-4 w-4" /> Archive</button>
        </div>
      </form>
      {opportunities.map((opportunity) => (
        <form key={`dismiss-form-${opportunity.id}`} id={`dismiss-loopwatch-opportunity-${opportunity.id}`} action={dismissLoopWatchOpportunityAction} className="hidden">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
        </form>
      ))}
    </article>
  );
}

export default async function LoopWatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataFilter = householdMemberDataOrFilter(householdContext);
  const peopleFilter = householdPeopleOrFilter(householdContext);

  const [{ data: peopleRows }, { data: items }, { data: events }, { data: opportunities }, { data: plannedItems }] = await Promise.all([
    supabase
      .from("people")
      .select("id, user_id, linked_user_id, name, relationship, avatar_url, account_status, active_until")
      .or(peopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .order("name"),
    supabase
      .from("loopwatch_items")
      .select("*, loopwatch_document_jobs(original_filename, source_file_deleted_at, extraction_warning, extraction_method)")
      .or(dataFilter)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<LoopWatchItem[]>(),
    supabase
      .from("loopwatch_events")
      .select("id, loopwatch_item_id, event_type, event_date, status, message")
      .or(dataFilter)
      .eq("status", "scheduled")
      .order("event_date", { ascending: true })
      .limit(150)
      .returns<LoopWatchEvent[]>(),
    supabase
      .from("loopwatch_opportunities")
      .select("id, loopwatch_item_id, opportunity_type, status, priority, title, summary, due_date, estimated_monthly_change, estimated_annual_change, action_href")
      .or(dataFilter)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100)
      .returns<LoopWatchOpportunity[]>(),
    supabase
      .from("planned_items")
      .select("id, label, amount, item_type, direction, person_id, category_id, brand_name")
      .or(dataFilter)
      .eq("direction", "outgoing")
      .order("label")
      .limit(200)
      .returns<LoopWatchPlannedItem[]>(),
  ]);

  const people = dedupeHouseholdPeople((peopleRows || []) as any[], householdContext.dataOwnerUserId) as Person[];
  const loopItems: LoopWatchItem[] = items || [];
  const itemEvents: LoopWatchEvent[] = events || [];
  const openOpportunities: LoopWatchOpportunity[] = opportunities || [];
  const plannedBillRows: LoopWatchPlannedItem[] = plannedItems || [];
  const needsReview = loopItems.filter((item) => item.status !== "confirmed").length;
  const trackedSoon = loopItems.filter((item) => {
    const days = daysUntil(item.renewal_date || item.end_date);
    return days !== null && days >= 0 && days <= 90;
  }).length;
  const documentsDeleted = loopItems.filter((item) => item.loopwatch_document_jobs?.source_file_deleted_at).length;
  const actionCount = openOpportunities.length;

  return (
    <>
      <Nav />
      <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-7 text-white shadow-[0_30px_100px_-55px_rgba(15,23,42,.9)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-100 ring-1 ring-white/10">
                <BellRing className="h-4 w-4" /> LoopWatch
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Attach once. Turn bills, contracts and big-purchase searches into watch cards.</h1>
              <p className="mt-3 max-w-4xl text-base font-bold text-slate-300">
                LoopWatch asks for context, extracts useful terms, lets you review/overwrite them, then links bills to Financial Flow or starts deal workflows like car lease/PCP watch.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 lg:w-[760px]">
              <StatCard title="Watching" value={String(loopItems.length)} helper="Active cards" />
              <StatCard title="Review" value={String(needsReview)} helper="Need checking" />
              <StatCard title="90 days" value={String(trackedSoon)} helper="Action windows" />
              <StatCard title="Actions" value={String(actionCount)} helper="Open checks" />
            </div>
          </div>
        </section>

        {loopItems.length === 0 ? <PageLandingExperience kind="loopwatch" /> : null}

        <section id="attach">
        <SectionCard title="Attach a new thing" description="Search first, add context, or attach a policy, contract, bill, school agenda, term-date PDF, letter or household document. LoopWatch creates a review card before it uses anything.">
          <LoopWatchUploadClient people={people} hasHousehold={Boolean(householdContext.householdId)} />
        </SectionCard>
        </section>

        <section id="discover">
          <SectionCard title="Discover" description="Set up a watch workflow for bigger purchases. Cars are live first: lease/PCP prompts, shortlist scoring and household affordability impact.">
            <LoopWatchDiscoverClient people={people} />
          </SectionCard>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Privacy mode</p>
            <p className="mt-2 flex items-center gap-2 text-lg font-black text-slate-950"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Metadata only</p>
            <p className="mt-1 text-sm font-bold text-slate-500">The original document is not saved to storage.</p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Source files deleted</p>
            <p className="mt-2 text-lg font-black text-slate-950">{documentsDeleted}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">Jobs with a deletion timestamp.</p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Next events</p>
            <p className="mt-2 text-lg font-black text-slate-950">{itemEvents.length}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">Renewal, notice and comparison reminders.</p>
          </div>
        </div>

        <SectionCard title="What LoopWatch can now do" description="Confirmed cards can feed household costs, family planning, provider price-increase projections and renewal/deal-watch actions.">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-950">Policies ending</p><p className="mt-1 text-sm font-bold text-slate-500">Insurance and contracts inside 90 days get comparison/renewal prompts.</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-950">April-style rises</p><p className="mt-1 text-sm font-bold text-slate-500">Mobile/broadband cards can use provider rules or extracted terms to forecast increases.</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-950">Household cost sync</p><p className="mt-1 text-sm font-bold text-slate-500">Confirmed monthly costs can create or update Financial Flow planned items.</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-950">Savings / mortgage links</p><p className="mt-1 text-sm font-bold text-slate-500">Savings terms and mortgage offers can be pushed into existing rate-watch logic.</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-950">School / nursery logic</p><p className="mt-1 text-sm font-bold text-slate-500">Term dates, agendas and nursery documents can be suggested for a child and imported into Family Planning.</p></div>
          </div>
        </SectionCard>

        <SectionCard title="LoopWatch cards" description="Review the extraction before Loop treats it as a confirmed contract or policy. Low-confidence fields should stay editable.">
          {loopItems.length === 0 ? (
            <PageLandingExperience kind="loopwatch" compact />
          ) : (
            <div className="space-y-5">
              {loopItems.map((item) => (
                <LoopWatchItemCard key={item.id} item={item} people={people} plannedItems={plannedBillRows} events={itemEvents.filter((event) => event.loopwatch_item_id === item.id)} opportunities={openOpportunities.filter((opportunity) => opportunity.loopwatch_item_id === item.id)} />
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </>
  );
}
