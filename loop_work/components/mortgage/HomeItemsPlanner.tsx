"use client";

// Things in the home, as a list of cards: paste a shop link (picture, name and price are looked
// up where the shop allows it) or type a name, add the price, date and warranty. Each card shows
// a lifespan timeline, what it costs to run and what it really costs a year to own. Changes made
// in another tab or by someone else in the household appear straight away.
// (The room-map version is parked in HomeItemsMapPlanner.tsx.)

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteHomeItem, listHomeItems, previewProductLink, saveEnergyRates, saveHomeItem, setHomeItemStatus, type HomeItemInput } from "@/app/mortgage/home-items-actions";
import { HOME_ITEM_KINDS, KIND_BY_KEY, PRICE_CAP_RATES, STATUS_STYLE, nameFromProductUrl, parseHomeItemText, planHomeItem, runningCost, type EnergyRates, type HomeItem, type HomeItemPlan, type RunningCost } from "@/lib/home/items";
import { createClient } from "@/lib/supabase/client";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { UK_CONSUMER_LAW_NOTE, UK_CONSUMER_LAW_SOURCE, brandWarrantyFor } from "@/lib/home/brand-warranties";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const money2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pence = (pounds: number) => (pounds < 1 ? `${Math.round(pounds * 100)}p` : money2(pounds));
const monthYear = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000;
const STATUS_RANK = { past_life: 0, nearing_end: 1, warranty_ending: 2, out_of_warranty: 3, unknown: 4, in_warranty: 5 } as const;
const SYNC_CHANNEL = "loop-home-items";

const WARRANTY_OPTIONS: Array<[string, string]> = [["", "Not sure"], ["0", "No warranty"], ["12", "1 year"], ["24", "2 years"], ["36", "3 years"], ["60", "5 years"], ["72", "6 years"], ["120", "10 years"], ["custom", "Other…"]];
const PRESET_MONTHS = new Set(WARRANTY_OPTIONS.map(([value]) => value).filter((value) => value && value !== "custom"));

type Preview = { url: string; loading: boolean; title: string | null; image: string | null; price: number | null; brand: string | null; reason?: string };

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
  imageUrl: string;
  extendedWarrantyEndsOn: string;
  warrantyProvider: string;
  expectedLifeYears: string;
  replacementCost: string;
  notes: string;
  fuel: string;
  energyPerUseKwh: string;
  usesPerWeek: string;
  powerWatts: string;
  hoursPerDay: string;
  annualKwh: string;
};

const emptyForm = (): Form => ({ input: "", kind: "", kindTouched: false, price: "", boughtOn: "", warranty: "12", warrantyMonths: "", brand: "", retailer: "", productUrl: "", imageUrl: "", extendedWarrantyEndsOn: "", warrantyProvider: "", expectedLifeYears: "", replacementCost: "", notes: "", fuel: "", energyPerUseKwh: "", usesPerWeek: "", powerWatts: "", hoursPerDay: "", annualKwh: "" });

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function formFromItem(item: HomeItem): Form {
  const months = item.warranty_months;
  return {
    id: item.id, input: item.label, kind: item.kind, kindTouched: true, price: str(item.price), boughtOn: item.purchased_on || "",
    warranty: months == null ? "" : PRESET_MONTHS.has(String(months)) ? String(months) : "custom", warrantyMonths: str(months),
    brand: item.brand || "", retailer: item.retailer || "", productUrl: item.product_url || "", imageUrl: item.image_url || "",
    extendedWarrantyEndsOn: item.extended_warranty_ends_on || "", warrantyProvider: item.warranty_provider || "",
    expectedLifeYears: str(item.expected_life_years), replacementCost: str(item.replacement_cost), notes: item.notes || "",
    fuel: item.fuel || "", energyPerUseKwh: str(item.energy_per_use_kwh), usesPerWeek: str(item.uses_per_week), powerWatts: str(item.power_watts), hoursPerDay: str(item.hours_per_day), annualKwh: str(item.annual_kwh),
  };
}

/** What the name/link box tells us. A looked-up page title beats the name read from the link. */
function readInput(form: Form, today: string, preview: Preview | null) {
  const raw = form.input.trim();
  const isLink = /^https?:\/\//i.test(raw);
  const link = isLink ? nameFromProductUrl(raw) : null;
  const fetched = isLink && preview?.url === raw ? preview : null;
  const name = isLink ? fetched?.title || link?.name || "" : raw;
  const parsed = parseHomeItemText(name, today);
  return {
    isLink,
    name,
    url: link?.url || (!isLink ? form.productUrl : ""),
    retailer: link?.retailer || null,
    kind: form.kindTouched && form.kind ? form.kind : parsed.kind || "other",
    brand: fetched?.brand || parsed.brand,
    image: form.imageUrl || fetched?.image || "",
    price: fetched?.price ?? null,
    fetched,
  };
}

function warrantyMonthsOf(form: Form) {
  if (form.warranty === "custom") return form.warrantyMonths === "" ? null : Number(form.warrantyMonths);
  return form.warranty === "" ? null : Number(form.warranty);
}

/** The usage fields as an item, so the same running-cost maths drives the preview and the cards. */
function usageOf(form: Form, kind: string) {
  const n = (value: string) => (value.trim() === "" ? null : Number(value));
  return { kind, fuel: (form.fuel || null) as HomeItem["fuel"], energy_per_use_kwh: n(form.energyPerUseKwh), uses_per_week: n(form.usesPerWeek), power_watts: n(form.powerWatts), hours_per_day: n(form.hoursPerDay), annual_kwh: n(form.annualKwh) };
}

export function HomeItemsPlanner({ homeId, addRequest = 0 }: { homeId: string | null; houseStyle?: unknown; addRequest?: number }) {
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [rates, setRates] = useState<EnergyRates & { own: boolean }>({ electricity: PRICE_CAP_RATES.electricity, gas: PRICE_CAP_RATES.gas, own: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<Form | null>(null);
  const [adding, setAdding] = useState(false);
  // The "Add something" button lives in the House sidebar; each press bumps addRequest.
  const [seenRequest, setSeenRequest] = useState(addRequest);
  if (addRequest !== seenRequest) {
    setSeenRequest(addRequest);
    setAdding(true);
    setEditing(null);
  }
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [live, setLive] = useState(false);
  const [today] = useState(londonToday);
  const [isPending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const refreshSoon = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setReloadKey((key) => key + 1), 250);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listHomeItems(homeId)
      .then((result) => { if (!cancelled) { setItems(result.items); setRates(result.rates); } })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load your things."); });
    return () => { cancelled = true; };
  }, [reloadKey, homeId]);

  // Live updates: other tabs in this browser (instant), and anyone in the household (database changes).
  useEffect(() => {
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL) : null;
    channelRef.current = broadcast;
    if (broadcast) broadcast.onmessage = () => refreshSoon();
    const supabase = createClient();
    const channel = supabase
      .channel(`home-items-${homeId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "home_items" }, () => refreshSoon())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const onFocus = () => { if (document.visibilityState === "visible") refreshSoon(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      broadcast?.close();
      channelRef.current = null;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [homeId, refreshSoon]);

  // Look up a pasted link once it stops changing.
  const linkInput = form.input.trim();
  useEffect(() => {
    if (!/^https?:\/\/\S+\.\S+/i.test(linkInput)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreview({ url: linkInput, loading: true, title: null, image: null, price: null, brand: null });
      previewProductLink(linkInput)
        .then((result) => { if (!cancelled) setPreview({ url: linkInput, loading: false, title: result.title, image: result.image, price: result.price, brand: result.brand, reason: result.reason }); })
        .catch((error) => { if (!cancelled) setPreview({ url: linkInput, loading: false, title: null, image: null, price: null, brand: null, reason: error instanceof Error ? error.message : "Couldn't look that up." }); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [linkInput]);

  const rows = useMemo(() => (items || [])
    .filter((item) => item.status === "active" && (!homeId || !item.home_id || item.home_id === homeId))
    .map((item) => {
      const plan = planHomeItem(item, today);
      const run = runningCost(item, rates);
      const ownershipPerYear = plan.replacementCost / Math.max(0.5, plan.lifeYears) + (run?.annualCost || 0);
      return { item, plan, run, ownershipPerYear };
    })
    .sort((a, b) => STATUS_RANK[a.plan.status] - STATUS_RANK[b.plan.status] || String(a.plan.warrantyEnds || "9999").localeCompare(String(b.plan.warrantyEnds || "9999"))), [items, homeId, today, rates]);
  const gone = (items || []).filter((item) => item.status !== "active");

  const totals = useMemo(() => {
    const soon = rows.filter(({ plan }) => plan.status === "past_life" || plan.status === "nearing_end");
    return {
      count: rows.length,
      outOfWarranty: rows.filter(({ plan }) => ["out_of_warranty", "nearing_end", "past_life"].includes(plan.status)).length,
      ending: rows.filter(({ plan }) => plan.status === "warranty_ending").length,
      running: rows.reduce((sum, { run }) => sum + (run?.annualCost || 0), 0),
      runningTypical: rows.filter(({ run }) => run?.typical).length,
      setAside: rows.reduce((sum, { plan }) => sum + plan.monthlySetAside, 0),
      dueSoonCost: soon.reduce((sum, { plan }) => sum + plan.replacementCost, 0),
      dueSoonCount: soon.length,
    };
  }, [rows]);

  const closeAdd = useCallback(() => setAdding(false), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  function announce() { channelRef.current?.postMessage("changed"); }

  function submit(current: Form, done: () => void) {
    const read = readInput(current, today, preview);
    const label = read.name.trim() || KIND_BY_KEY.get(read.kind)?.label || "";
    if (!label) { setMessage({ tone: "error", text: "Add what it is — a name or a link." }); return; }
    const kind = KIND_BY_KEY.get(read.kind) || KIND_BY_KEY.get("other")!;
    const payload: HomeItemInput = {
      id: current.id, homeId, room: kind.room, kind: kind.key, label: label.slice(0, 120),
      brand: current.brand || read.brand, purchasedOn: current.boughtOn || null,
      price: current.price || (read.price != null && !current.id ? String(read.price) : ""),
      retailer: current.retailer || read.retailer, productUrl: read.url || null, imageUrl: read.image || null,
      warrantyMonths: warrantyMonthsOf(current), extendedWarrantyEndsOn: current.extendedWarrantyEndsOn || null, warrantyProvider: current.warrantyProvider || null,
      expectedLifeYears: current.expectedLifeYears, replacementCost: current.replacementCost, notes: current.notes || null,
      fuel: current.fuel || null, energyPerUseKwh: current.energyPerUseKwh, usesPerWeek: current.usesPerWeek, powerWatts: current.powerWatts, hoursPerDay: current.hoursPerDay, annualKwh: current.annualKwh,
    };
    startTransition(async () => {
      try {
        await saveHomeItem(payload);
        done();
        setMessage({ tone: "ok", text: current.id ? "Saved." : `Added ${label}.` });
        announce();
        setReloadKey((key) => key + 1);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't save that." });
      }
    });
  }

  function act(task: () => Promise<unknown>) {
    startTransition(async () => {
      try { await task(); setEditing(null); announce(); setReloadKey((key) => key + 1); }
      catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't change that." }); }
    });
  }

  if (loadError) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{loadError}</p>;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        {[
          ["Things logged", String(totals.count), totals.count ? `${totals.outOfWarranty} out of warranty · ${totals.ending} ending soon` : "Add your first below"],
          ["Running costs", `${money(totals.running)}/yr`, totals.runningTypical ? `${totals.runningTypical} using typical use — add yours` : "From how you use them"],
          ["Put aside", `${money(totals.setAside)}/mo`, "So replacements are covered"],
          ["Could need replacing", money(totals.dueSoonCost), totals.dueSoonCount ? `${totals.dueSoonCount} within a year or past usual life` : "Nothing due in the next year"],
          ["Real cost a year", money(rows.reduce((sum, row) => sum + row.ownershipPerYear, 0)), "Wear and tear + running"],
        ].map(([label, main, helper], index) => (
          <article key={label} className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${index === 4 ? "col-span-2 xl:col-span-1" : ""}`}>
            <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{main}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{helper}</p>
          </article>
        ))}
      </section>

      <RatesBar rates={rates} homeId={homeId} onSaved={() => { announce(); setReloadKey((key) => key + 1); }} />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="text-lg font-bold">Your things {message?.tone === "ok" && !adding && !editing ? <span className="ml-2 align-middle text-xs font-bold text-emerald-700">{message.text}</span> : null}</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />{live ? "Live — updates as things change" : "Most urgent first"}
          </span>
        </div>
        {items === null ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-400 ring-1 ring-slate-200">Loading…</p> : null}
        {items !== null && !rows.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">Nothing yet. Press “Add something” to start with the big ones: boiler, fridge freezer, washing machine, dishwasher, oven.</p> : null}
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ item, plan, run, ownershipPerYear }) => (
            <ItemCard key={item.id} item={item} plan={plan} run={run} ownershipPerYear={ownershipPerYear} today={today} onEdit={() => { setMessage(null); setEditing(formFromItem(item)); }} />
          ))}
        </ul>
        {rows.length ? <p className="mt-3 px-1 text-[11px] font-semibold leading-5 text-slate-400">Lifespans, typical prices and typical use are rough UK guides — add your own under Edit for sharper numbers. Running costs use {rates.own ? "your energy prices" : `the ${PRICE_CAP_RATES.label}`}.</p> : null}
      </section>

      {adding ? (
        <ModalFrame eyebrow="In the home" title="Add something" description="Worth adding: anything that would cost £150+ to replace, or that you'd need fixed fast." maxWidth="max-w-2xl" onClose={closeAdd}>
      <div>
        {!form.input.trim() ? (
          <div className="flex flex-wrap gap-1.5">
            {["boiler", "fridge_freezer", "washing_machine", "dishwasher", "tumble_dryer", "oven", "hob", "tv", "laptop", "mattress", "sofa", "ev_charger"]
              .filter((key) => !(items || []).some((item) => item.status === "active" && item.kind === key))
              .slice(0, 8)
              .map((key) => { const k = KIND_BY_KEY.get(key)!; return <button key={key} type="button" onClick={() => setForm({ ...form, input: k.label, kind: key, kindTouched: true })} className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50">{k.icon} {k.label}</button>; })}
          </div>
        ) : null}
        <ItemFields form={form} setForm={setForm} today={today} preview={preview} rates={rates} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={isPending || !form.input.trim()} onClick={() => submit(form, () => { setForm(emptyForm()); setPreview(null); setAdding(false); })} className="rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-bold text-white disabled:bg-slate-300">{isPending && !editing ? "Adding…" : "Add"}</button>
          {message ? <p className={`text-xs font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p> : null}
        </div>
      </div>
        </ModalFrame>
      ) : null}

      {editing ? (
        <ModalFrame eyebrow="In the home" title={`Edit ${editing.input || "item"}`} maxWidth="max-w-2xl" onClose={closeEdit}>
          <div>
              <ItemFields form={editing} setForm={(next) => setEditing(next)} today={today} preview={null} rates={rates} expanded />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" disabled={isPending} onClick={() => submit(editing, () => setEditing(null))} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{isPending ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Cancel</button>
                <button type="button" disabled={isPending} onClick={() => act(() => setHomeItemStatus(editing.id!, "replaced"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Replaced it</button>
                <button type="button" disabled={isPending} onClick={() => act(() => setHomeItemStatus(editing.id!, "gone"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Got rid of it</button>
                <button type="button" disabled={isPending} onClick={() => { if (window.confirm(`Delete ${editing.input}? This can't be undone. (Use "Replaced it" to keep its history.)`)) act(() => deleteHomeItem(editing.id!)); }} className="ml-auto text-xs font-bold text-rose-700">Delete</button>
              </div>
              {message?.tone === "error" ? <p className="mt-2 text-xs font-bold text-rose-700">{message.text}</p> : null}
          </div>
        </ModalFrame>
      ) : null}

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

function ProductPicture({ image, kind, size = 72 }: { image: string | null | undefined; kind: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const icon = KIND_BY_KEY.get(kind)?.icon || "📦";
  const showImage = image && broken !== image;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-violet-50 ring-1 ring-slate-200" style={{ width: size, height: size }}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- shop images come from many domains
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(image)} className="h-full w-full bg-white object-contain p-1.5" />
      ) : (
        <span style={{ fontSize: size * 0.45 }} aria-hidden>{icon}</span>
      )}
    </span>
  );
}

/** Bought → warranty → usual end of life, with today marked. */
function Lifeline({ item, plan, today }: { item: HomeItem; plan: HomeItemPlan; today: string }) {
  if (!item.purchased_on || !plan.lifeEnds) {
    return <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">Add the date you bought it to see its timeline.</p>;
  }
  const start = dayNumber(item.purchased_on);
  const lifeEnd = dayNumber(plan.lifeEnds);
  const now = dayNumber(today);
  const end = Math.max(lifeEnd, now) + 1;
  const pct = (d: number) => `${Math.max(0, Math.min(100, ((d - start) / (end - start)) * 100))}%`;
  const warrantyEnd = plan.warrantyEnds ? Math.min(dayNumber(plan.warrantyEnds), end) : null;
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
        {warrantyEnd ? <span className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: pct(warrantyEnd) }} /> : null}
        <span className="absolute inset-y-0 bg-orange-300" style={{ left: pct(lifeEnd - 365.25), width: `calc(${pct(lifeEnd)} - ${pct(lifeEnd - 365.25)})` }} />
        {now > lifeEnd ? <span className="absolute inset-y-0 bg-rose-400" style={{ left: pct(lifeEnd), right: 0 }} /> : null}
        <span className="absolute -top-0.5 h-4 w-1 rounded-full bg-violet-700 ring-2 ring-white" style={{ left: `calc(${pct(now)} - 2px)` }} title="Today" />
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-semibold text-slate-500">
        <span>Bought {monthYear(item.purchased_on)}</span>
        {plan.warrantyEnds ? <span className="text-emerald-700">Warranty to {monthYear(plan.warrantyEnds)}</span> : <span>No warranty info</span>}
        <span className={now > lifeEnd ? "text-rose-700" : "text-orange-700"}>Usually lasts to ~{monthYear(plan.lifeEnds)}</span>
      </div>
    </div>
  );
}

function ItemCard({ item, plan, run, ownershipPerYear, today, onEdit }: { item: HomeItem; plan: HomeItemPlan; run: RunningCost | null; ownershipPerYear: number; today: string; onEdit: () => void }) {
  const kind = KIND_BY_KEY.get(item.kind);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex gap-3">
        <ProductPicture image={item.image_url} kind={item.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-950" title={item.label}>{item.label}</p>
            <button type="button" onClick={onEdit} className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Edit</button>
          </div>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
            {[kind && kind.key !== "other" ? kind.label : null, item.brand, item.retailer].filter(Boolean).join(" · ") || "—"}
            {item.product_url ? <> · <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">view</a></> : null}
          </p>
          <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[plan.status].chip}`}>{STATUS_STYLE[plan.status].label}</span>
          {item.warranty_months == null && !item.extended_warranty_ends_on ? (() => {
            const hint = brandWarrantyFor(`${item.brand || ""} ${item.label}`, item.kind);
            return hint?.standardMonths ? <p className="mt-1 text-[10px] font-semibold text-violet-700">{hint.brand} usually gives {hint.standardMonths / 12} year{hint.standardMonths === 12 ? "" : "s"} — add it under Edit</p> : null;
          })() : null}
        </div>
      </div>
      <Lifeline item={item} plan={plan} today={today} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[10px] font-bold uppercase text-slate-400">Paid</dt><dd className="text-sm font-bold tabular-nums">{item.price != null ? money(Number(item.price)) : "—"}</dd></div>
        <div className="rounded-xl bg-slate-50 px-3 py-2" title={run ? `${run.basis}${run.typical ? " (typical)" : ""} · ${run.annualKwh.toLocaleString("en-GB")} kWh ${run.fuel === "gas" ? "gas" : "electricity"} a year` : undefined}>
          <dt className="text-[10px] font-bold uppercase text-slate-400">To run</dt>
          <dd className="text-sm font-bold tabular-nums">{run ? `${money(run.annualCost)}/yr` : "—"}</dd>
          {run ? <dd className="text-[10px] font-semibold text-slate-500">{run.perUse != null ? `${pence(run.perUse)} a use` : `${pence(run.annualCost / 52)} a week`}{run.typical ? " · typical" : ""}</dd> : null}
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[10px] font-bold uppercase text-slate-400">Replace</dt><dd className="text-sm font-bold tabular-nums">{money(plan.replacementCost)}{plan.costIsGuess ? <span className="text-slate-400">*</span> : null}</dd><dd className="text-[10px] font-semibold text-slate-500">{plan.monthlySetAside > 0 ? `${money2(plan.monthlySetAside)}/mo aside` : plan.status === "past_life" ? "could go any time" : plan.status === "nearing_end" ? "within a year" : ""}</dd></div>
        <div className="rounded-xl bg-violet-50 px-3 py-2"><dt className="text-[10px] font-bold uppercase text-violet-500">Real cost</dt><dd className="text-sm font-bold tabular-nums text-violet-950">{money(ownershipPerYear)}/yr</dd><dd className="text-[10px] font-semibold text-violet-700/70">wear + running</dd></div>
      </dl>
    </li>
  );
}

function RatesBar({ rates, homeId, onSaved }: { rates: EnergyRates & { own: boolean }; homeId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [electricity, setElectricity] = useState("");
  const [gas, setGas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-3 text-xs ring-1 ring-slate-200">
      <span className="font-bold text-slate-700">⚡ {rates.electricity}p/kWh electricity · 🔥 {rates.gas}p/kWh gas</span>
      <span className="text-slate-400">{rates.own ? "Your prices" : PRICE_CAP_RATES.label}</span>
      {!open ? <button type="button" onClick={() => { setOpen(true); setElectricity(String(rates.electricity)); setGas(String(rates.gas)); }} className="ml-auto font-bold text-violet-700">Use my tariff</button> : (
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">Electricity <input inputMode="decimal" value={electricity} onChange={(e) => setElectricity(e.target.value)} className="w-16 rounded-lg border border-slate-200 px-2 py-1" />p</label>
          <label className="flex items-center gap-1">Gas <input inputMode="decimal" value={gas} onChange={(e) => setGas(e.target.value)} className="w-16 rounded-lg border border-slate-200 px-2 py-1" />p</label>
          <button type="button" disabled={pending || !homeId} onClick={() => startTransition(async () => { try { await saveEnergyRates(homeId!, electricity, gas); setOpen(false); setError(null); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); } })} className="rounded-lg bg-slate-950 px-3 py-1.5 font-bold text-white disabled:bg-slate-300">Save</button>
          {rates.own ? <button type="button" disabled={pending || !homeId} onClick={() => startTransition(async () => { try { await saveEnergyRates(homeId!, null, null); setOpen(false); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); } })} className="font-bold text-slate-500">Use price cap</button> : null}
          <button type="button" onClick={() => setOpen(false)} className="font-bold text-slate-500">Cancel</button>
        </span>
      )}
      {error ? <span className="w-full text-rose-700">{error}</span> : null}
    </section>
  );
}

function ItemFields({ form, setForm, today, preview, rates, expanded = false }: { form: Form; setForm: (next: Form) => void; today: string; preview: Preview | null; rates: EnergyRates; expanded?: boolean }) {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const [looking, setLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const read = readInput(form, today, preview);
  const kind = KIND_BY_KEY.get(read.kind) || KIND_BY_KEY.get("other")!;
  const usage = kind.usage;
  const run = runningCost(usageOf(form, kind.key), rates);
  const lookingUp = read.isLink && preview?.url === form.input.trim() && preview.loading;
  const input = "mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const label = "block text-xs font-bold text-slate-600";
  const ownUsage = Boolean(form.energyPerUseKwh || form.usesPerWeek || form.powerWatts || form.hoursPerDay || form.annualKwh || form.fuel);
  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-3">
        {form.input.trim() ? <ProductPicture image={read.image} kind={kind.key} size={64} /> : null}
        <label className={`${label} min-w-0 flex-1`}>Product name or link
          <input value={form.input} onChange={(event) => set({ input: event.target.value })} placeholder="e.g. Bosch Series 4 dishwasher — or paste the link from Currys, AO, Amazon…" className={input} />
          {form.input.trim() ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
              {read.isLink ? <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-800">{lookingUp ? "Looking it up…" : `Link saved${read.retailer ? ` · ${read.retailer}` : ""}`}</span> : null}
              {read.isLink && read.name ? <span className="truncate">Name: <span className="font-bold text-slate-700">{read.name}</span></span> : null}
              {read.isLink && !lookingUp && read.fetched?.price != null && !form.price ? <span>Price on the page: <span className="font-bold text-slate-700">{money2(read.fetched.price)}</span></span> : null}
              {read.isLink && !lookingUp && read.fetched && !read.fetched.title && read.fetched.reason ? <span className="text-amber-700">{read.fetched.reason}{read.name ? " Name taken from the link." : ""}</span> : null}
              <span className="inline-flex items-center gap-1">It&apos;s a
                <select value={read.kind} onChange={(event) => set({ kind: event.target.value, kindTouched: true })} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
                  {HOME_ITEM_KINDS.map((option) => <option key={option.key} value={option.key}>{option.icon} {option.label}</option>)}
                </select>
              </span>
            </span>
          ) : null}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Price paid (£)
          <input inputMode="decimal" value={form.price} onChange={(event) => set({ price: event.target.value })} placeholder={read.fetched?.price != null ? String(read.fetched.price) : "e.g. 449"} className={input} />
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
      <BrandPointer text={`${form.brand} ${read.brand || ""} ${read.name}`} kind={kind.key} warranty={form.warranty} onUse={(months) => set({ warranty: PRESET_MONTHS.has(String(months)) ? String(months) : "custom", warrantyMonths: String(months) })} />
      {form.warranty === "custom" ? (
        <label className={`${label} max-w-40`}>Warranty (months)
          <input inputMode="numeric" value={form.warrantyMonths} onChange={(event) => set({ warrantyMonths: event.target.value.replace(/\D/g, "").slice(0, 3) })} className={input} />
        </label>
      ) : null}

      {kind.key === "sofa" || kind.key === "mattress" ? null : (
        <details open={expanded && ownUsage} className="rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
          <summary className="cursor-pointer text-xs font-bold text-emerald-900">
            How you use it <span className="font-semibold text-emerald-800/70">— {run ? `about ${money(run.annualCost)} a year to run${run.perUse != null ? `, ${pence(run.perUse)} a use` : ""}${run.typical ? " (typical)" : ""}` : "for running costs"}</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className={label}>Runs on
              <select value={form.fuel} onChange={(event) => set({ fuel: event.target.value })} className={input}>
                <option value="">{usage?.fuel === "gas" ? "Gas (usual)" : "Electricity (usual)"}</option>
                <option value="electric">Electricity</option>
                <option value="gas">Gas</option>
                <option value="none">Doesn&apos;t use energy</option>
              </select>
            </label>
            {usage?.mode === "hours" || form.powerWatts || form.hoursPerDay ? (
              <>
                <label className={label}>Power (watts)
                  <input inputMode="decimal" value={form.powerWatts} onChange={(event) => set({ powerWatts: event.target.value })} placeholder={usage?.mode === "hours" ? `About ${usage.watts}` : "e.g. 100"} className={input} />
                </label>
                <label className={label}>Hours a day
                  <input inputMode="decimal" value={form.hoursPerDay} onChange={(event) => set({ hoursPerDay: event.target.value })} placeholder={usage?.mode === "hours" ? `About ${usage.hoursPerDay}` : "e.g. 3"} className={input} />
                </label>
              </>
            ) : usage?.mode === "annual" ? (
              <label className={`${label} sm:col-span-2`}>kWh a year (on the energy label)
                <input inputMode="decimal" value={form.annualKwh} onChange={(event) => set({ annualKwh: event.target.value })} placeholder={`About ${usage.kwh.toLocaleString("en-GB")}`} className={input} />
              </label>
            ) : (
              <>
                <label className={label}>Times a week
                  <input inputMode="decimal" value={form.usesPerWeek} onChange={(event) => set({ usesPerWeek: event.target.value })} placeholder={usage?.mode === "per_use" ? `About ${usage.perWeek}` : "e.g. 5"} className={input} />
                </label>
                <label className={label}>Energy per use (kWh)
                  <input inputMode="decimal" value={form.energyPerUseKwh} onChange={(event) => set({ energyPerUseKwh: event.target.value })} placeholder={usage?.mode === "per_use" ? `About ${usage.kwh}` : "e.g. 0.8"} className={input} />
                </label>
              </>
            )}
          </div>
          <EnergyLabelField kind={kind.key} form={form} set={set} className={label} inputClass={input} />
          {usage?.mode !== "annual" ? (
            <label className={`${label} mt-3 max-w-xs`}>Or kWh a year, if you know it
              <input inputMode="decimal" value={form.annualKwh} onChange={(event) => set({ annualKwh: event.target.value })} placeholder="From a smart plug or your own reading" className={input} />
            </label>
          ) : null}
          <p className="mt-2 text-[11px] font-semibold text-emerald-900/70">The energy label, the manual or a smart plug gives the most accurate figures. Blank boxes use the typical amounts shown.</p>
        </details>
      )}

      <details open={expanded} className="rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-600">More details (picture, shop link, extended cover, your own lifespan)</summary>
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
          {!read.isLink ? (
            <div className="sm:col-span-2">
              <label className={label}>Shop link
                <input value={form.productUrl} onChange={(event) => set({ productUrl: event.target.value.trim() })} placeholder="Paste the product page from the shop" className={input} />
              </label>
              {/^https?:\/\/\S+\.\S+/i.test(form.productUrl) ? (
                <button type="button" disabled={looking} onClick={() => { setLooking(true); setLookupNote(null); previewProductLink(form.productUrl).then((result) => { setForm({ ...form, imageUrl: form.imageUrl || result.image || "", brand: form.brand || result.brand || "", retailer: form.retailer || nameFromProductUrl(form.productUrl)?.retailer || "" }); setLookupNote(result.image ? "Picture found." : result.reason || "No picture on that page — paste a picture link below."); }).catch((error) => setLookupNote(error instanceof Error ? error.message : "Couldn't look that up.")).finally(() => setLooking(false)); }} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 disabled:opacity-50">{looking ? "Looking…" : "Get picture from the link"}</button>
              ) : null}
              {lookupNote ? <span className="ml-2 text-[11px] font-semibold text-slate-500">{lookupNote}</span> : null}
            </div>
          ) : null}
          <label className={`${label} sm:col-span-2`}>Picture link (https)
            <input value={form.imageUrl} onChange={(event) => set({ imageUrl: event.target.value })} placeholder={read.fetched?.image ? "Using the picture from the shop page" : "Right-click a product photo → Copy image address"} className={input} />
          </label>
          <label className={`${label} sm:col-span-2`}>Notes
            <textarea value={form.notes} onChange={(event) => set({ notes: event.target.value })} rows={2} placeholder="Serial number, where the receipt is, repair history…" className={input} />
          </label>
        </div>
      </details>
    </div>
  );
}

function BrandPointer({ text, kind, warranty, onUse }: { text: string; kind: string; warranty: string; onUse: (months: number) => void }) {
  const info = brandWarrantyFor(text, kind);
  if (!info) {
    if (warranty !== "" && warranty !== "0") return null;
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500">
        {UK_CONSUMER_LAW_NOTE} <a href={UK_CONSUMER_LAW_SOURCE} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 hover:underline">More</a>
      </p>
    );
  }
  const months = info.standardMonths;
  const already = months != null && (warranty === String(months));
  return (
    <div className="rounded-xl bg-violet-50 px-3 py-2.5 text-[11px] leading-5 text-violet-950 ring-1 ring-violet-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{info.brand}{months ? ` usually gives ${months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`} as standard` : " warranty pointers"}</p>
        {months && !already ? <button type="button" onClick={() => onUse(months)} className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">Use {months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`}</button> : null}
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 font-semibold text-violet-900/80">
        {info.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <p className="mt-1 text-[10px] font-semibold text-violet-700/70">From <a href={info.source} target="_blank" rel="noopener noreferrer" className="underline">{new URL(info.source).hostname.replace(/^www\./, "")}</a>, checked {info.checked}. Your receipt or registration is what counts.</p>
    </div>
  );
}

/** The figure printed on the item's own energy label, turned into the matching usage number. */
function EnergyLabelField({ kind, form, set, className, inputClass }: { kind: string; form: Form; set: (patch: Partial<Form>) => void; className: string; inputClass: string }) {
  const perCycle = ["dishwasher", "washing_machine", "tumble_dryer"].includes(kind);
  const perYear = ["fridge_freezer", "freezer"].includes(kind);
  const perThousandHours = kind === "tv";
  if (!perCycle && !perYear && !perThousandHours) return null;
  const value = perCycle ? (form.energyPerUseKwh ? String(Math.round(Number(form.energyPerUseKwh) * 100 * 10) / 10) : "") : perYear ? form.annualKwh : form.powerWatts;
  const unit = perCycle ? "kWh per 100 cycles" : perYear ? "kWh per year" : "kWh per 1000h";
  return (
    <div className="mt-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-emerald-100">
      <label className={className}>From this model&apos;s energy label ({unit})
        <input inputMode="decimal" value={value} onChange={(event) => {
          const raw = event.target.value.replace(/[^\d.]/g, "");
          if (perCycle) set({ energyPerUseKwh: raw ? String(Math.round((Number(raw) / 100) * 1000) / 1000) : "", annualKwh: "" });
          else if (perYear) set({ annualKwh: raw });
          else set({ powerWatts: raw, annualKwh: "" });
        }} placeholder={perCycle ? "e.g. 54 — the big number in the middle" : perYear ? "e.g. 213" : "e.g. 79"} className={`${inputClass} max-w-xs`} />
      </label>
      <p className="mt-1 text-[10px] font-semibold text-emerald-900/70">
        {perCycle ? "Labels measure the Eco programme, so hotter or quicker washes use more." : perYear ? "Fridges and freezers are rated over a full year of normal use." : "kWh per 1000 hours is the same as the average watts while it's on."} Search the model number on the shop page or the QR code on the label.
      </p>
    </div>
  );
}
