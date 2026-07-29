"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  COST_TYPE_REGISTRY,
  CareType,
  ChildLite,
  WizardStep,
  mapCareTypeToCostKind,
  likelyCareTypesForAge,
} from "@/lib/calculations/childcareRegistry";
import {
  calculateNurseryMonthlyCost,
  calculateActivityMonthlyCost,
} from "@/lib/calculations/childcare";
import {
  calculateNewCareTypeMonthlyCost,
} from "@/lib/calculations/childcareRegistry";

type ChildOption = { id: string; name: string; age?: number | null };

type ChildCostWizardProps = {
  childrenOptions: ChildOption[];
  billPersonOptions?: ChildOption[];
  hasHousehold?: boolean;
  action: (formData: FormData) => void | Promise<void>;
  lockedChildId?: string;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

function toChildLite(option: ChildOption): ChildLite {
  return { id: option.id, name: option.name, age: option.age ?? null };
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Estimates the "today" monthly figure for the review screen and the
 *  monthly_cost column, using the same calculators the live forecast uses. */
function estimateMonthlyCost(careType: CareType, answers: Record<string, any>): number {
  const month = new Date().toISOString().slice(0, 7);

  if (careType === "nursery") {
    return calculateNurseryMonthlyCost({
      billingMonth: month,
      dailyRate: Number(answers.dailyRate) || 0,
      extraDailyCost: Number(answers.extraDailyCost) || 0,
      fundedHoursPerWeek: answers.fundingEligible ? Number(answers.fundedHoursPerWeek) || 0 : 0,
      fundingMode: answers.fundingEligible ? "stretched" : "none",
      hourlyFundingCredit: answers.fundingEligible ? (Number(answers.dailyRate) || 0) / 8 : 0,
      termWeeksPerYear: Number(answers.termWeeksPerYear) || 38,
      billingSchedule: answers.billingSchedule ?? "all_year",
      bankHolidaysAreFree: true,
      taxFreeChildcareEnabled: false,
      mondaySession: "full",
      tuesdaySession: "full",
      wednesdaySession: "full",
      thursdaySession: "full",
      fridaySession: "full",
      fullDayHours: 10,
      partDayHours: 5,
      partDayMultiplier: 0.5,
      // crude even spread across the requested days/week: mark first N weekdays "full"
    } as any).estimatedMonthlyCost;
  }

  return calculateNewCareTypeMonthlyCost(careType, answers, month).estimatedMonthlyCost;
}

function StepScreen({
  step,
  value,
  onChange,
  child,
  answers,
  childrenOptions,
}: {
  step: WizardStep;
  value: any;
  onChange: (val: any) => void;
  child: ChildLite | null;
  answers: Record<string, any>;
  childrenOptions: ChildOption[];
}) {
  const title = typeof step.title === "function" ? step.title(answers, child) : step.title;
  const hint = typeof step.hint === "function" ? step.hint(answers, child) : step.hint;

  const normalizedOptions = (step.options ?? []).map((opt) => (typeof opt === "string" ? { value: opt, label: opt } : opt));

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-950 mb-1">{title}</h3>
      {hint ? <p className="text-xs text-slate-500 mb-4">{hint}</p> : <div className="mb-4" />}

      {step.type === "child" && (
        <div className="flex flex-wrap gap-2">
          {childrenOptions.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onChange(c.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${value === c.id ? "border-orange-400 bg-orange-50 ring-2 ring-orange-500" : "border-slate-300 hover:border-orange-300"}`}
            >
              <div className="font-bold text-slate-950">{c.name}</div>
              {c.age !== undefined && c.age !== null ? <div className="text-xs text-slate-500">Age {c.age}</div> : null}
            </button>
          ))}
        </div>
      )}

      {step.type === "childMulti" && (
        <div className="flex flex-wrap gap-2">
          {childrenOptions.map((c) => {
            const selected: string[] = value ?? [];
            const isSelected = selected.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onChange(isSelected ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
                className={`rounded-2xl border px-4 py-3 text-left transition ${isSelected ? "border-orange-400 bg-orange-50 ring-2 ring-orange-500" : "border-slate-300 hover:border-orange-300"}`}
              >
                <div className="font-bold text-slate-950">{c.name}</div>
                {c.age !== undefined && c.age !== null ? <div className="text-xs text-slate-500">Age {c.age}</div> : null}
              </button>
            );
          })}
        </div>
      )}

      {step.type === "select" && (
        <div className="flex flex-col gap-2">
          {normalizedOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${value === opt.value ? "border-orange-400 bg-orange-50 ring-2 ring-orange-500" : "border-slate-300 hover:border-orange-300"}`}
            >
              <span className="font-bold text-slate-950">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {step.type === "multiselect" && (
        <div className="flex flex-wrap gap-2">
          {normalizedOptions.map((opt) => {
            const selected: string[] = value ?? [];
            const isSelected = selected.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange(isSelected ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${isSelected ? "border-orange-400 bg-orange-500 text-white" : "border-slate-300 text-slate-700 hover:border-orange-300"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {step.type === "boolean" && (
        <div className="flex gap-2">
          {[{ label: "Yes", val: true }, { label: "No", val: false }].map((opt) => (
            <button
              type="button"
              key={opt.label}
              onClick={() => onChange(opt.val)}
              className={`rounded-2xl border px-6 py-3 font-bold transition ${value === opt.val ? "border-orange-400 bg-orange-50 ring-2 ring-orange-500" : "border-slate-300 hover:border-orange-300"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {(step.type === "number" || step.type === "currency" || step.type === "percent") && (
        <div className="flex items-center gap-2">
          {step.type === "currency" ? <span className="text-lg text-slate-500">£</span> : null}
          <input
            autoFocus
            type="number"
            min={step.min}
            max={step.max}
            defaultValue={value ?? step.default}
            placeholder={step.default !== undefined ? `Suggested: ${step.default}` : "0"}
            onChange={(event) => onChange(event.target.value)}
            className="w-40 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2"
          />
          {step.type === "percent" ? <span className="text-lg text-slate-500">%</span> : null}
          {step.suffix ? <span className="text-xs text-slate-500">{step.suffix}</span> : null}
        </div>
      )}

      {step.optional ? <p className="mt-2 text-xs text-slate-400">Optional — skip if not applicable.</p> : null}
    </div>
  );
}

export function ChildCostWizard({ childrenOptions, billPersonOptions = childrenOptions, hasHousehold = true, action, lockedChildId }: ChildCostWizardProps) {
  const [phase, setPhase] = useState<"search" | "wizard" | "review">("search");
  const [query, setQuery] = useState("");
  const [careType, setCareType] = useState<CareType | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const [label, setLabel] = useState("");
  const [billPersonId, setBillPersonId] = useState("");
  const [startsOn, setStartsOn] = useState(currentDateIso());
  const [endsOn, setEndsOn] = useState("");

  const definition = careType ? COST_TYPE_REGISTRY.find((t) => t.id === careType) ?? null : null;

  const selectedChildId: string | undefined = answers.child ?? (answers.coveredChildIds ?? [])[0];
  const selectedChild = childrenOptions.find((c) => c.id === selectedChildId) ?? null;

  const allSteps = definition ? definition.steps(answers, selectedChild ? toChildLite(selectedChild) : null) : [];
  const visibleSteps = allSteps.filter((s) => !s.condition || s.condition(answers));
  const currentStep = phase === "wizard" ? visibleSteps[stepIndex] : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COST_TYPE_REGISTRY;
    return COST_TYPE_REGISTRY.filter((t) => t.label.toLowerCase().includes(q) || t.keywords.some((k) => k.includes(q)));
  }, [query]);

  function startFlow(type: CareType) {
    setCareType(type);
    setAnswers(lockedChildId ? { child: lockedChildId } : {});
    setStepIndex(0);
    setLabel((prev) => prev || COST_TYPE_REGISTRY.find((t) => t.id === type)?.label || "");
    setPhase("wizard");
  }

  function setAnswer(id: string, val: any) {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }

  function next() {
    if (stepIndex < visibleSteps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setPhase("review");
    }
  }

  function back() {
    if (stepIndex === 0) {
      setPhase("search");
      setCareType(null);
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  const isAnswered = (() => {
    if (!currentStep) return false;
    if (currentStep.optional) return true;
    if (currentStep.type === "childMulti" || currentStep.type === "multiselect") return (answers[currentStep.id === "child" ? "coveredChildIds" : currentStep.id] ?? []).length > 0;
    if (currentStep.type === "boolean") return answers[currentStep.id] !== undefined;
    if (currentStep.type === "child") return Boolean(answers.child);
    return answers[currentStep.id] !== undefined && answers[currentStep.id] !== "";
  })();

  const monthlyCost = careType ? estimateMonthlyCost(careType, answers) : 0;
  const costKind = careType ? mapCareTypeToCostKind(careType) : "fixed";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cost_kind" value={costKind} />
      <input type="hidden" name="care_type" value={careType ?? ""} />
      <input type="hidden" name="care_details" value={JSON.stringify(answers)} />
      <input type="hidden" name="child_id" value={careType === "nanny" ? "" : selectedChildId ?? ""} />
      <input type="hidden" name="monthly_cost" value={monthlyCost.toFixed(2)} />
      <input type="hidden" name="billing_month" value={new Date().toISOString().slice(0, 7)} />
      <input type="hidden" name="bank_holidays_are_free" value="true" />
      <input type="hidden" name="tax_free_childcare_enabled" value="false" />
      <input type="hidden" name="tax_free_childcare_cap_per_quarter" value="500" />
      <input type="hidden" name="payment_timing" value="fixed_day" />
      <input type="hidden" name="payment_day_of_month" value="1" />
      <input type="hidden" name="payment_adjustment" value="previous_workday" />

      {phase === "search" ? (
        <div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Add a child cost</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Start typing — nursery, after school club, holiday camp, nanny..."
              className={inputClass}
            />
          </label>
          <div className="mt-3 flex flex-col gap-2">
            {filtered.length === 0 ? <p className="text-sm text-slate-500">No matching cost type — try a different word.</p> : null}
            {filtered.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => startFlow(t.id)}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-orange-300"
              >
                <div>
                  <div className="font-bold text-slate-950">{t.label}</div>
                  <div className="text-xs text-slate-500">{t.category}</div>
                </div>
                <span className="text-slate-400">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === "wizard" && currentStep ? (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
          <div className="mb-4 flex items-center gap-1.5">
            {visibleSteps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-orange-400" : "bg-slate-200"}`} />
            ))}
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {definition?.label} · Step {stepIndex + 1} of {visibleSteps.length}
          </p>
          <StepScreen
            step={currentStep}
            value={currentStep.type === "childMulti" ? answers.coveredChildIds : answers[currentStep.id]}
            onChange={(val) => setAnswer(currentStep.id === "child" ? "child" : currentStep.type === "childMulti" ? "coveredChildIds" : currentStep.id, val)}
            child={selectedChild ? toChildLite(selectedChild) : null}
            answers={answers}
            childrenOptions={childrenOptions}
          />
          <div className="mt-6 flex items-center justify-between border-t border-white pt-4">
            <button type="button" onClick={back} className="text-sm font-semibold text-slate-500 hover:text-slate-900">
              ← Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!isAnswered}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${isAnswered ? "bg-orange-500 text-white hover:bg-orange-600" : "cursor-not-allowed bg-slate-200 text-slate-400"}`}
            >
              {stepIndex === visibleSteps.length - 1 ? "Continue" : "Next"} →
            </button>
          </div>
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Label</span>
            <input name="label" value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} required />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Bill allocated to</span>
            <select name="bill_person_id" value={billPersonId} onChange={(event) => setBillPersonId(event.target.value)} className={inputClass}>
              {hasHousehold ? <option value="">🏠 Household / shared</option> : null}
              {billPersonOptions.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Starts on</span>
              <input name="starts_on" type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Ends on</span>
              <input name="ends_on" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated monthly cost</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">£{monthlyCost.toFixed(2)}</p>
            <p className="mt-1 text-xs text-slate-500">This recalculates every month using the actual weekdays, bank holidays, and term/holiday dates for that month.</p>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setPhase("wizard")} className="text-sm font-semibold text-slate-500 hover:text-slate-900">
              ← Back to questions
            </button>
            <SubmitButton>Add child cost</SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
