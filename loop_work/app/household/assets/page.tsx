import { createClient } from "@/lib/supabase/server";
import { addProperty, addVehicle } from "./actions";

function money(pence?: number | null) {
  return (Number(pence || 0) / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export default async function HouseholdAssetsPage() {
  const supabase = await createClient();

  const [{ data: properties }, { data: vehicles }] = await Promise.all([
    supabase.from("loop_household_properties").select("*").neq("status", "deleted").order("created_at", { ascending: false }),
    supabase.from("loop_household_vehicles").select("*").neq("status", "deleted").order("created_at", { ascending: false }),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Household assets</p>
        <h1 className="mt-2 text-4xl font-black">Homes and cars</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Track properties and vehicles against the household so LOOP can estimate running costs, school/property context and car mileage costs.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={addProperty} className="space-y-3 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Add property</h2>
          <input name="label" placeholder="Home, New property..." className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="address_line1" placeholder="Address line 1" className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <div className="grid gap-3 md:grid-cols-2">
            <input name="town_city" placeholder="Town/city" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="postcode" placeholder="Postcode" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="bedrooms" placeholder="Bedrooms" inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="estimated_value" placeholder="Estimated value £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save property</button>
        </form>

        <form action={addVehicle} className="space-y-3 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Add vehicle</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input name="label" placeholder="Family car" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="registration" placeholder="Registration" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="make" placeholder="Make" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="model" placeholder="Model" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="fuel_type" placeholder="Fuel type" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="annual_mileage" placeholder="Annual mileage" inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="average_mpg" placeholder="MPG" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="monthly_finance" placeholder="Monthly finance £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="insurance_annual" placeholder="Insurance / year £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="tax_annual" placeholder="Tax / year £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <input name="maintenance_annual" placeholder="Maintenance / year £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </div>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save vehicle</button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(properties || []).map((property) => (
          <article key={property.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{property.enrichment_status}</p>
            <h2 className="mt-1 text-2xl font-black">{property.label}</h2>
            <p className="text-sm font-bold text-slate-500">{[property.address_line1, property.town_city, property.postcode].filter(Boolean).join(", ")}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">EPC</p><p className="font-black">{property.epc_rating || "Needs source"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Council tax</p><p className="font-black">{property.council_tax_band || "Needs source"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Insurance</p><p className="font-black">{property.insurance_estimate_annual_pence ? money(property.insurance_estimate_annual_pence) : "Estimate needed"}</p></div>
            </div>
            {property.map_image_url ? <a href={property.map_image_url} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Open map</a> : null}
          </article>
        ))}

        {(vehicles || []).map((vehicle) => (
          <article key={vehicle.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{vehicle.fuel_type || "Vehicle"}</p>
            <h2 className="mt-1 text-2xl font-black">{vehicle.label}</h2>
            <p className="text-sm font-bold text-slate-500">{[vehicle.make, vehicle.model, vehicle.registration].filter(Boolean).join(" · ")}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Annual miles</p><p className="font-black">{vehicle.annual_mileage || "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Cost/year</p><p className="font-black">{money(vehicle.running_cost_estimate_annual_pence)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Per mile</p><p className="font-black">{Number(vehicle.running_cost_estimate_per_mile_pence || 0).toFixed(1)}p</p></div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
