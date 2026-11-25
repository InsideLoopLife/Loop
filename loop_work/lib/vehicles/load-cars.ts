// Cars and car bills for a household — used by Spending ("Your cars") and the drive on Home.
import { carMonthly, type Car, type CarMonthly } from "@/lib/vehicles/car-profile";
import { guessMakeModel } from "@/lib/vehicles/catalogue";
import { carLook } from "@/lib/vehicles/look";

export type CarRow = Car & { id: string };
export type CarBill = { id: string; label: string; amount: number; personId?: string | null };
export type DrivePerson = { id: string; name: string };

const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function normaliseCarRow(row: any): CarRow {
  return {
    ...row,
    list_price: n(row.list_price),
    insurance_annual: n(row.insurance_annual),
    excess_pence_per_mile: n(row.excess_pence_per_mile),
    final_payment: n(row.final_payment),
    mpg: n(row.mpg),
    miles_per_kwh: n(row.miles_per_kwh),
    electric_share: n(row.electric_share),
    maintenance_annual: n(row.maintenance_annual),
    mot_mileage: Array.isArray(row.mot_mileage) ? row.mot_mileage : [],
  } as CarRow;
}

const NOT_A_CAR_PAYMENT = /insurance|warranty|breakdown|fuel|petrol|parking|tax|service|\bmot\b|motoreasy|charging/i;

/** Car payments: monthly bills in a car category that look like a finance or lease payment. */
export function carBillsFrom(items: any[], categoryNameById: Map<string, string>, today: string): CarBill[] {
  return items
    .filter((item) => item.direction === "outgoing" && item.recurrence === "monthly" && !String(item.notes || "").includes("[planned_purchase:") && (!item.end_date || item.end_date >= today))
    .filter((item) => {
      const category = item.category_id ? categoryNameById.get(item.category_id) || "" : "";
      const isCar = /\b(car|cars|motoring|vehicle|transport)\b/i.test(category) || item.item_type === "transport";
      return isCar && Number(item.amount || 0) >= 80 && !NOT_A_CAR_PAYMENT.test(String(item.label || ""));
    })
    .map((item) => ({ id: item.id, label: item.label, amount: Number(item.amount || 0), personId: item.person_id || null }));
}

/** A new car started from its bill: whoever pays the bill drives it. */
export function carFromBill(bill: CarBill): Car {
  return { name: bill.label, ...guessMakeModel(bill.label), fuel_type: "petrol", ownership: "lease", tax_included: true, planned_item_id: bill.id, person_id: bill.personId || null };
}

export type DriveEntry = { car: Car; personName: string | null; label: string; monthly: number; saved: boolean; costs: CarMonthly; look: ReturnType<typeof carLook>; arrivedFrom?: string | null };

/** A planned car that has now arrived, replacing the car whose payment it ends. */
export type CarArrival = { purchaseId: string; replacesId: string; name: string; monthly: number; startDate: string; personId?: string | null; details: Record<string, any> };

/** The new car, built from the planned purchase, taking over the old car's place on the drive. */
function arrivedCar(old: Car, arrival: CarArrival): Car {
  const d = arrival.details || {};
  // Already updated to the new car (saved from the drive after it arrived): keep what was saved.
  if (old.id && old.name === arrival.name) return old;
  return {
    // Keep the record and payment link, so saving from the drive turns the old car into the new one.
    id: old.id,
    planned_item_id: old.planned_item_id ?? null,
    ...guessMakeModel(arrival.name),
    name: arrival.name,
    person_id: old.person_id || arrival.personId || null,
    fuel_type: d.fuelType || old.fuel_type,
    ownership: old.ownership,
    year: Number(arrival.startDate.slice(0, 4)),
    mpg: d.mpg ?? null,
    miles_per_kwh: d.milesPerKwh ?? null,
    electric_share: d.electricShare ?? null,
    annual_miles: d.annualMiles ?? old.annual_miles ?? null,
    list_price: d.listPrice ?? null,
    tax_included: Boolean(d.taxIncluded),
    maintenance_included: Boolean(d.serviceIncluded),
    insurance_annual: d.insuranceMonthly ? d.insuranceMonthly * 12 : null,
    insurance_group: d.lookup?.insuranceGroup ?? null,
    lookup: d.lookup || null,
    colour: d.colour ?? null,
    body_style: d.body ?? null,
    agreement_start: arrival.startDate,
  };
}

/** The cars on the drive, one per person in the order people are listed (you first), then by payment size. */
export function driveEntries(cars: CarRow[], carBills: CarBill[], people: DrivePerson[], electricityPence: number | null, arrivals: CarArrival[] = []): DriveEntry[] {
  const arrivalFor = (id: string | null | undefined) => (id ? arrivals.find((a) => a.replacesId === id) : undefined);
  const billById = new Map(carBills.map((bill) => [bill.id, bill]));
  const linked = new Set(cars.map((car) => car.planned_item_id).filter(Boolean));
  const order = (personId: string | null | undefined) => {
    const i = people.findIndex((p) => p.id === personId);
    return i < 0 ? people.length : i;
  };
  const entries = [
    ...cars.map((car) => {
      const bill = car.planned_item_id ? billById.get(car.planned_item_id) : null;
      const personId = car.person_id || bill?.personId || null;
      const arrival = arrivalFor(car.planned_item_id);
      if (arrival) return { car: arrivedCar(car, arrival), personId: personId || arrival.personId || null, amount: arrival.monthly, saved: false, arrivedFrom: car.name };
      return { car: car as Car, personId, amount: bill?.amount || 0, saved: true, arrivedFrom: null };
    }),
    ...carBills.filter((bill) => !linked.has(bill.id)).map((bill) => {
      const arrival = arrivalFor(bill.id);
      const old = carFromBill(bill);
      return arrival
        ? { car: arrivedCar(old, arrival), personId: bill.personId || arrival.personId || null, amount: arrival.monthly, saved: false, arrivedFrom: bill.label }
        : { car: old, personId: bill.personId || null, amount: bill.amount, saved: false, arrivedFrom: null };
    }),
    // A planned car that has arrived whose old payment has already ended (so isn't listed any more).
    ...arrivals
      .filter((a) => !cars.some((car) => car.planned_item_id === a.replacesId) && !carBills.some((bill) => bill.id === a.replacesId))
      .map((a) => ({ car: arrivedCar({ name: a.name, fuel_type: "petrol", ownership: "lease", person_id: a.personId || null } as Car, a), personId: a.personId || null, amount: a.monthly, saved: false, arrivedFrom: null as string | null })),
  ].sort((a, b) => order(a.personId) - order(b.personId) || b.amount - a.amount);

  return entries.map((entry) => {
    const personName = people.find((p) => p.id === entry.personId)?.name || null;
    const costs = carMonthly(entry.car, entry.amount, electricityPence);
    return { car: entry.car, personName, saved: entry.saved, monthly: costs.total, costs, look: carLook(entry.car), arrivedFrom: entry.arrivedFrom, label: `${personName ? `${personName}'s ` : ""}${entry.car.name}` };
  });
}
