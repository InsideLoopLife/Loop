"use client";

import { useMemo, useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { addAsset, addLiability, deleteAsset, deleteLiability } from "@/app/net-worth/actions";
import { formatMoney } from "@/lib/format/money";

type Person = { id: string; name: string; relationship: string };
type Asset = { id: string; person_id: string | null; name: string; value: number; type: string; source_type?: string | null };
type Liability = { id: string; person_id: string | null; name: string; balance: number; type: string; source_type?: string | null };

type Props = { people: Person[]; assets: Asset[]; liabilities: Liability[] };
const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";

type Modal = null | "asset" | "liability";

function ownerLabel(peopleById: Map<string, Person>, personId: string | null) {
  return personId ? peopleById.get(personId)?.name ?? "Unknown" : "Shared";
}

function typeLabel(type: string) {
  return type.replaceAll("_", " ");
}

function assetAccent(type: string) {
  if (type === "property") return "from-orange-500 to-amber-400";
  if (type === "pension") return "from-violet-500 to-fuchsia-400";
  if (type === "investment") return "from-emerald-500 to-teal-400";
  if (type === "cash") return "from-sky-500 to-cyan-400";
  return "from-slate-900 to-slate-600";
}

function liabilityAccent(type: string) {
  if (type === "mortgage") return "from-slate-950 to-slate-600";
  if (type === "credit_card") return "from-red-500 to-orange-400";
  return "from-amber-500 to-orange-400";
}

function AddModal({ type, people, onClose }: { type: "asset" | "liability"; people: Person[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-3xl rounded-t-[2rem] border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Net worth item</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Add {type}</h2>
            <p className="mt-1 text-sm text-slate-500">Assign it to a household member or leave it shared. Homes and mortgages are pulled in automatically.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {type === "asset" ? (
          <form action={addAsset} className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="text-sm font-medium text-slate-700">Owner</span><select name="person_id" className={inputClass}><option value="">Household / shared</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <FormInput label="Name" name="name" placeholder="Cash, pension, investments" required />
            <FormInput label="Value" name="value" type="number" step="0.01" required />
            <label className="block"><span className="text-sm font-medium text-slate-700">Type</span><select name="type" className={inputClass}><option value="cash">Cash</option><option value="pension">Pension</option><option value="investment">Investment</option><option value="property">Property</option><option value="business">Business</option><option value="other">Other</option></select></label>
            <div className="flex items-end"><SubmitButton>Add asset</SubmitButton></div>
          </form>
        ) : (
          <form action={addLiability} className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="text-sm font-medium text-slate-700">Owner</span><select name="person_id" className={inputClass}><option value="">Household / shared</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <FormInput label="Name" name="name" placeholder="Credit card, loan" required />
            <FormInput label="Balance" name="balance" type="number" step="0.01" required />
            <label className="block"><span className="text-sm font-medium text-slate-700">Type</span><select name="type" className={inputClass}><option value="mortgage">Mortgage</option><option value="loan">Loan</option><option value="credit_card">Credit card</option><option value="other">Other</option></select></label>
            <div className="flex items-end"><SubmitButton>Add liability</SubmitButton></div>
          </form>
        )}
      </div>
    </div>
  );
}

export function NetWorthClient({ people, assets, liabilities }: Props) {
  const [personFilter, setPersonFilter] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [addOpen, setAddOpen] = useState(false);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const filteredAssets = personFilter === "all" ? assets : assets.filter((a) => a.person_id === personFilter || a.person_id === null);
  const filteredLiabilities = personFilter === "all" ? liabilities : liabilities.filter((l) => l.person_id === personFilter || l.person_id === null);
  const totalAssets = filteredAssets.reduce((sum, asset) => sum + Number(asset.value), 0);
  const totalLiabilities = filteredLiabilities.reduce((sum, liability) => sum + Number(liability.balance), 0);
  const netWorth = totalAssets - totalLiabilities;
  const selectedName = personFilter === "all" ? "household" : peopleById.get(personFilter)?.name ?? "person";
  const propertyAssets = filteredAssets.filter((asset) => asset.type === "property").reduce((sum, asset) => sum + Number(asset.value), 0);
  const liquidAssets = filteredAssets.filter((asset) => ["cash", "investment"].includes(asset.type)).reduce((sum, asset) => sum + Number(asset.value), 0);
  const pensionAssets = filteredAssets.filter((asset) => asset.type === "pension").reduce((sum, asset) => sum + Number(asset.value), 0);
  const mortgageDebt = filteredLiabilities.filter((liability) => liability.type === "mortgage").reduce((sum, liability) => sum + Number(liability.balance), 0);

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-8">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Net worth snapshot</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{formatMoney(netWorth)}</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300">Auto-pulls homes and mortgages, then blends in cash, pensions, investments and manual debts for the selected {selectedName} view.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Assets</p><p className="mt-1 text-2xl font-black">{formatMoney(totalAssets)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Liabilities</p><p className="mt-1 text-2xl font-black">{formatMoney(totalLiabilities)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Items</p><p className="mt-1 text-2xl font-black">{filteredAssets.length + filteredLiabilities.length}</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPersonFilter("all")} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === "all" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>All household</button>
          {people.map((person) => <button key={person.id} onClick={() => setPersonFilter(person.id)} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === person.id ? "bg-slate-950 text-white" : person.relationship === "child" ? "border border-sky-100 bg-sky-50 text-sky-800" : "border border-orange-100 bg-orange-50 text-orange-800"}`}>{person.name}</button>)}
        </div>
        <div className="relative">
          <button onClick={() => setAddOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"><span className="text-lg leading-none">+</span> Add</button>
          {addOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button onClick={() => { setModal("asset"); setAddOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add asset</button>
              <button onClick={() => { setModal("liability"); setAddOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add liability</button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"><p className="text-sm font-bold text-slate-500">Property</p><p className="mt-2 text-3xl font-black">{formatMoney(propertyAssets)}</p><p className="mt-1 text-sm text-slate-500">From Mortgage homes</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"><p className="text-sm font-bold text-slate-500">Cash + investments</p><p className="mt-2 text-3xl font-black">{formatMoney(liquidAssets)}</p><p className="mt-1 text-sm text-slate-500">Manual/API later</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"><p className="text-sm font-bold text-slate-500">Pension</p><p className="mt-2 text-3xl font-black">{formatMoney(pensionAssets)}</p><p className="mt-1 text-sm text-slate-500">Manual snapshots</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"><p className="text-sm font-bold text-slate-500">Mortgage debt</p><p className="mt-2 text-3xl font-black">{formatMoney(mortgageDebt)}</p><p className="mt-1 text-sm text-slate-500">Projected balance today</p></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Assets" description="Property is auto-split by ownership. Add cash, pensions, investments or business value manually for now.">
          <div className="space-y-3">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${assetAccent(asset.type)}`} />
                <div className="flex items-center justify-between gap-4 p-5">
                  <div><p className="font-black text-slate-950">{asset.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{typeLabel(asset.type)} · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{ownerLabel(peopleById, asset.person_id)}</span>{asset.source_type ? ` · auto from ${asset.source_type}` : ""}</p></div>
                  <div className="text-right"><p className="text-xl font-black">{formatMoney(asset.value)}</p>{asset.source_type ? null : <form action={deleteAsset}><input type="hidden" name="id" value={asset.id} /><button className="text-sm font-bold text-red-600">Delete</button></form>}</div>
                </div>
              </div>
            ))}
            {filteredAssets.length === 0 ? <p className="text-sm text-slate-500">No assets yet.</p> : null}
          </div>
        </SectionCard>
        <SectionCard title="Liabilities" description="Mortgage balances are projected from the mortgage page; add other loans/cards here.">
          <div className="space-y-3">
            {filteredLiabilities.map((liability) => (
              <div key={liability.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${liabilityAccent(liability.type)}`} />
                <div className="flex items-center justify-between gap-4 p-5">
                  <div><p className="font-black text-slate-950">{liability.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{typeLabel(liability.type)} · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{ownerLabel(peopleById, liability.person_id)}</span>{liability.source_type === "mortgage" ? " · auto from mortgage" : ""}</p></div>
                  <div className="text-right"><p className="text-xl font-black">{formatMoney(liability.balance)}</p>{liability.source_type === "mortgage" ? null : <form action={deleteLiability}><input type="hidden" name="id" value={liability.id} /><button className="text-sm font-bold text-red-600">Delete</button></form>}</div>
                </div>
              </div>
            ))}
            {filteredLiabilities.length === 0 ? <p className="text-sm text-slate-500">No liabilities yet.</p> : null}
          </div>
        </SectionCard>
      </div>
      {modal ? <AddModal type={modal} people={people} onClose={() => setModal(null)} /> : null}
    </main>
  );
}
