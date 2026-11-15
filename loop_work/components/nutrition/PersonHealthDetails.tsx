"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, HeartPulse, Loader2, Smartphone, Trash2 } from "lucide-react";
import type { NutritionPerson } from "@/app/nutrition/page";
import { createHealthLink, deleteImportedHealthData, deleteWeight, getPersonHealth, logWeight, revokeHealthLink, savePersonHealthDetails, type PersonHealthSnapshot } from "@/app/nutrition/health-actions";
import { estimateAdultCalories, targetsForPerson } from "@/lib/nutrition/targets";
import { METRIC_LABELS } from "@/lib/health/ingest";

const ACTIVITY = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk job, little exercise" },
  { value: "light", label: "Lightly active", hint: "On your feet some of the day, or exercise 1–3 times a week" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 times a week, or an active job" },
  { value: "active", label: "Very active", hint: "Hard exercise 6–7 times a week" },
  { value: "very_active", label: "Extremely active", hint: "Physical job plus training" },
];
const GOALS = [
  { value: "eat_better", label: "Eat better" },
  { value: "maintain", label: "Stay the same" },
  { value: "lose", label: "Lose weight" },
  { value: "gain", label: "Gain weight" },
];
const DIETS = [
  { value: "omnivore", label: "Eats everything" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "other", label: "Other" },
];
// The 14 allergens UK food law requires to be labelled.
const ALLERGENS = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "peanuts", "sesame", "soya", "sulphites", "tree nuts"];

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{children}</button>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      {note ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{note}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function PersonHealthDetails({ person, onDone }: { person: NutritionPerson; onDone: () => void }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PersonHealthSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [birthDate, setBirthDate] = useState(person.birth_date || "");
  const [sex, setSex] = useState<"" | "male" | "female">((person.nutrition_reference_sex as "male" | "female") || "");
  const [height, setHeight] = useState(person.height_cm ? String(person.height_cm) : "");
  const [activity, setActivity] = useState(person.activity_level || "");
  const [goal, setGoal] = useState(person.nutrition_goal || "");
  const [diet, setDiet] = useState(person.diet_type || "");
  const [allergies, setAllergies] = useState<string[]>(person.food_allergies || []);
  const [lowCaffeine, setLowCaffeine] = useState(person.caffeine_limit_mg === 200);
  const [weightDate, setWeightDate] = useState(todayIso());
  const [weightValue, setWeightValue] = useState("");
  const [newKey, setNewKey] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function reload() {
    getPersonHealth(person.id).then(setSnapshot).catch((error) => setLoadError(error instanceof Error ? error.message : "Couldn't load health details."));
  }
  useEffect(() => {
    let cancelled = false;
    getPersonHealth(person.id)
      .then((data) => { if (!cancelled) setSnapshot(data); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load health details."); });
    return () => { cancelled = true; };
  }, [person.id]);

  const canEdit = snapshot ? snapshot.person.canEdit : true;
  const currentWeight = snapshot?.weights[0]?.weight_kg ?? person.weight_kg ?? null;
  const draftProfile = useMemo(() => ({
    birth_date: birthDate || null,
    relationship: person.relationship,
    nutrition_reference_sex: sex || null,
    weight_kg: currentWeight,
    height_cm: height ? Number(height) : null,
    activity_level: activity || null,
    nutrition_goal: goal || null,
    caffeine_limit_mg: lowCaffeine ? 200 : null,
  }), [birthDate, person.relationship, sex, currentWeight, height, activity, goal, lowCaffeine]);
  const targets = targetsForPerson(draftProfile, todayIso());
  const estimate = targets.isChild ? null : estimateAdultCalories(draftProfile, targets.ageYears);

  const weightTrend = useMemo(() => {
    const weights = snapshot?.weights || [];
    if (weights.length < 2) return null;
    const latest = weights[0];
    const cutoff = new Date(`${latest.measured_on}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const older = weights.find((entry) => new Date(`${entry.measured_on}T00:00:00Z`) <= cutoff) || weights[weights.length - 1];
    if (older === latest) return null;
    return { change: Math.round((latest.weight_kg - older.weight_kg) * 10) / 10, since: older.measured_on };
  }, [snapshot?.weights]);

  function run(task: () => Promise<unknown>, success: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        await task();
        setMessage(success);
        reload();
        router.refresh();
        after?.();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Something went wrong. Try again.");
      }
    });
  }

  function save() {
    run(() => savePersonHealthDetails({
      personId: person.id,
      birthDate: birthDate || null,
      referenceSex: sex || null,
      heightCm: height ? Number(height) : null,
      activityLevel: activity || null,
      goal: targets.isChild ? null : goal || null,
      dietType: diet || null,
      allergies,
      caffeineLimitMg: lowCaffeine ? 200 : null,
    }), "Saved.", () => window.setTimeout(onDone, 700));
  }

  function copy(text: string, what: string) {
    try {
      void navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-[1.5rem] bg-emerald-50 p-4 ring-1 ring-emerald-100">
        <p className="text-sm font-black text-emerald-950">{person.name} · {targets.band === "adult" ? `Adult${targets.ageYears != null ? `, ${targets.ageYears}` : ""}` : targets.bandLabel}</p>
        <p className="mt-1 text-sm font-semibold text-emerald-900">
          {targets.isChild
            ? `Uses UK targets for ${targets.bandLabel.toLowerCase()}. Children don't get calorie or weight goals.`
            : estimate
              ? `Personal calorie guide about ${estimate.kcal.toLocaleString("en-GB")} kcal a day (resting ${estimate.bmr.toLocaleString("en-GB")} kcal × activity ${estimate.factor}${estimate.goal === "lose" ? ", less 500 to lose weight" : estimate.goal === "gain" ? ", plus 300 to gain" : ""}).`
              : `Using the UK average of ${targets.calories.toLocaleString("en-GB")} kcal. Add date of birth, reference values, height, weight and activity for a personal guide.`}
        </p>
        {!canEdit ? <p className="mt-2 text-xs font-black text-amber-800">Only the person who added {person.name} can change these details.</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="About" note="Sets UK targets for their age.">
          <label className="block">
            <span className="text-xs font-black text-slate-700">Date of birth</span>
            <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} disabled={!canEdit} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-base font-semibold outline-none ring-emerald-500 focus:ring-2 sm:text-sm" />
          </label>
          <div>
            <span className="text-xs font-black text-slate-700">Reference values</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <Chip active={sex === ""} onClick={() => canEdit && setSex("")}>Not set</Chip>
              <Chip active={sex === "male"} onClick={() => canEdit && setSex("male")}>Men&apos;s / boys&apos;</Chip>
              <Chip active={sex === "female"} onClick={() => canEdit && setSex("female")}>Women&apos;s / girls&apos;</Chip>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">UK guidance differs for iron, protein and energy.</p>
          </div>
        </Section>

        <Section title="Body" note={targets.isChild ? "Weight is only used for the caffeine guide (3mg per kg)." : "Used for the calorie and protein guides."}>
          <label className="block">
            <span className="text-xs font-black text-slate-700">Height (cm)</span>
            <input type="number" inputMode="decimal" min="40" max="250" step="0.5" value={height} onChange={(event) => setHeight(event.target.value)} disabled={!canEdit} placeholder="e.g. 178" className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-base font-semibold outline-none ring-emerald-500 focus:ring-2 sm:text-sm" />
            {height && Number(height) > 0 ? <span className="mt-1 block text-xs font-semibold text-slate-500">{Math.floor(Number(height) / 30.48)}ft {Math.round((Number(height) / 2.54) % 12)}in</span> : null}
          </label>
          <div>
            <span className="text-xs font-black text-slate-700">Weight</span>
            <p className="mt-0.5 text-sm font-black text-slate-900">{currentWeight ? `${currentWeight} kg` : "Not logged yet"}{weightTrend && !targets.isChild ? <span className={`ml-2 text-xs font-black ${weightTrend.change > 0 ? "text-amber-700" : weightTrend.change < 0 ? "text-emerald-700" : "text-slate-500"}`}>{weightTrend.change > 0 ? "+" : ""}{weightTrend.change} kg since {new Date(`${weightTrend.since}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}</p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                <input type="number" inputMode="decimal" min="3" max="350" step="0.1" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} placeholder="kg" className="w-24 rounded-2xl border border-slate-200 px-3 py-2 text-base font-semibold sm:text-sm" />
                <button type="button" disabled={isPending || !weightValue} onClick={() => run(() => logWeight({ personId: person.id, date: weightDate, weightKg: Number(weightValue) }), "Weight logged.", () => setWeightValue(""))} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Log</button>
              </div>
            ) : null}
            {snapshot?.weights.length ? (
              <ul className="mt-2 divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                {snapshot.weights.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-1.5">
                    <span>{new Date(`${entry.measured_on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · <span className="font-black text-slate-800">{entry.weight_kg} kg</span>{entry.source !== "manual" ? <span className="text-slate-400"> · Apple Health</span> : null}</span>
                    {canEdit && entry.source === "manual" ? <button type="button" onClick={() => run(() => deleteWeight({ id: entry.id, personId: person.id }), "Removed.")} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove weight"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>

        {!targets.isChild ? (
          <Section title="Lifestyle" note="Sets the personal calorie guide.">
            <div className="grid gap-2">
              {ACTIVITY.map((option) => (
                <button key={option.value} type="button" disabled={!canEdit} onClick={() => setActivity(option.value)} className={`rounded-2xl px-3 py-2 text-left ring-1 ${activity === option.value ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"}`}>
                  <span className="block text-sm font-black">{option.label}</span>
                  <span className={`block text-xs font-semibold ${activity === option.value ? "text-white/70" : "text-slate-500"}`}>{option.hint}</span>
                </button>
              ))}
            </div>
            <div>
              <span className="text-xs font-black text-slate-700">Goal</span>
              <div className="mt-1 flex flex-wrap gap-2">{GOALS.map((option) => <Chip key={option.value} active={goal === option.value} onClick={() => canEdit && setGoal(goal === option.value ? "" : option.value)}>{option.label}</Chip>)}</div>
              {goal === "lose" ? <p className="mt-1 text-xs font-semibold text-slate-500">Aims for about 500 kcal a day under, never below a safe floor. Speak to a GP before big changes.</p> : null}
            </div>
          </Section>
        ) : null}

        <Section title="Food" note="Used to warn about foods and tailor suggestions.">
          <div>
            <span className="text-xs font-black text-slate-700">Diet</span>
            <div className="mt-1 flex flex-wrap gap-2">{DIETS.map((option) => <Chip key={option.value} active={diet === option.value} onClick={() => canEdit && setDiet(diet === option.value ? "" : option.value)}>{option.label}</Chip>)}</div>
          </div>
          <div>
            <span className="text-xs font-black text-slate-700">Allergies</span>
            <div className="mt-1 flex flex-wrap gap-2">{ALLERGENS.map((item) => <Chip key={item} active={allergies.includes(item)} onClick={() => canEdit && setAllergies((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item[0].toUpperCase() + item.slice(1)}</Chip>)}</div>
            <p className="mt-1 text-xs font-semibold text-slate-500">The 14 allergens UK food labels must show.</p>
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
            <input type="checkbox" checked={lowCaffeine} disabled={!canEdit} onChange={(event) => setLowCaffeine(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>
              <span className="block text-sm font-black text-slate-900">Use a 200mg caffeine limit</span>
              <span className="block text-xs font-semibold text-slate-500">UK advice during pregnancy and breastfeeding, or if caffeine affects you.</span>
            </span>
          </label>
        </Section>
      </div>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="button" disabled={isPending} onClick={save} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save details</button>
          {message ? <span className="text-sm font-black text-emerald-800">{message}</span> : null}
        </div>
      ) : null}

      {/* Apple Health */}
      <Section title="Apple Health" note="Send steps, activity, sleep, heart rate, workouts and weight from this person's iPhone.">
        {loadError ? <p className="text-sm font-black text-rose-700">{loadError}</p> : null}
        {!snapshot && !loadError ? <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : null}
        {snapshot ? (
          <>
            {Object.keys(snapshot.lastWeek).length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {["steps", "active_kcal", "sleep_hours", "resting_hr"].filter((key) => snapshot.lastWeek[key]).map((key) => (
                  <div key={key} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{METRIC_LABELS[key]?.label}</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{key === "sleep_hours" ? snapshot.lastWeek[key].avg.toFixed(1) : Math.round(snapshot.lastWeek[key].avg).toLocaleString("en-GB")}<span className="ml-1 text-xs font-bold text-slate-500">{METRIC_LABELS[key]?.unit === "count" ? "/day" : METRIC_LABELS[key]?.unit}</span></p>
                    <p className="text-[11px] font-semibold text-slate-400">7-day average · {snapshot.lastWeek[key].days} days</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm font-semibold text-slate-500">Nothing received yet.</p>}
            {snapshot.workoutsLastWeek ? <p className="text-xs font-semibold text-slate-500">{snapshot.workoutsLastWeek} workout{snapshot.workoutsLastWeek === 1 ? "" : "s"} in the last 7 days.</p> : null}

            {snapshot.links.filter((link) => !link.revoked_at).map((link) => (
              <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3">
                <span className="flex items-center gap-2 text-sm font-black text-slate-900"><Smartphone className="h-4 w-4 text-slate-500" /> {link.label} <span className="font-semibold text-slate-400">· key ending {link.token_hint}</span></span>
                <span className="text-xs font-semibold text-slate-500">{link.last_used_at ? `Last received ${new Date(link.last_used_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${link.last_summary?.days ? ` · ${link.last_summary.days} day${link.last_summary.days === 1 ? "" : "s"}` : ""}` : "Not used yet"}</span>
                {canEdit ? <button type="button" disabled={isPending} onClick={() => run(() => revokeHealthLink(link.id), "Link switched off.")} className="rounded-full px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50">Switch off</button> : null}
              </div>
            ))}

            {newKey ? (
              <div className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-sm font-black text-amber-950">Copy these now. The key won&apos;t be shown again.</p>
                {[["Address", newKey.url], ["Private key", newKey.token]].map(([label, value]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs font-black text-amber-900">{label}</span>
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs font-bold text-slate-800">{value}</code>
                    <button type="button" onClick={() => copy(value, label)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-700 ring-1 ring-amber-200" aria-label={`Copy ${label}`}>{copied === label ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                ))}
                <p className="text-xs font-semibold text-amber-900">Send it as a header: <code className="font-black">Authorization: Bearer &lt;private key&gt;</code>, as JSON. The setup steps for Health Auto Export or Apple Shortcuts will follow once you&apos;ve picked a route.</p>
              </div>
            ) : canEdit ? (
              <button type="button" disabled={isPending} onClick={() => { setMessage(null); startTransition(async () => { try { setNewKey(await createHealthLink({ personId: person.id, label: `${person.name}'s iPhone` })); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't create a link."); } }); }} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"><HeartPulse className="h-4 w-4" /> Create a private link for {person.name}&apos;s iPhone</button>
            ) : null}

            {canEdit && (Object.keys(snapshot.lastWeek).length || snapshot.weights.some((entry) => entry.source !== "manual")) ? (
              <button type="button" disabled={isPending} onClick={() => { if (window.confirm(`Delete everything imported from ${person.name}'s phone? Weights you typed in are kept.`)) run(() => deleteImportedHealthData(person.id), "Imported data deleted."); }} className="text-xs font-black text-slate-400 hover:text-rose-700">Delete imported data</button>
            ) : null}
            <p className="text-xs font-semibold text-slate-400">Health data stays in your household. Each phone has its own key you can switch off at any time.</p>
          </>
        ) : null}
      </Section>
    </div>
  );
}
