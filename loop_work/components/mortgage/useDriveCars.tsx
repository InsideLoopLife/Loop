"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { CarEditor } from "@/components/spending/CarsPanel";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadCarsContext } from "@/app/spending/car-actions";
import { driveEntries, type CarArrival, type CarBill, type CarRow, type DrivePerson } from "@/lib/vehicles/load-cars";
import type { Car } from "@/lib/vehicles/car-profile";

type Context = { cars: CarRow[]; carBills: CarBill[]; people: DrivePerson[]; today: string; electricityPence: number | null; arrivals?: CarArrival[] };

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

/** The cars on the house drawing: whose each one is, and its costs in a pop-up on the same page. */
export function useDriveCars() {
  const [context, setContext] = useState<Context | null>(null);
  const [editing, setEditing] = useState<Car | null>(null);

  const load = useCallback(() => {
    void quietly(() => loadCarsContext()).then((result) => {
      if (!isLoopError(result)) setContext(result as Context);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const entries = useMemo(() => (context ? driveEntries(context.cars, context.carBills, context.people, context.electricityPence, context.arrivals || []) : []), [context]);
  const labels = entries.map((entry) => `${entry.label} · ${gbp(entry.monthly)}/mo`);
  const tags = entries.map((entry) => entry.personName || entry.car.name);
  // Each car's colour and body for the drawing, from its details (null: keep the drawing's own choice).
  const looks = entries.map((entry) => entry.look);

  const open = (slot: number) => {
    const entry = entries[slot];
    setEditing(entry ? entry.car : { name: "", fuel_type: "petrol", ownership: "owned" });
  };

  const modal = editing && context && typeof document !== "undefined"
    ? createPortal(
        <ModalFrame title={editing.id ? `${entries.find((e) => e.car === editing)?.label || editing.name}` : editing.name || "Car details"} description={entries.find((e) => e.car === editing)?.arrivedFrom ? `Replaced ${entries.find((e) => e.car === editing)?.arrivedFrom} — add its registration, insurance and dates, then save.` : "What this car costs each month, and its dates."} eyebrow="Household · On the drive" maxWidth="max-w-5xl" onClose={() => setEditing(null)}>
          <CarEditor initial={editing} carBills={context.carBills} people={context.people} today={context.today} electricityPence={context.electricityPence} onDone={() => { setEditing(null); load(); }} />
        </ModalFrame>,
        document.body,
      )
    : null;

  // Each car's payment line in the plan, so household costs can show the car's all-in cost instead.
  const paymentLabels = entries
    .map((entry) => context?.carBills.find((bill) => bill.id === entry.car.planned_item_id)?.label)
    .filter(Boolean) as string[];

  return { labels, tags, looks, open, modal, ready: Boolean(context), entries, paymentLabels };
}
