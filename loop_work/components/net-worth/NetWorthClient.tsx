"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronRight, Home, LineChart, PiggyBank, ShieldCheck, Trash2, WalletCards, type LucideIcon } from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { addAsset, addLiability, deleteAsset, deleteLiability } from "@/app/net-worth/actions";
import { formatMoney } from "@/lib/format/money";

type Person = {
  id: string;
  name: string;
  relationship: string;
  user_id?: string | null;
  linked_user_id?: string | null;
  account_status?: string | null;
};
type Asset = { id: string; person_id: string | null; name: string; value: number; type: string; source_type?: string | null };
type Liability = { id: string; person_id: string | null; name: string; balance: number; type: string; source_type?: string | null };

type Props = {
  currentUserId: string;
  householdName?: string | null;
  people: Person[];
  assets: Asset[];
  liabilities: Liability[];
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";
type Modal = null | "asset" | "liability";

type Totals = {
  assets: number;
  liabilities: number;
  netWorth: number;
  property: number;
  cash: number;
  investments: number;
  pension: number;
  mortgage: number;
  items: number;
};

function ownerLabel(peopleById: Map<string, Person>, personId: string | null) {
  return personId ? peopleById.get(personId)?.name ?? "Unknown" : "Shared";
}

function typeLabel(type: string) {
  return type.replaceAll("_", " ");
}

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function totalsFor(assets: Asset[], liabilities: Liability[]): Totals {
  const totalAssets = assets.reduce((sum, asset) => sum + n(asset.value), 0);
  const totalLiabilities = liabilities.reduce((sum, liability) => sum + n(liability.balance), 0);
  const property = assets.filter((asset) => asset.type === "property").reduce((sum, asset) => sum + n(asset.value), 0);
  const cash = assets.filter((asset) => asset.type === "cash" || asset.type === "current_account" || asset.type === "savings").reduce((sum, asset) => sum + n(asset.value), 0);
  const investments = assets.filter((asset) => asset.type === "investment").reduce((sum, asset) => sum + n(asset.value), 0);
  const pension = assets.filter((asset) => asset.type === "pension").reduce((sum, asset) => sum + n(asset.value), 0);
  const mortgage = liabilities.filter((liability) => liability.type === "mortgage").reduce((sum, liability) => sum + n(liability.balance), 0);
  return {
    assets: totalAssets,
    liabilities: totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    property,
    cash,
    investments,
    pension,
    mortgage,
    items: assets.length + liabilities.length,
  };
}

function percent(value: number, total: number) {
  if (total <= 0 || value <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function selfPersonId(people: Person[], currentUserId: string) {
  return people.find((person) => person.linked_user_id === currentUserId || person.user_id === currentUserId)?.id || people.find((person) => person.relationship === "self")?.id || people[0]?.id || null;
}

function MiniSparkline({ tone = "blue" }: { tone?: "blue" | "purple" }) {
  const points = tone === "blue" ? "6,54 42,42 78,24 116,30 154,34 196,26 236,44 278,32 318,18 356,24" : "6,58 42,50 78,36 116,28 154,18 196,26 236,30 278,20 318,8 356,14";
  const stroke = tone === "blue" ? "#3b82f6" : "#a855f7";
  const fill = tone === "blue" ? "rgba(59,130,246,.12)" : "rgba(168,85,247,.12)";
  return (
    <svg viewBox="0 0 362 72" className="h-24 w-full" aria-hidden="true">
      <polygon points={`0,72 ${points} 362,72`} fill={fill} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SplitItem({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className="min-w-[88px]">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Icon className={`h-4 w-4 ${tone}`} /> {label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function SummaryBlock({ title, totals, tone, href }: { title: string; totals: Totals; tone: "blue" | "purple"; href: string }) {
  const accent = tone === "blue" ? "border-l-blue-500" : "border-l-purple-500";
  return (
    <article className={`rounded-[2rem] border border-slate-100 border-l-4 ${accent} bg-white p-6 shadow-[0_24px_90px_-70px_rgba(15,23,42,.85)]`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{title}</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{formatMoney(totals.netWorth)}</h2>
          <p className="mt-2 flex items-center gap-2 text-sm font-black text-emerald-700"><ArrowUpRight className="h-4 w-4" /> 12M movement tracked from stored snapshots</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500">12M</span>
      </div>
      <div className="mt-3"><MiniSparkline tone={tone} /></div>
      <div className="mt-4 grid gap-4 border-y border-slate-100 py-4 sm:grid-cols-2 lg:grid-cols-6">
        <div><p className="text-xs font-bold text-slate-500">Assets</p><p className="mt-1 font-black text-slate-950">{formatMoney(totals.assets)}</p></div>
        <div><p className="text-xs font-bold text-slate-500">Liabilities</p><p className="mt-1 font-black text-slate-950">{formatMoney(totals.liabilities)}</p></div>
        <SplitItem icon={WalletCards} label="Cash" value={percent(totals.cash, totals.assets)} tone="text-blue-600" />
        <SplitItem icon={LineChart} label="Investments" value={percent(totals.investments, totals.assets)} tone="text-purple-600" />
        <SplitItem icon={PiggyBank} label="Pension" value={percent(totals.pension, totals.assets)} tone="text-emerald-600" />
        <SplitItem icon={Home} label="Property" value={percent(totals.property, totals.assets)} tone="text-orange-600" />
      </div>
      <a href={href} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-blue-900">{title.toLowerCase().includes("household") ? "View household breakdown" : "View your accounts"} <ChevronRight className="h-4 w-4" /></a>
    </article>
  );
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

export function NetWorthClient({ currentUserId, householdName, people, assets, liabilities }: Props) {
  const [personFilter, setPersonFilter] = useState(selfPersonId(people, currentUserId) || "all");
  const [modal, setModal] = useState<Modal>(null);
  const [addOpen, setAddOpen] = useState(false);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const defaultSelfPersonId = selfPersonId(people, currentUserId);
  const leftPersonId = personFilter === "all" ? defaultSelfPersonId : personFilter;
  const selectedPerson = leftPersonId ? peopleById.get(leftPersonId) || null : null;
  const personalAssets = leftPersonId ? assets.filter((asset) => asset.person_id === leftPersonId) : [];
  const personalLiabilities = leftPersonId ? liabilities.filter((liability) => liability.person_id === leftPersonId) : [];
  const householdAssets = assets;
  const householdLiabilities = liabilities;
  const personalTotals = totalsFor(personalAssets, personalLiabilities);
  const householdTotals = totalsFor(householdAssets, householdLiabilities);
  const heroTotals = personFilter === "all" ? householdTotals : personalTotals;
  const selectedName = selectedPerson?.name || (personFilter === "all" ? householdName || "household" : "person");

  const visibleAssets = personFilter === "all" ? householdAssets : personalAssets;
  const visibleLiabilities = personFilter === "all" ? householdLiabilities : personalLiabilities;
  const assetGroups = [
    { label: "Cash", type: "cash", value: personalTotals.cash, count: personalAssets.filter((asset) => ["cash", "savings", "current_account"].includes(asset.type)).length, icon: WalletCards },
    { label: "Investments", type: "investment", value: personalTotals.investments, count: personalAssets.filter((asset) => asset.type === "investment").length, icon: LineChart },
    { label: "Pension", type: "pension", value: personalTotals.pension, count: personalAssets.filter((asset) => asset.type === "pension").length, icon: PiggyBank },
  ].filter((group) => group.value > 0 || group.count > 0);

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-7 px-4 py-6 md:px-8">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-slate-950 p-7 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-9">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Net worth</p>
            <h1 className="mt-3 text-5xl font-black tracking-tight md:text-6xl">{formatMoney(heroTotals.netWorth)}</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300">Auto-pulls homes and mortgages, then blends in cash, pensions, investments and manual debts. The two-block view keeps your position separate from the household view.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Assets</p><p className="mt-1 text-2xl font-black">{formatMoney(heroTotals.assets)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Liabilities</p><p className="mt-1 text-2xl font-black">{formatMoney(heroTotals.liabilities)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Items</p><p className="mt-1 text-2xl font-black">{heroTotals.items}</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-slate-100 bg-white/85 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-black text-slate-600"><Home className="h-4 w-4" /> Household</span>
          <button onClick={() => setPersonFilter("all")} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === "all" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>All household</button>
          {people.map((person) => <button key={person.id} onClick={() => setPersonFilter(person.id)} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === person.id ? "bg-slate-950 text-white" : person.relationship === "child" ? "border border-sky-100 bg-sky-50 text-sky-800" : "border border-orange-100 bg-orange-50 text-orange-800"}`}>{person.name}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedPerson ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> {selectedPerson.name} is a household member · no pending duplicate invites</span> : null}
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
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <SummaryBlock title="Your net worth" totals={personalTotals} tone="blue" href="/accounts" />
        <SummaryBlock title="Household net worth" totals={householdTotals} tone="purple" href="/net-worth" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Your assets" description={`Focused on ${selectedName}. Shared household rows do not inflate this personal card.`}>
          <div className="space-y-3">
            {assetGroups.length ? assetGroups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.type} className="flex items-center justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-blue-700"><Icon className="h-5 w-5" /></span><div><p className="font-black text-slate-950">{group.label}</p><p className="text-sm font-medium text-slate-500">{group.count} account{group.count === 1 ? "" : "s"}</p></div></div>
                  <div className="text-right"><p className="text-lg font-black text-slate-950">{formatMoney(group.value)}</p><p className="text-xs font-bold text-emerald-600">{percent(group.value, personalTotals.assets)} of assets</p></div>
                </div>
              );
            }) : <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">No personal assets yet. Add one or assign an owner to an existing account.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Your liabilities" description="Mortgage balances are projected from the mortgage page; add other loans/cards here.">
          <div className="space-y-3">
            {visibleLiabilities.length === 0 ? (
              <div className="grid place-items-center rounded-3xl border border-slate-200 bg-white p-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-sky-50 text-sky-700"><ShieldCheck className="h-8 w-8" /></span>
                <p className="mt-4 font-black text-slate-950">No liabilities</p>
                <p className="mt-1 text-sm font-medium text-slate-500">Great work. You have no outstanding liabilities in this view.</p>
              </div>
            ) : null}
            {visibleLiabilities.map((liability) => (
              <div key={liability.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${liabilityAccent(liability.type)}`} />
                <div className="flex items-center justify-between gap-4 p-5">
                  <div><p className="font-black text-slate-950">{liability.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{typeLabel(liability.type)} · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{ownerLabel(peopleById, liability.person_id)}</span>{liability.source_type === "mortgage" ? " · auto from mortgage" : ""}</p></div>
                  <div className="text-right"><p className="text-xl font-black">{formatMoney(liability.balance)}</p>{liability.source_type === "mortgage" ? null : <form action={deleteLiability}><input type="hidden" name="id" value={liability.id} /><button className="inline-flex items-center gap-1 text-sm font-bold text-red-600"><Trash2 className="h-4 w-4" /> Delete</button></form>}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Detailed items" description="Full item list remains available underneath the summary so nothing is hidden from power users.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {visibleAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${assetAccent(asset.type)}`} />
                <div className="flex items-center justify-between gap-4 p-5">
                  <div><p className="font-black text-slate-950">{asset.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{typeLabel(asset.type)} · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{ownerLabel(peopleById, asset.person_id)}</span>{asset.source_type ? ` · auto from ${asset.source_type}` : ""}</p></div>
                  <div className="text-right"><p className="text-xl font-black">{formatMoney(asset.value)}</p>{asset.source_type ? null : <form action={deleteAsset}><input type="hidden" name="id" value={asset.id} /><button className="inline-flex items-center gap-1 text-sm font-bold text-red-600"><Trash2 className="h-4 w-4" /> Delete</button></form>}</div>
                </div>
              </div>
            ))}
            {visibleAssets.length === 0 ? <p className="text-sm text-slate-500">No assets yet.</p> : null}
          </div>
          <div className="space-y-3">
            {visibleLiabilities.map((liability) => (
              <div key={`detail-${liability.id}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${liabilityAccent(liability.type)}`} />
                <div className="flex items-center justify-between gap-4 p-5">
                  <div><p className="font-black text-slate-950">{liability.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{typeLabel(liability.type)} · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{ownerLabel(peopleById, liability.person_id)}</span>{liability.source_type === "mortgage" ? " · auto from mortgage" : ""}</p></div>
                  <div className="text-right"><p className="text-xl font-black">{formatMoney(liability.balance)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
      {modal ? <AddModal type={modal} people={people} onClose={() => setModal(null)} /> : null}
    </main>
  );
}
