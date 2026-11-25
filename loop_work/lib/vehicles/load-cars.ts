// Cars and car bills for a household — used by Spending ("Your cars") and the drive on Home.
import { carMonthly, type Car } from "@/lib/vehicles/car-profile";
import { guessMakeModel } from "@/lib/vehicles/catalogue";

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

export type DriveEntry = { car: Car; personName: string | null; label: string; monthly: number; saved: boolean };

/** The cars on the drive, one per person in the order people are listed (you first), then by payment size. */
export function driveEntries(cars: CarRow[], carBills: CarBill[], people: DrivePerson[], electricityPence: number | null): DriveEntry[] {
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
      return { car: car as Car, personId, amount: bill?.amount || 0, saved: true };
    }),
    ...carBills.filter((bill) => !linked.has(bill.id)).map((bill) => ({ car: carFromBill(bill), personId: bill.personId || null, amount: bill.amount, saved: false })),
  ].sort((a, b) => order(a.personId) - order(b.personId) || b.amount - a.amount);

  return entries.map((entry) => {
    const personName = people.find((p) => p.id === entry.personId)?.name || null;
    const monthly = carMonthly(entry.car, entry.amount, electricityPence).total;
    return { car: entry.car, personName, saved: entry.saved, monthly, label: `${personName ? `${personName}'s ` : ""}${entry.car.name}` };
  });
}
