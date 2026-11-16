"use client";

// Things in the home, as a list: type a product name or paste a shop link, add what you paid,
// when you bought it and the warranty. Each line shows when the warranty ends and roughly when
// it'll need replacing. (The room-map version is parked in HomeItemsMapPlanner.tsx.)

import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteHomeItem, listHomeItems, saveHomeItem, setHomeItemStatus, type HomeItemInput } from "@/app/mortgage/home-items-actions";
import { HOME_ITEM_KINDS, KIND_BY_KEY, STATUS_STYLE, nameFromProductUrl, parseHomeItemText, planHomeItem, type HomeItem } from "@/lib/home/items";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const money2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const niceDate = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const monthYear = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const STATUS_RANK = { past_life: 0, nearing_end: 1, warranty_ending: 2, out_of_warranty: 3, unknown: 4, in_warranty: 5 } as const;

const WARRANTY_OPTIONS: Array<[string, string]> = [["", "Not sure"], ["0", "No warranty"], ["12", "1 year"], ["24", "2 years"], ["36", "3 years"], ["60", "5 years"], ["72", "6 years"], ["120", "10 years"], ["custom", "Other…"]];
const PRESET_MONTHS = new Set(WARRANTY_OPTIONS.map(([value]) => value).filter((value) => value && value !== "custom"));

type Form = {
  id?: string;
  input: string;
  kind: string;
  kindTouched: boolean;
  price: string;
  boughtOn: string;
  warranty: string;
  warrantyMonths: string;
  brand: string;
  retailer: string;
  productUrl: string;
  extendedWarrantyEndsOn: string;
  warrantyProvider: string;
  expectedLifeYears: string;
  replacementCost: string;
  notes: string;
};

const emptyForm = (): Form => ({ input: "", kind: "", kindTouched: false, price: "", boughtOn: "", warranty: "12", warrantyMonths: "", brand: "", retailer: "", productUrl: "", extendedWarrantyEndsOn: "", warrantyProvider: "", expectedLifeYears: "", replacementCost: "", notes: "" });

function formFromItem(item: HomeItem): Form {
  const months = item.warranty_months;
  return {
    id: item.id,
    input: item.label,
    kind: item.kind,
    kindTouched: true,
    price: item.price != null ? String(item.price) : "",
    boughtOn: item.purchased_on || "",
    warranty: months == null ? "" : PRESET_MONTHS.has(String(months)) ? String(months) : "custom",
    warrantyMonths: months != null ? String(months) : "",
    brand: item.brand || "",
    retailer: item.retailer || "",
    productUrl: item.product_url || "",
    extendedWarrantyEndsOn: item.extended_warranty_ends_on || "",
    warrantyProvider: item.warranty_provider || "",
    expectedLifeYears: item.expected_life_years != null ? String(item.expected_life_years) : "",
    replacementCost: item.replacement_cost != null ? String(item.replacement_cost) : "",
    notes: item.notes || "",
  };
}

/** What the name/link box tells us: a cleaned-up name, the link, the shop, and a guess at what it is. */
function readInput(form: Form, today: string) {
  const raw = form.input.trim();
  const link = /^https?:\/\//i.test(raw) ? nameFromProductUrl(raw) : null;
  const name = link ? link.name || "" : raw;
  const parsed = parseHomeItemText(name, today);
  const kind = form.kindTouched && form.kind ? form.kind : parsed.kind || "other";
  return {
    name,
    url: link?.url || (form.productUrl && !link ? form.productUrl : ""),
    retailer: link?.retailer || null,
    kind,
    brand: parsed.brand,
    linkUnreadable: Boolean(link && !link.name),
  };
}

function warrantyMonthsOf(form: Form) {
  if (form.warranty === "custom") return form.warrantyMonths === "" ? null : Number(form.warrantyMonths);
  return form.warranty === "" ? null : Number(form.warranty);
}

export function HomeItemsPlanner({ homeId }: { homeId: string | null; houseStyle?: unknown }) {
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [today] = useState(londonToday);
  const [isPending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listHomeItems(homeId)
      .then((result) => { if (!cancelled) setItems(result.items); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load your things."); });
    return () => { cancelled = true; };
  }, [reloadKey, homeId]);

  const rows = useMemo(() => (items || [])
    .filter((item) => item.status === "active" && (!homeId || !item.home_id || item.home_id === homeId))
    .map((item) => ({ item, plan: planHomeItem(item, today) }))
    .sort((a, b) => STATUS_RANK[a.plan.status] - STATUS_RANK[b.plan.status] || String(a.plan.warrantyEnds || "9999").localeCompare(String(b.plan.warrantyEnds || "9999"))), [items, homeId, today]);
  const gone = (items || []).filter((item) => item.status !== "active");

  const totals = useMemo(() => {
    const soon = rows.filter(({ plan }) => plan.status === "past_life" || plan.status === "nearing_end");
    return {
      count: rows.length,
      outOfWarranty: rows.filter(({ plan }) => ["out_of_warranty", "nearing_end", "past_life"].includes(plan.status)).length,
      ending: rows.filter(({ plan }) => plan.status === "warranty_ending").length,
      setAside: rows.reduce((sum, { plan }) => sum + plan.monthlySetAside, 0),
      dueSoonCost: soon.reduce((sum, { plan }) => sum + plan.replacementCost, 0),
      dueSoonCount: soon.length,
      guesses: rows.filter(({ plan }) => plan.costIsGuess).length,
    };
  }, [rows]);

  function submit(current: Form, done: () => void) {
    const read = readInput(current, today);
    const label = read.name.trim() || KIND_BY_KEY.get(read.kind)?.label || "";
    if (!label) { setMessage({ tone: "error", text: "Add what it is — a name or a link." }); return; }
    const kind = KIND_BY_KEY.get(read.kind) || KIND_BY_KEY.get("other")!;
    const payload: HomeItemInput = {
      id: current.id,
      homeId,
      room: kind.room,
      kind: kind.key,
      label: label.slice(0, 120),
      brand: current.brand || read.brand,
      purchasedOn: current.boughtOn || null,
      price: current.price,
      retailer: current.retailer || read.retailer,
      productUrl: read.url || null,
      warrantyMonths: warrantyMonthsOf(current),
      extendedWarrantyEndsOn: current.extendedWarrantyEndsOn || null,
      warrantyProvider: current.warrantyProvider || null,
      expectedLifeYears: current.expectedLifeYears,
      replacementCost: current.replacementCost,
      notes: current.notes || null,
    };
    startTransition(async () => {
      try {
        await saveHomeItem(payload);
        done();
        setMessage({ tone: "ok", text: current.id ? "Saved." : `Added ${label}.` });
        setReloadKey((key) => key + 1);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't save that." });
      }
    });
  }

  function act(task: () => Promise<unknown>) {
    startTransition(async () => {
      try { await task(); setEditing(null); setReloadKey((key) => key + 1); }
      catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't change that." }); }
    });
  }

  if (loadError) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{loadError}</p>;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {[
          ["Things logged", String(totals.count), totals.count ? `${totals.outOfWarranty} out of warranty` : "Add your first below"],
          ["Warranty ending", String(totals.ending), "In the next 90 days"],
          ["Put aside", `${money(totals.setAside)}/mo`, totals.guesses ? `Uses typical prices for ${totals.guesses}` : "So replacements are covered"],
          ["Could need replacing", money(totals.dueSoonCost), totals.dueSoonCount ? `${totals.dueSoonCount} within a year or past usual life` : "Nothing due in the next year"],
        ].map(([label, main, helper]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold">{main}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{helper}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold">Add something</h2>
        <ItemFields form={form} setForm={setForm} today={today} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={isPending || !form.input.trim()} onClick={() => submit(form, () => setForm(emptyForm()))} className="rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-bold text-white disabled:bg-slate-300">{isPending && !editing ? "Adding…" : "Add"}</button>
          {message ? <p className={`text-xs font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-lg font-bold">Your things</h2>
          <span className="text-xs font-semibold text-slate-400">Most urgent first</span>
        </div>
        {items === null ? <p className="p-5 text-sm text-slate-400">Loading…</p> : null}
        {items !== null && !rows.length ? <p className="p-5 text-sm text-slate-500">Nothing yet. Add your dishwasher, washing machine, boiler, TV — anything you&apos;d have to replace.</p> : null}
        {rows.length ? (
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-slate-100 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:grid">
            <span>Item</span><span>Bought</span><span className="text-right">Paid</span><span>Warranty</span><span>Replace around</span><span />
          </div>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {rows.map(({ item, plan }) => {
            const kind = KIND_BY_KEY.get(item.kind);
            if (editing?.id === item.id) {
              return (
                <li key={item.id} className="bg-violet-50/40 px-4 py-4 sm:px-5">
                  <ItemFields form={editing} setForm={(next) => setEditing(typeof next === "function" ? next(editing) : next)} today={today} expanded />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={isPending} onClick={() => submit(editing, () => setEditing(null))} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{isPending ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Cancel</button>
                    <button type="button" disabled={isPending} onClick={() => act(() => setHomeItemStatus(item.id, "replaced"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Replaced it</button>
                    <button type="button" disabled={isPending} onClick={() => act(() => setHomeItemStatus(item.id, "gone"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Got rid of it</button>
                    <button type="button" disabled={isPending} onClick={() => { if (window.confirm(`Delete ${item.label}? This can't be undone. (Use "Replaced it" to keep its history.)`)) act(() => deleteHomeItem(item.id)); }} className="ml-auto text-xs font-bold text-rose-700">Delete</button>
                  </div>
                </li>
              );
            }
            return (
              <li key={item.id} className="grid gap-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-base" style={{ boxShadow: `0 0 0 2px ${STATUS_STYLE[plan.status].dot}` }} aria-hidden>{kind?.icon || "📦"}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950" title={item.label}>{item.label}</p>
                    <p className="truncate text-[11px] font-semibold text-slate-500">
                      {[kind && kind.key !== "other" ? kind.label : null, item.brand, item.retailer].filter(Boolean).join(" · ") || "—"}
                      {item.product_url ? <> · <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">link</a></> : null}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-600"><span className="font-bold text-slate-400 md:hidden">Bought </span>{monthYear(item.purchased_on)}</p>
                <p className="text-xs font-bold text-slate-800 md:text-right"><span className="font-bold text-slate-400 md:hidden">Paid </span>{item.price != null ? money2(Number(item.price)) : "—"}</p>
                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[plan.status].chip}`}>{STATUS_STYLE[plan.status].label}</span>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{plan.warrantyEnds ? `${plan.daysToWarrantyEnd != null && plan.daysToWarrantyEnd < 0 ? "Ended" : "Ends"} ${niceDate(plan.warrantyEnds)}` : item.warranty_months === 0 ? "No warranty" : "Add bought date + warranty"}</p>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-slate-800">{plan.lifeEnds ? monthYear(plan.lifeEnds) : "—"}<span className="font-semibold text-slate-500"> · {money(plan.replacementCost)}{plan.costIsGuess ? "*" : ""}</span></p>
                  <p className="text-[11px] font-semibold text-slate-500">{plan.monthlySetAside > 0 ? `${money2(plan.monthlySetAside)}/mo to put aside` : plan.status === "past_life" ? "Could go any time" : plan.status === "nearing_end" ? "Due within a year" : ""}</p>
                </div>
                <button type="button" onClick={() => { setMessage(null); setEditing(formFromItem(item)); }} className="justify-self-start rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 md:justify-self-end">Edit</button>
              </li>
            );
          })}
        </ul>
        {rows.length ? <p className="border-t border-slate-100 px-5 py-3 text-[11px] font-semibold leading-5 text-slate-400">Replace around uses a rough UK lifespan for each kind of item; * means a typical price, because no price was added. Change either under Edit → More details.</p> : null}
      </section>

      {gone.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setShowGone((v) => !v)} className="text-xs font-bold text-slate-600">{showGone ? "Hide" : "Show"} replaced or gone ({gone.length})</button>
          {showGone ? (
            <ul className="mt-3 space-y-1.5">
              {gone.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate font-semibold text-slate-600">{KIND_BY_KEY.get(item.kind)?.icon} {item.label} · {item.status === "replaced" ? "replaced" : "gone"}</span>
                  <button type="button" onClick={() => act(() => setHomeItemStatus(item.id, "active"))} className="shrink-0 text-xs font-bold text-violet-700">Bring back</button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ItemFields({ form, setForm, today, expanded = false }: { form: Form; setForm: (next: Form | ((current: Form) => Form)) => void; today: string; expanded?: boolean }) {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const read = readInput(form, today);
  const kind = KIND_BY_KEY.get(read.kind) || KIND_BY_KEY.get("other")!;
  const input = "mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const label = "block text-xs font-bold text-slate-600";
  return (
    <div className="mt-3 space-y-3">
      <label className={label}>Product name or link
        <input value={form.input} onChange={(event) => set({ input: event.target.value })} placeholder="e.g. Bosch Series 4 dishwasher — or paste the link from Currys, AO, Amazon…" className={input} />
      </label>
      {form.input.trim() ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
          {read.url ? <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-800">Link saved{read.retailer ? ` · ${read.retailer}` : ""}</span> : null}
          {read.url && read.name ? <span className="truncate">Name: <span className="font-bold text-slate-700">{read.name}</span></span> : null}
          {read.linkUnreadable ? <span className="text-amber-700">Couldn&apos;t read a name from that link — pick what it is below.</span> : null}
          <label className="inline-flex items-center gap-1">It&apos;s a
            <select value={read.kind} onChange={(event) => set({ kind: event.target.value, kindTouched: true })} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
              {HOME_ITEM_KINDS.map((option) => <option key={option.key} value={option.key}>{option.icon} {option.label}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Price paid (£)
          <input inputMode="decimal" value={form.price} onChange={(event) => set({ price: event.target.value })} placeholder="e.g. 449" className={input} />
        </label>
        <label className={label}>Date bought
          <input type="date" value={form.boughtOn} max={today} onChange={(event) => set({ boughtOn: event.target.value })} className={input} />
        </label>
        <label className={label}>Warranty
          <select value={form.warranty} onChange={(event) => set({ warranty: event.target.value })} className={input}>
            {WARRANTY_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      </div>
      {form.warranty === "custom" ? (
        <label className={`${label} max-w-40`}>Warranty (months)
          <input inputMode="numeric" value={form.warrantyMonths} onChange={(event) => set({ warrantyMonths: event.target.value.replace(/\D/g, "").slice(0, 3) })} className={input} />
        </label>
      ) : null}
      <details open={expanded && Boolean(form.extendedWarrantyEndsOn || form.warrantyProvider || form.expectedLifeYears || form.replacementCost || form.notes || form.brand || form.retailer)} className="rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-600">More details (extended cover, brand, your own lifespan)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>Extended warranty or cover ends
            <input type="date" value={form.extendedWarrantyEndsOn} onChange={(event) => set({ extendedWarrantyEndsOn: event.target.value })} className={input} />
          </label>
          <label className={label}>Who covers it
            <input value={form.warrantyProvider} onChange={(event) => set({ warrantyProvider: event.target.value })} placeholder="e.g. Currys Care & Repair" className={input} />
          </label>
          <label className={label}>Brand
            <input value={form.brand} onChange={(event) => set({ brand: event.target.value })} placeholder={read.brand || "Optional"} className={input} />
          </label>
          <label className={label}>Bought from
            <input value={form.retailer} onChange={(event) => set({ retailer: event.target.value })} placeholder={read.retailer || "Optional"} className={input} />
          </label>
          <label className={label}>Expected life (years)
            <input inputMode="decimal" value={form.expectedLifeYears} onChange={(event) => set({ expectedLifeYears: event.target.value })} placeholder={`About ${kind.lifeYears}`} className={input} />
          </label>
          <label className={label}>Cost to replace (£)
            <input inputMode="decimal" value={form.replacementCost} onChange={(event) => set({ replacementCost: event.target.value })} placeholder={form.price ? "Uses price paid" : kind.typicalCost ? `About ${money(kind.typicalCost)}` : "Optional"} className={input} />
          </label>
          <label className={`${label} sm:col-span-2`}>Notes
            <textarea value={form.notes} onChange={(event) => set({ notes: event.target.value })} rows={2} placeholder="Serial number, where the receipt is, repair history…" className={input} />
          </label>
        </div>
      </details>
    </div>
  );
}
