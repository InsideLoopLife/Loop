"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Car as CarIcon, Plus, Search } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { isLoopError } from "@/lib/actions/friendly";
import { removeCar, saveCar } from "@/app/spending/car-actions";
import { allowanceCheck, carDates, carMonthly, OWNERSHIP_LABEL, rollForward, type Car } from "@/lib/vehicles/car-profile";
import { FUEL_LABEL, TYPICAL_MILES_PER_KWH, TYPICAL_MPG, type FuelType } from "@/lib/vehicles/running-costs";

export type CarRow = Car & { id: string };
export type CarBill = { id: string; label: string; amount: number; personId?: string | null };

const gbp = (value: number, exact = false) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: exact ? 2 : 0, minimumFractionDigits: exact ? 2 : 0 }).format(value);
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const plate = (reg?: string | null) => (reg ? reg.replace(/^([A-Z]{2}\d{2})([A-Z]{3})$/, "$1 $2") : null);

const MILES_SOURCE: Record<string, string> = {
  you: "your figure",
  odometer: "from your mileage reading",
  mot: "from its MOT mileage history",
  allowance: "its mileage allowance",
  typical: "a typical UK figure",
};

export function CarsPanel({
  cars,
  carBills,
  people,
  today,
  electricityPence,
  openSlot = null,
}: {
  cars: CarRow[];
  carBills: CarBill[];
  people: { id: string; name: string }[];
  today: string;
  electricityPence: number | null;
  openSlot?: number | null;
}) {
  const [editing, setEditing] = useState<Car | null>(null);
  const billById = useMemo(() => new Map(carBills.map((bill) => [bill.id, bill])), [carBills]);
  const linked = new Set(cars.map((car) => car.planned_item_id).filter(Boolean));
  const unlinkedBills = carBills.filter((bill) => !linked.has(bill.id));
  // A new car from a bill: whoever pays the bill drives it.
  const fromBill = (bill: CarBill): Car => ({ name: bill.label, fuel_type: "petrol", ownership: "lease", planned_item_id: bill.id, person_id: bill.personId || null });

  // The cars on the drive (Home & mortgage), one per person: ordered by who drives / pays, as people are listed.
  const drive = useMemo(() => {
    const order = (personId: string | null | undefined) => {
      const i = people.findIndex((p) => p.id === personId);
      return i < 0 ? people.length : i;
    };
    const entries: { order: number; amount: number; open: () => Car }[] = [
      ...cars.map((car) => ({ order: order(car.person_id || (car.planned_item_id ? billById.get(car.planned_item_id)?.personId : null)), amount: car.planned_item_id ? billById.get(car.planned_item_id)?.amount || 0 : 0, open: () => car as Car })),
      ...unlinkedBills.map((bill) => ({ order: order(bill.personId), amount: bill.amount, open: () => fromBill(bill) })),
    ];
    return entries.sort((a, b) => a.order - b.order || b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, unlinkedBills.length, people, billById]);

  useEffect(() => {
    if (openSlot === null || openSlot === undefined) return;
    const entry = drive[openSlot] || drive[0];
    const timer = window.setTimeout(() => setEditing(entry ? entry.open() : { name: "", fuel_type: "petrol", ownership: "owned" }), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSlot]);

  return (
    <section id="your-cars" className="mb-6 scroll-mt-28 rounded-[18px] border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Your cars</h2>
          <p className="text-sm font-semibold text-slate-500">Add a registration and Loop fills in the rest — MOT, tax, mileage and what each car really costs.</p>
        </div>
        <button type="button" onClick={() => setEditing({ name: "", fuel_type: "petrol", ownership: "owned" })} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-black text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
          <Plus className="h-4 w-4" aria-hidden /> Add a car
        </button>
      </div>

      <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {cars.map((car) => {
          const bill = car.planned_item_id ? billById.get(car.planned_item_id) : null;
          const monthly = carMonthly(car, bill?.amount || 0, electricityPence);
          const next = carDates({ ...car, mot_due: rollForward(car.mot_due, today), tax_due: rollForward(car.tax_due, today), insurance_renewal: rollForward(car.insurance_renewal, today) }, today)[0];
          const allowance = allowanceCheck(car, today);
          return (
            <li key={car.id}>
              <button type="button" onClick={() => setEditing(car)} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:bg-slate-50">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-950">{car.name}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500">{[car.year, FUEL_LABEL[car.fuel_type], OWNERSHIP_LABEL[car.ownership]].filter(Boolean).join(" · ")}</span>
                  </span>
                  {car.registration ? <span className="shrink-0 rounded-md bg-amber-300 px-2 py-0.5 font-mono text-xs font-black tracking-wider text-slate-950">{plate(car.registration)}</span> : null}
                </span>
                <span className="text-sm font-black text-slate-950">{gbp(monthly.total)}/mo all-in <span className="text-xs font-semibold text-slate-500">· {monthly.perMile.toFixed(0)}p a mile</span></span>
                {next ? <span className="text-xs font-bold text-slate-600">{next.label}: {shortDate(next.date)}</span> : <span className="text-xs font-semibold text-slate-400">Add MOT, tax and insurance dates</span>}
                {allowance ? (
                  <span className={`text-xs font-black ${allowance.status === "over" ? "text-rose-700" : allowance.status === "close" ? "text-amber-700" : "text-emerald-700"}`}>
                    {allowance.status === "over" ? `Heading ${allowance.overBy.toLocaleString("en-GB")} miles over${allowance.excessCost ? ` ≈ ${gbp(allowance.excessCost)}` : ""}` : allowance.status === "close" ? "Close to the mileage allowance" : "Within the mileage allowance"}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {unlinkedBills.map((bill) => (
          <li key={bill.id}>
            <button type="button" onClick={() => setEditing(fromBill(bill))} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-left hover:border-slate-400">
              <CarIcon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-900">{bill.label} · {gbp(bill.amount, true)}/mo</span>
                <span className="block text-xs font-semibold text-slate-500">Looks like a car. Add its registration to fill in the details.</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">Add details</span>
            </button>
          </li>
        ))}
      </ul>
      {!cars.length && !unlinkedBills.length ? <p className="mt-3 text-sm font-semibold text-slate-500">No cars yet.</p> : null}

      {editing ? createPortal(
        <ModalFrame title={editing.id ? editing.name : "Car details"} description="Start with the registration — Loop looks the rest up for you to check." eyebrow="Spending · Your cars" maxWidth="max-w-5xl" onClose={() => setEditing(null)}>
          <CarEditor initial={editing} carBills={carBills} people={people} today={today} electricityPence={electricityPence} onDone={() => setEditing(null)} />
        </ModalFrame>,
        document.body,
      ) : null}
    </section>
  );
}

function CarEditor({ initial, carBills, people, today, electricityPence, onDone }: { initial: Car; carBills: CarBill[]; people: { id: string; name: string }[]; today: string; electricityPence: number | null; onDone: () => void }) {
  const router = useRouter();
  const [car, setCar] = useState<Car>(() => ({ ...initial, mot_mileage: [...(initial.mot_mileage || [])] }));
  const [reg, setReg] = useState(plate(initial.registration) || "");
  const [lookup, setLookup] = useState<{ busy: boolean; message: string | null; found: boolean }>({ busy: false, message: null, found: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Car>) => setCar((current) => ({ ...current, ...patch }));
  const bill = carBills.find((b) => b.id === car.planned_item_id) || null;
  const monthly = carMonthly(car, bill?.amount || 0, electricityPence);
  const allowance = allowanceCheck(car, today);
  const rolled = { ...car, mot_due: rollForward(car.mot_due, today), tax_due: rollForward(car.tax_due, today), insurance_renewal: rollForward(car.insurance_renewal, today) };
  const upcoming = carDates(rolled, today);
  const fuel = car.fuel_type;
  const financed = car.ownership !== "owned";
  const allowanceKind = car.ownership === "lease" || car.ownership === "pcp";
  const sources = (car.lookup?.sources as string[] | undefined) || [];

  const findDetails = async () => {
    const registration = reg.replace(/\s+/g, "").toUpperCase();
    setLookup({ busy: true, message: null, found: false });
    try {
      const response = await fetch("/api/vehicles/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registration }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setLookup({ busy: false, message: payload.error || "The lookup didn't work. Type the details in instead.", found: false }); return; }
      if (!payload.found) { set({ registration }); setLookup({ busy: false, message: payload.message || "Couldn't find that registration online.", found: false }); return; }
      const c = payload.car;
      setCar((current) => {
        const madeName = [c.make, c.model].filter(Boolean).join(" ");
        const keepName = current.name && !carBills.some((b) => b.label === current.name);
        return {
          ...current,
          registration,
          name: keepName ? current.name : madeName || current.name,
          make: c.make ?? current.make,
          model: c.model ?? current.model,
          variant: c.variant ?? current.variant,
          colour: c.colour ?? current.colour,
          year: c.year ?? current.year,
          fuel_type: (c.fuelType || current.fuel_type) as FuelType,
          engine_cc: c.engineCc ?? current.engine_cc,
          co2_g_km: c.co2 ?? current.co2_g_km,
          list_price: c.listPrice ?? current.list_price,
          mot_due: c.motExpiry ?? current.mot_due,
          tax_due: c.taxDue ?? current.tax_due,
          mot_mileage: c.motMileage?.length ? c.motMileage : current.mot_mileage,
          mpg: current.mpg || c.mpg,
          miles_per_kwh: current.miles_per_kwh || c.milesPerKwh,
          insurance_group: c.insuranceGroup ?? current.insurance_group,
          lookup: { sources: payload.sources, lookedUpAt: payload.lookedUpAt, insuranceGroup: c.insuranceGroup, insuranceAnnualLow: c.insuranceAnnualLow, insuranceAnnualHigh: c.insuranceAnnualHigh },
        };
      });
      setLookup({ busy: false, message: `Found ${[c.year, c.colour, c.make, c.model, c.variant].filter(Boolean).join(" ")}. Check the details below — they came from public vehicle-check pages.`, found: true });
    } catch {
      setLookup({ busy: false, message: "The lookup didn't work. Type the details in instead.", found: false });
    }
  };

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (isLoopError(result)) { setError(result.__loopError); return; }
      router.refresh();
      onDone();
    });
  };

  const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950";
  const label = "block text-xs font-black text-slate-600";
  const hint = "mt-1 block text-[11px] font-semibold text-slate-400";
  const v = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const n = (value: string) => (value === "" ? null : Number(value));
  const d = (value: string) => value || null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <label className={label}>Registration
            <span className="mt-1 flex flex-wrap gap-2">
              <input value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="AB12 CDE" maxLength={9} className="w-40 rounded-xl border border-slate-300 bg-amber-300 px-3 py-2 font-mono text-lg font-black tracking-widest text-slate-950 placeholder:text-slate-700/40" />
              <button type="button" onClick={findDetails} disabled={lookup.busy || reg.replace(/\s+/g, "").length < 2} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">
                <Search className="h-4 w-4" aria-hidden /> {lookup.busy ? "Looking it up…" : "Find details"}
              </button>
            </span>
          </label>
          {lookup.message ? <p className={`mt-2 text-xs font-bold ${lookup.found ? "text-indigo-900" : "text-slate-600"}`}>{lookup.message}</p> : <p className={hint}>Fills in make, model, fuel, MOT and tax dates, mileage history, mpg and a typical insurance cost.</p>}
          {sources.length ? <p className="mt-1 text-[11px] font-semibold text-slate-500">{sources.map((s, i) => <a key={s} href={s} target="_blank" rel="noreferrer" className="mr-2 underline">Source {i + 1}</a>)}</p> : null}
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <label className={`${label} sm:col-span-2`}>Name
            <input value={car.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. VW Tiguan" maxLength={80} className={field} />
          </label>
          <label className={label}>Main driver
            <select value={car.person_id || ""} onChange={(e) => set({ person_id: e.target.value || null })} className={field}>
              <option value="">Shared</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className={label}>Make<input value={v(car.make)} onChange={(e) => set({ make: e.target.value || null })} className={field} /></label>
          <label className={label}>Model<input value={v(car.model)} onChange={(e) => set({ model: e.target.value || null })} className={field} /></label>
          <label className={label}>Year<input type="number" value={v(car.year)} onChange={(e) => set({ year: n(e.target.value) })} className={field} /></label>
          <label className={label}>Fuel
            <select value={fuel} onChange={(e) => set({ fuel_type: e.target.value as FuelType })} className={field}>
              {(Object.keys(FUEL_LABEL) as FuelType[]).map((k) => <option key={k} value={k}>{FUEL_LABEL[k]}</option>)}
            </select>
          </label>
          {fuel === "electric" ? (
            <label className={label}>Miles per kWh<input type="number" step="0.1" value={v(car.miles_per_kwh)} placeholder={String(TYPICAL_MILES_PER_KWH)} onChange={(e) => set({ miles_per_kwh: n(e.target.value) })} className={field} /></label>
          ) : (
            <label className={label}>Real-world mpg<input type="number" value={v(car.mpg)} placeholder={String(TYPICAL_MPG[fuel])} onChange={(e) => set({ mpg: n(e.target.value) })} className={field} /></label>
          )}
          <label className={label}>List price (£)<input type="number" value={v(car.list_price)} onChange={(e) => set({ list_price: n(e.target.value) })} className={field} /><span className={hint}>Sets road tax.</span></label>
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-black text-slate-600">How it&apos;s paid for</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Type
              <select value={car.ownership} onChange={(e) => set({ ownership: e.target.value as Car["ownership"], tax_included: e.target.value === "lease" ? true : car.tax_included })} className={field}>
                {(Object.keys(OWNERSHIP_LABEL) as Car["ownership"][]).map((k) => <option key={k} value={k}>{OWNERSHIP_LABEL[k]}</option>)}
              </select>
            </label>
            <label className={label}>Monthly payment in your plan
              <select value={car.planned_item_id || ""} onChange={(e) => set({ planned_item_id: e.target.value || null })} className={field}>
                <option value="">None</option>
                {carBills.map((b) => <option key={b.id} value={b.id}>{b.label} · {gbp(b.amount, true)}/mo</option>)}
              </select>
            </label>
            {financed ? (
              <>
                <label className={label}>Started<input type="date" value={v(car.agreement_start)} onChange={(e) => set({ agreement_start: d(e.target.value) })} className={field} /></label>
                <label className={label}>Ends<input type="date" value={v(car.agreement_end)} onChange={(e) => set({ agreement_end: d(e.target.value) })} className={field} /></label>
              </>
            ) : null}
            {allowanceKind ? (
              <>
                <label className={label}>Miles allowed a year<input type="number" step="1000" value={v(car.mileage_allowance_annual)} onChange={(e) => set({ mileage_allowance_annual: n(e.target.value) })} className={field} /></label>
                <label className={label}>Excess charge (pence a mile)<input type="number" step="0.1" value={v(car.excess_pence_per_mile)} onChange={(e) => set({ excess_pence_per_mile: n(e.target.value) })} className={field} /></label>
              </>
            ) : null}
            {car.ownership === "pcp" ? (
              <label className={label}>Final (balloon) payment (£)<input type="number" value={v(car.final_payment)} onChange={(e) => set({ final_payment: n(e.target.value) })} className={field} /></label>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3">
          <legend className="px-1 text-xs font-black text-slate-600">Dates &amp; insurance</legend>
          <label className={label}>MOT due<input type="date" value={v(car.mot_due)} onChange={(e) => set({ mot_due: d(e.target.value) })} className={field} /><span className={hint}>Cars under 3 years old don&apos;t need one yet.</span></label>
          <label className={label}>Road tax due<input type="date" value={v(car.tax_due)} disabled={car.tax_included} onChange={(e) => set({ tax_due: d(e.target.value) })} className={field} /></label>
          <label className="flex items-center gap-2 self-center pt-4 text-xs font-black text-slate-600">
            <input type="checkbox" checked={Boolean(car.tax_included)} onChange={(e) => set({ tax_included: e.target.checked })} className="h-4 w-4 rounded" /> Tax included (lease)
          </label>
          <label className={label}>Insurer<input value={v(car.insurer)} onChange={(e) => set({ insurer: e.target.value || null })} className={field} /></label>
          <label className={label}>Renews<input type="date" value={v(car.insurance_renewal)} onChange={(e) => set({ insurance_renewal: d(e.target.value) })} className={field} /></label>
          <label className={label}>Cost a year (£)<input type="number" value={v(car.insurance_annual)} placeholder={monthly.insuranceSource === "group" ? String(Math.round(monthly.insurance * 12)) : ""} onChange={(e) => set({ insurance_annual: n(e.target.value) })} className={field} />
            <span className={hint}>{car.insurance_annual ? "Your premium." : monthly.insuranceSource === "group" ? "Blank: best guess from the insurance group." : "Add your premium, or the insurance group for a guess."}{car.lookup?.insuranceAnnualLow ? ` Typical online: ${gbp(Number(car.lookup.insuranceAnnualLow))}–${gbp(Number(car.lookup.insuranceAnnualHigh || car.lookup.insuranceAnnualLow))}.` : ""}</span>
          </label>
          <label className={label}>Insurance group (1–50)<input type="number" min="1" max="50" value={v(car.insurance_group)} onChange={(e) => set({ insurance_group: n(e.target.value) })} className={field} /></label>
          <label className={label}>Servicing &amp; tyres (£ a year)<input type="number" value={v(car.maintenance_annual)} placeholder={String(Math.round(monthly.maintenance * 12))} onChange={(e) => set({ maintenance_annual: n(e.target.value) })} className={field} /><span className={hint}>Blank: Loop&apos;s guide.</span></label>
          <label className="flex items-center gap-2 self-center pt-4 text-xs font-black text-slate-600">
            <input type="checkbox" checked={Boolean(car.maintenance_included)} onChange={(e) => set({ maintenance_included: e.target.checked })} className="h-4 w-4 rounded" /> Servicing included
          </label>
        </fieldset>

        <fieldset className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3">
          <legend className="px-1 text-xs font-black text-slate-600">Mileage</legend>
          <label className={label}>Mileage now<input type="number" value={v(car.odometer_miles)} onChange={(e) => set({ odometer_miles: n(e.target.value), odometer_date: car.odometer_date || today })} className={field} /></label>
          <label className={label}>Read on<input type="date" value={v(car.odometer_date)} onChange={(e) => set({ odometer_date: d(e.target.value) })} className={field} /></label>
          <label className={label}>Miles a year<input type="number" step="500" value={v(car.annual_miles)} placeholder={String(monthly.miles)} onChange={(e) => set({ annual_miles: n(e.target.value) })} className={field} /><span className={hint}>Blank: {MILES_SOURCE[monthly.milesSource]}.</span></label>
          {car.mot_mileage?.length ? (
            <p className="text-[11px] font-semibold text-slate-500 sm:col-span-3">
              MOT readings: {car.mot_mileage.slice(0, 5).map((r) => `${shortDate(r.date)} ${r.miles.toLocaleString("en-GB")}`).join(" · ")}
            </p>
          ) : null}
        </fieldset>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">All-in each month</p>
            <p className="text-3xl font-black tracking-tight text-slate-950">{gbp(monthly.total)}<span className="text-base font-bold text-slate-500">/mo</span></p>
            <p className="text-xs font-semibold text-slate-500">{monthly.perMile.toFixed(0)}p a mile · {monthly.miles.toLocaleString("en-GB")} miles a year ({MILES_SOURCE[monthly.milesSource]})</p>
          </div>
          <dl className="space-y-1 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-600">
            <div className="flex justify-between"><dt>Payment{bill ? ` (${bill.label})` : ""}</dt><dd className="font-black text-slate-900">{gbp(monthly.payment, true)}</dd></div>
            <div className="flex justify-between"><dt>{monthly.energyLabel}</dt><dd className="font-black text-slate-900">{gbp(monthly.energy, true)}</dd></div>
            <div className="flex justify-between"><dt>Insurance{monthly.insuranceSource === "group" ? <span className="block text-[10px] text-slate-400">best guess from group {car.insurance_group ?? String(car.lookup?.insuranceGroup ?? "")} — add your premium</span> : null}</dt><dd className="font-black text-slate-900">{monthly.insurance ? gbp(monthly.insurance, true) : "not added"}</dd></div>
            <div className="flex justify-between"><dt>Servicing &amp; tyres<span className="block text-[10px] text-slate-400">{monthly.maintenanceSource === "you" ? "your figure" : car.maintenance_included ? "servicing included — tyres & wear" : "guide: yearly service + wear per mile"}</span></dt><dd className="font-black text-slate-900">{gbp(monthly.maintenance, true)}</dd></div>
            <div className="flex justify-between"><dt>Road tax<span className="block text-[10px] text-slate-400">{monthly.taxNote}</span></dt><dd className="font-black text-slate-900">{gbp(monthly.tax, true)}</dd></div>
          </dl>
          {allowance ? (
            <div className={`rounded-xl p-3 text-xs font-semibold ring-1 ${allowance.status === "over" ? "bg-rose-50 text-rose-900 ring-rose-200" : allowance.status === "close" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"}`}>
              <p className="text-sm font-black">{allowance.status === "over" ? `Heading ${allowance.overBy.toLocaleString("en-GB")} miles over` : allowance.status === "close" ? "Close to the allowance" : "Within the allowance"}</p>
              <p>{allowance.usedSoFar.toLocaleString("en-GB")} miles so far (allowed about {allowance.allowedSoFar.toLocaleString("en-GB")} by now). On this pace: {allowance.projectedTotal.toLocaleString("en-GB")} of {allowance.allowedTotal.toLocaleString("en-GB")}.</p>
              {allowance.excessCost ? <p className="mt-1 font-black">Excess charge ≈ {gbp(allowance.excessCost)} at the end</p> : null}
            </div>
          ) : allowanceKind && car.mileage_allowance_annual ? (
            <p className="text-[11px] font-semibold text-slate-500">Add the start and end dates and today&apos;s mileage to check the allowance.</p>
          ) : null}
          {upcoming.length ? (
            <div className="border-t border-slate-200 pt-2">
              <p className="text-xs font-black text-slate-600">Coming up · in your calendar</p>
              <ul className="mt-1 space-y-0.5 text-xs font-semibold text-slate-600">
                {upcoming.map((u) => <li key={u.key} className="flex justify-between gap-3"><span>{u.label}</span><span className="font-black text-slate-900">{shortDate(u.date)}</span></li>)}
              </ul>
            </div>
          ) : null}
          <p className="text-[10px] font-semibold text-slate-400">Fuel, insurance and tax are shown here as a guide; they aren&apos;t added to your monthly plan.</p>
        </div>

        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => run(() => saveCar(JSON.stringify({ ...car, registration: reg.replace(/\s+/g, "").toUpperCase() || null })))} disabled={pending || !car.name.trim()} className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
            {pending ? "Saving…" : "Save car"}
          </button>
          {car.id ? (
            <ConfirmButton question="Remove this car?" detail="Its dates come out of the calendar. Its payment stays in Spending." confirmLabel="Yes, remove" danger onConfirm={() => run(() => removeCar(car.id as string))} disabled={pending} className="rounded-full px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50">
              Remove
            </ConfirmButton>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
