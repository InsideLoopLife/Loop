"use client";

// Things in the home, as a list of cards: paste a shop link (picture, name and price are looked
// up where the shop allows it) or type a name, add the price, date and warranty. Each card shows
// a lifespan timeline, what it costs to run and what it really costs a year to own. Changes made
// in another tab or by someone else in the household appear straight away.
// (The room-map version is parked in HomeItemsMapPlanner.tsx.)

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteHomeItem, findTariffs, listHomeItems, previewProductLink, saveHomeItem, setHomeItemStatus, type HomeItemInput, type SavedTariff } from "@/app/mortgage/home-items-actions";
import { quietly } from "@/components/feedback/quiet-action";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { clearEnergyTariff, readEnergyBillUpload, restoreEnergyTariff, saveEnergyTariff } from "@/app/energy/actions";
import type { BillReadResult } from "@/lib/energy/bill-reader";
import type { EffectiveEnergy } from "@/lib/energy/tariff";
import type { TariffOption, TariffSearch } from "@/lib/home/tariffs";
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
  usesOffPeak: boolean;
};

const emptyForm = (): Form => ({ input: "", kind: "", kindTouched: false, price: "", boughtOn: "", warranty: "12", warrantyMonths: "", brand: "", retailer: "", productUrl: "", imageUrl: "", extendedWarrantyEndsOn: "", warrantyProvider: "", expectedLifeYears: "", replacementCost: "", notes: "", fuel: "", energyPerUseKwh: "", usesPerWeek: "", powerWatts: "", hoursPerDay: "", annualKwh: "", usesOffPeak: false });

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function formFromItem(item: HomeItem): Form {
  const months = item.warranty_months;
  return {
    id: item.id, input: item.label, kind: item.kind, kindTouched: true, price: str(item.price), boughtOn: item.purchased_on || "",
    warranty: months == null ? "" : PRESET_MONTHS.has(String(months)) ? String(months) : "custom", warrantyMonths: str(months),
    brand: item.brand || "", retailer: item.retailer || "", productUrl: item.product_url || "", imageUrl: item.image_url || "",
    extendedWarrantyEndsOn: item.extended_warranty_ends_on || "", warrantyProvider: item.warranty_provider || "",
    expectedLifeYears: str(item.expected_life_years), replacementCost: str(item.replacement_cost), notes: item.notes || "",
    fuel: item.fuel || "", energyPerUseKwh: str(item.energy_per_use_kwh), usesPerWeek: str(item.uses_per_week), powerWatts: str(item.power_watts), hoursPerDay: str(item.hours_per_day), annualKwh: str(item.annual_kwh), usesOffPeak: Boolean(item.uses_off_peak),
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
  return { kind, fuel: (form.fuel || null) as HomeItem["fuel"], energy_per_use_kwh: n(form.energyPerUseKwh), uses_per_week: n(form.usesPerWeek), power_watts: n(form.powerWatts), hours_per_day: n(form.hoursPerDay), annual_kwh: n(form.annualKwh), uses_off_peak: form.usesOffPeak };
}

export function HomeItemsPlanner({ homeId, addRequest = 0 }: { homeId: string | null; houseStyle?: unknown; addRequest?: number }) {
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [rates, setRates] = useState<RatesState>({ electricity: PRICE_CAP_RATES.electricity, gas: PRICE_CAP_RATES.gas, own: false, tariff: null });
  const [energy, setEnergy] = useState<EffectiveEnergy | null>(null);
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
    quietly(() => listHomeItems(homeId))
      .then((result) => { if (!cancelled) { setItems(result.items); setRates(result.rates); setEnergy(result.energy); } })
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
      .on("postgres_changes", { event: "*", schema: "public", table: "household_energy_tariffs" }, () => refreshSoon())
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
      quietly(() => previewProductLink(linkInput))
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
      fuel: current.fuel || null, energyPerUseKwh: current.energyPerUseKwh, usesPerWeek: current.usesPerWeek, powerWatts: current.powerWatts, hoursPerDay: current.hoursPerDay, annualKwh: current.annualKwh, usesOffPeak: current.usesOffPeak,
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
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <HomeSummary count={totals.count} perYear={rows.reduce((sum, row) => sum + row.ownershipPerYear, 0)} running={totals.running} setAside={totals.setAside} typical={totals.runningTypical} outOfWarranty={totals.outOfWarranty} ending={totals.ending} dueSoonCount={totals.dueSoonCount} dueSoonCost={totals.dueSoonCost} />
        <EnergyCard rates={rates} energy={energy} homeId={homeId} onSaved={() => { announce(); setReloadKey((key) => key + 1); }} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="text-lg font-bold">Your things {message?.tone === "ok" && !adding && !editing ? <span className="ml-2 align-middle text-xs font-bold text-emerald-700">{message.text}</span> : null}</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />{live ? "Live — updates as things change" : "Most urgent first"}
          </span>
        </div>
        {items === null ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-400 ring-1 ring-slate-200">Loading…</p> : null}
        {items !== null && !rows.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">Nothing yet. Press “Add something” to start with the big ones: boiler, fridge freezer, washing machine, dishwasher, oven.</p> : null}
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {rows.map(({ item, plan, run, ownershipPerYear }) => (
            <ItemCard key={item.id} item={item} plan={plan} run={run} ownershipPerYear={ownershipPerYear} today={today} onEdit={() => { setMessage(null); setEditing(formFromItem(item)); }} />
          ))}
        </ul>
        {rows.length ? <p className="mt-3 px-1 text-[11px] font-semibold leading-5 text-slate-400">Lifespans, typical prices and typical use are rough UK guides — add your own under Edit for sharper numbers. Running costs use {energy?.label || PRICE_CAP_RATES.label}.</p> : null}
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
                <ConfirmButton disabled={isPending} question={`Mark ${editing.input || "this"} as replaced?`} detail="It stops counting in running costs and money to put aside, and moves to “replaced or gone”. You can bring it back." confirmLabel="Yes, replaced" onConfirm={() => act(() => setHomeItemStatus(editing.id!, "replaced"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Replaced it</ConfirmButton>
                <ConfirmButton disabled={isPending} question={`Mark ${editing.input || "this"} as got rid of?`} detail="It stops counting in running costs and money to put aside, and moves to “replaced or gone”. You can bring it back." confirmLabel="Yes, got rid of it" onConfirm={() => act(() => setHomeItemStatus(editing.id!, "gone"))} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Got rid of it</ConfirmButton>
                <span className="ml-auto"><ConfirmButton danger disabled={isPending} question={`Delete ${editing.input || "this"}?`} detail="This can't be undone. Use “Replaced it” instead to keep its history." confirmLabel="Delete it" onConfirm={() => act(() => deleteHomeItem(editing.id!))} className="text-xs font-bold text-rose-700">Delete</ConfirmButton></span>
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
                  <ConfirmButton question={`Bring back ${item.label}?`} detail="It counts in running costs and money to put aside again." confirmLabel="Yes, bring it back" onConfirm={() => act(() => setHomeItemStatus(item.id, "active"))} className="shrink-0 text-xs font-bold text-violet-700">Bring back</ConfirmButton>
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

/** How far through its usual life it is, as a simple bar: "Year 2 of about 11". */
function LifeBar({ item, plan, today }: { item: HomeItem; plan: HomeItemPlan; today: string }) {
  if (!item.purchased_on || !plan.lifeEnds) {
    return <p className="text-xs font-semibold text-slate-400">Add when you bought it to see how long it should last.</p>;
  }
  const start = dayNumber(item.purchased_on);
  const lifeEnd = dayNumber(plan.lifeEnds);
  const now = dayNumber(today);
  const used = Math.max(0.03, Math.min(1, (now - start) / Math.max(1, lifeEnd - start)));
  const year = Math.max(1, Math.ceil((now - start) / 365.25));
  const tone = plan.status === "past_life" ? "bg-rose-400" : plan.status === "nearing_end" ? "bg-orange-400" : plan.status === "in_warranty" || plan.status === "warranty_ending" ? "bg-emerald-400" : "bg-slate-400";
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(used * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs font-semibold text-slate-500">
        {now > lifeEnd ? `Past its usual ${Math.round(plan.lifeYears)} years` : `Year ${year} of about ${Math.round(plan.lifeYears)}`}
      </p>
    </div>
  );
}

function warrantyLine(item: HomeItem, plan: HomeItemPlan, today: string) {
  if (!plan.warrantyEnds) return item.purchased_on ? "No warranty details yet" : null;
  const ended = plan.warrantyEnds < today;
  return ended ? `Warranty ended ${monthYear(plan.warrantyEnds)}` : `Covered until ${monthYear(plan.warrantyEnds)}${item.warranty_provider ? ` by ${item.warranty_provider}` : ""}`;
}

function ItemCard({ item, plan, run, today, onEdit }: { item: HomeItem; plan: HomeItemPlan; run: RunningCost | null; ownershipPerYear: number; today: string; onEdit: () => void }) {
  const status = STATUS_STYLE[plan.status];
  const bought = item.purchased_on ? `Bought ${monthYear(item.purchased_on)}${item.price != null ? ` for ${money(Number(item.price))}` : ""}` : item.price != null ? `Paid ${money(Number(item.price))}` : null;
  const hint = item.warranty_months == null && !item.extended_warranty_ends_on ? brandWarrantyFor(`${item.brand || ""} ${item.label}`, item.kind) : null;
  const warranty = warrantyLine(item, plan, today);
  return (
    <li className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative">
        <ProductPhoto image={item.image_url} kind={item.kind} />
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm ring-1 ring-black/5 ${status.chip.split(" ").filter((c) => c.startsWith("text-")).join(" ")}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />{status.label}
        </span>
        <button type="button" onClick={onEdit} className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm ring-1 ring-black/5 hover:bg-white">Edit</button>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="line-clamp-2 text-[15px] font-bold leading-5 text-slate-950" title={item.label}>{item.label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {[item.brand, bought].filter(Boolean).join(" · ") || KIND_BY_KEY.get(item.kind)?.label}
            {item.product_url ? <> · <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">Product page</a></> : null}
          </p>
        </div>
        <div className="space-y-1">
          {warranty ? <p className="text-xs font-semibold text-slate-700">{warranty}</p> : null}
          {hint?.standardMonths ? <p className="text-[11px] font-semibold text-violet-700">{hint.brand} usually gives {hint.standardMonths / 12} year{hint.standardMonths === 12 ? "" : "s"} — add it under Edit</p> : null}
        </div>
        <LifeBar item={item} plan={plan} today={today} />
        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div title={run ? `${run.basis}${run.typical ? " (typical use)" : ""} · ${run.annualKwh.toLocaleString("en-GB")} kWh a year` : undefined}>
            <p className="text-base font-bold tabular-nums text-slate-950">{run ? money(run.annualCost) : "—"}<span className="text-xs font-semibold text-slate-400"> a year</span></p>
            <p className="text-[11px] font-semibold text-slate-500">to run{run?.typical ? " (typical use)" : ""}{run?.basis.endsWith("night rate") ? " · night rate" : ""}</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-slate-950">
              {plan.monthlySetAside > 0 ? <>{money2(plan.monthlySetAside)}<span className="text-xs font-semibold text-slate-400"> a month</span></> : money(plan.replacementCost)}
            </p>
            <p className="text-[11px] font-semibold text-slate-500">
              {plan.monthlySetAside > 0 ? `to put aside for a ${money(plan.replacementCost)} replacement` : plan.status === "past_life" ? "to replace — could go any time" : plan.status === "nearing_end" ? "to replace, likely within a year" : "to replace"}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Product photo on a soft background; falls back to the kind's icon. */
function ProductPhoto({ image, kind }: { image: string | null | undefined; kind: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const icon = KIND_BY_KEY.get(kind)?.icon || "📦";
  const showImage = image && broken !== image;
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100/70">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- shop images come from many domains
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(image)} className="absolute inset-0 h-full w-full object-contain p-5 mix-blend-multiply transition group-hover:scale-[1.02]" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-6xl opacity-80" aria-hidden>{icon}</span>
      )}
    </div>
  );
}

/** A friendly one-card summary instead of a row of figure tiles. */
function HomeSummary({ count, perYear, running, setAside, typical, outOfWarranty, ending, dueSoonCount, dueSoonCost }: { count: number; perYear: number; running: number; setAside: number; typical: number; outOfWarranty: number; ending: number; dueSoonCount: number; dueSoonCost: number }) {
  if (!count) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold text-slate-500">Your home</p>
        <p className="mt-2 text-xl font-bold text-slate-950">Add the big things you own</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">Loop keeps an eye on warranties, what they cost to run, and when they&apos;re likely to need replacing.</p>
      </section>
    );
  }
  const notes = [
    dueSoonCount ? { tone: "bg-orange-50 text-orange-900", text: `${dueSoonCount} may need replacing within a year (${money(dueSoonCost)})` } : { tone: "bg-emerald-50 text-emerald-800", text: "Nothing likely to need replacing this year" },
    ending ? { tone: "bg-amber-50 text-amber-900", text: `${ending} warranty ending soon` } : null,
    outOfWarranty ? { tone: "bg-slate-100 text-slate-700", text: `${outOfWarranty} out of warranty` } : null,
  ].filter(Boolean) as Array<{ tone: string; text: string }>;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold text-slate-500">Your home</p>
      <p className="mt-2 text-xl font-bold leading-snug text-slate-950 sm:text-2xl">
        Your {count} thing{count === 1 ? "" : "s"} cost about <span className="text-violet-700">{money(perYear)} a year</span> to keep
      </p>
      <p className="mt-1.5 text-sm font-semibold text-slate-500">
        {money(running)} a year to run{typical ? " (some on typical use)" : ""}, and {money2(setAside)} a month to put aside so replacements are covered.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {notes.map((note) => <span key={note.text} className={`rounded-full px-3 py-1 text-xs font-bold ${note.tone}`}>{note.text}</span>)}
      </div>
    </section>
  );
}

type RatesState = EnergyRates & { own: boolean; tariff: SavedTariff | null };
const SUPPLIER_NAMES = ["Octopus Energy", "British Gas", "EDF", "E.ON Next", "OVO", "Scottish Power", "So Energy", "Outfox the Market", "Utility Warehouse", "Ecotricity", "Good Energy", "Utilita", "Sainsbury's Energy", "Co-op Energy", "Fuse Energy", "Other"];

const SUPPLIER_TINTS: Record<string, string> = {
  octopus: "bg-fuchsia-100 text-fuchsia-800", "british gas": "bg-sky-100 text-sky-800", edf: "bg-orange-100 text-orange-800", "e.on": "bg-red-100 text-red-800",
  ovo: "bg-emerald-100 text-emerald-800", "scottish power": "bg-lime-100 text-lime-800", "so energy": "bg-teal-100 text-teal-800", "utility warehouse": "bg-indigo-100 text-indigo-800",
};

function supplierTint(name: string) {
  const key = Object.keys(SUPPLIER_TINTS).find((k) => name.toLowerCase().includes(k));
  return key ? SUPPLIER_TINTS[key] : "bg-violet-100 text-violet-800";
}

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Your energy": who supplies you, the tariff, when the fix ends, and the rates — in plain words. */
function EnergyCard({ rates, energy, homeId, onSaved }: { rates: RatesState; energy: EffectiveEnergy | null; homeId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [pending, startTransition] = useTransition();
  const tariff = energy?.tariff;
  const supplier = tariff?.supplier || "Ofgem price cap";
  const fixed = tariff?.fixed_until || null;
  const gasSeparate = Boolean(tariff?.gas_tariff_name || tariff?.gas_fixed_until);
  const p = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 })}p`);
  return (
    <section className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base font-bold ${tariff ? supplierTint(supplier) : "bg-slate-100 text-slate-700"}`}>{tariff ? supplier.slice(0, 1).toUpperCase() : "£"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-500">Your energy</p>
          <p className="truncate text-base font-bold text-slate-950">{tariff ? `${supplier}${tariff.tariff_name ? ` · ${tariff.tariff_name}` : ""}` : "Using the Ofgem price cap"}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {tariff
              ? fixed ? `Fixed until ${longDate(fixed)}${tariff.exit_fee_gbp ? ` · £${Number(tariff.exit_fee_gbp).toLocaleString("en-GB")} to leave early` : ""}` : "Variable rates"
              : `${energy?.label?.replace("Ofgem price cap, ", "") || "Your region"} · add your tariff for exact costs`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-amber-50/70 p-3">
          <p className="text-xs font-bold text-amber-900">⚡ Electricity</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">
            {p(rates.electricity)}{rates.electricityNight != null ? <span className="text-sm font-semibold text-slate-500"> day · {p(rates.electricityNight)} night</span> : <span className="text-sm font-semibold text-slate-500"> per kWh</span>}
          </p>
          <p className="text-[11px] font-semibold text-slate-500">
            {energy?.offPeak ? `Night rate ${energy.offPeak.start}–${energy.offPeak.end} · ` : ""}{p(energy?.electricityStanding)} a day standing charge
          </p>
        </div>
        <div className="rounded-2xl bg-sky-50/70 p-3">
          <p className="text-xs font-bold text-sky-900">🔥 Gas</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{p(rates.gas)}<span className="text-sm font-semibold text-slate-500"> per kWh</span></p>
          <p className="text-[11px] font-semibold text-slate-500">
            {gasSeparate ? `${tariff?.gas_tariff_name || "Separate deal"}${tariff?.gas_fixed_until ? ` · fixed to ${longDate(tariff.gas_fixed_until)}` : ""} · ` : ""}{p(energy?.gasStanding)} a day standing charge
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-slate-950 px-4 py-2 font-bold text-white hover:bg-slate-800">{tariff ? "Change tariff" : "Add my tariff"}</button>
        {!tariff && energy?.lastSaved ? <ConfirmButton disabled={pending} question={`Use ${energy.lastSaved.supplier}${energy.lastSaved.tariffName ? ` · ${energy.lastSaved.tariffName}` : ""} again?`} detail="Running costs, money to put aside and calendar dates across Loop will switch to its rates. Check them with Change tariff afterwards." confirmLabel="Yes, restore it" onConfirm={() => startTransition(async () => { await restoreEnergyTariff(energy.lastSaved!.id); onSaved(); })} className="font-bold text-emerald-700">Restore {energy.lastSaved.supplier}</ConfirmButton> : null}
        {tariff ? <ConfirmButton disabled={pending} question={`Stop using ${tariff.supplier}'s rates?`} detail={`Loop will use the Ofgem price cap for your region instead of ${energy!.label}. Running costs and calendar dates change. You can restore it afterwards.`} confirmLabel="Yes, use the price cap" onConfirm={() => startTransition(async () => { await clearEnergyTariff(); onSaved(); })} className="font-bold text-slate-500 hover:text-slate-800">Use price cap instead</ConfirmButton> : null}
      </div>
      {open ? <TariffModal homeId={homeId} energy={energy} onClose={close} onSaved={() => { setOpen(false); onSaved(); }} /> : null}
    </section>
  );
}

type TariffDraft = {
  supplier: string; tariffName: string; electricityUnitP: string; electricityNightUnitP: string; electricityStandingP: string;
  gasUnitP: string; gasStandingP: string; paymentMethod: string; fixedUntil: string; exitFeeGbp: string; monthlyPaymentGbp: string;
  annualElectricityKwh: string; annualGasKwh: string; gasTariffName: string; gasFixedUntil: string; gasExitFeeGbp: string; offPeakStart: string; offPeakEnd: string; region: string; source: "bill_upload" | "octopus_api" | "price_cap" | "manual"; sourceFilename: string;
};
const v = (value: unknown) => (value === null || value === undefined ? "" : String(value));
function draftFromEnergy(energy: EffectiveEnergy | null): TariffDraft {
  const t = energy?.tariff;
  return {
    supplier: t?.supplier || "", tariffName: t?.tariff_name || "", electricityUnitP: v(t?.electricity_unit_p), electricityNightUnitP: v(t?.electricity_night_unit_p),
    electricityStandingP: v(t?.electricity_standing_p), gasUnitP: v(t?.gas_unit_p), gasStandingP: v(t?.gas_standing_p), paymentMethod: t?.payment_method || "Direct Debit",
    fixedUntil: t?.fixed_until || "", exitFeeGbp: v(t?.exit_fee_gbp), monthlyPaymentGbp: v(t?.monthly_payment_gbp), annualElectricityKwh: v(t?.annual_electricity_kwh),
    annualGasKwh: v(t?.annual_gas_kwh), gasTariffName: t?.gas_tariff_name || "", gasFixedUntil: t?.gas_fixed_until || "", gasExitFeeGbp: v(t?.gas_exit_fee_gbp),
    offPeakStart: t?.off_peak_start || "", offPeakEnd: t?.off_peak_end || "", region: t?.region || energy?.region || "", source: "manual", sourceFilename: "",
  };
}

/** "Electricity 27.86p → 32.9p day / 6.66p night · Gas 7.91p → 7.9p", plus what else it changes. */
function tariffChangeSummary(energy: EffectiveEnergy | null, draft: TariffDraft) {
  const was = (n: number | null | undefined) => (n == null ? "—" : `${n}p`);
  const now = (s: string) => (s.trim() ? `${Number(s)}p` : "—");
  const parts: string[] = [];
  if (draft.electricityUnitP.trim()) {
    const before = energy?.electricityNight != null ? `${was(energy.electricity)} / ${was(energy.electricityNight)} night` : was(energy?.electricity);
    const after = draft.electricityNightUnitP.trim() ? `${now(draft.electricityUnitP)} / ${now(draft.electricityNightUnitP)} night` : now(draft.electricityUnitP);
    parts.push(`Electricity ${before} → ${after}`);
  }
  if (draft.gasUnitP.trim()) parts.push(`Gas ${was(energy?.gas)} → ${now(draft.gasUnitP)}`);
  const ends = [draft.fixedUntil, draft.gasFixedUntil].filter(Boolean).length;
  return `${parts.join(" · ")}. This replaces the rates used for running costs and money to put aside across Loop${ends ? ", and adds the fixed-deal end dates to your calendar" : ""}.`;
}

function TariffModal({ homeId, energy, onClose, onSaved }: { homeId: string | null; energy: EffectiveEnergy | null; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"find" | "bill" | "confirm">("find");
  const [draft, setDraft] = useState<TariffDraft>(() => draftFromEnergy(energy));
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toConfirm(next: TariffDraft, readNotes: string[] = []) { setDraft(next); setNotes(readNotes); setError(null); setMode("confirm"); }

  return (
    <ModalFrame eyebrow="Energy" title={mode === "confirm" ? "Check and save your tariff" : "Your energy tariff"} description={mode === "confirm" ? "These rates are used across Loop — appliance running costs, your calendar and budgeting." : "Find your tariff, read it from a bill, or type it in."} maxWidth="max-w-2xl" onClose={onClose}>
      {mode !== "confirm" ? (
        <div className="mb-4 inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          {([["find", "Find my tariff"], ["bill", "From a bill or screenshot"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setMode(key)} className={`rounded-full px-4 py-1.5 text-xs font-bold ${mode === key ? "bg-slate-950 text-white" : "text-slate-600"}`}>{label}</button>
          ))}
        </div>
      ) : null}
      {mode === "find" ? <TariffFinder homeId={homeId} onPick={(option, search) => toConfirm({
        ...draftFromEnergy(null), supplier: search.supplier, tariffName: option.name, electricityUnitP: v(option.electricity), gasUnitP: v(option.gas),
        electricityStandingP: v(option.electricityStanding), gasStandingP: v(option.gasStanding), region: search.region || "",
        source: search.live ? "octopus_api" : "price_cap",
      }, option.note ? [option.note] : [])} onManual={() => toConfirm({ ...draftFromEnergy(energy), source: "manual" })} /> : null}
      {mode === "bill" ? <BillReader onRead={(result, filename) => toConfirm({
        ...draftFromEnergy(null), supplier: result.draft.supplier || "", tariffName: result.draft.tariffName || "",
        electricityUnitP: v(result.draft.electricityUnitP), electricityNightUnitP: v(result.draft.electricityNightUnitP), electricityStandingP: v(result.draft.electricityStandingP),
        gasUnitP: v(result.draft.gasUnitP), gasStandingP: v(result.draft.gasStandingP), paymentMethod: result.draft.paymentMethod || "", fixedUntil: result.draft.fixedUntil || "",
        exitFeeGbp: v(result.draft.exitFeeGbp), monthlyPaymentGbp: v(result.draft.monthlyPaymentGbp), annualElectricityKwh: v(result.draft.annualElectricityKwh),
        annualGasKwh: v(result.draft.annualGasKwh), gasTariffName: result.draft.gasTariffName || "", gasFixedUntil: result.draft.gasFixedUntil || "", gasExitFeeGbp: v(result.draft.gasExitFeeGbp),
        offPeakStart: result.draft.offPeakStart || "", offPeakEnd: result.draft.offPeakEnd || "", region: energy?.region || "", source: "bill_upload", sourceFilename: filename,
      }, result.warnings)} /> : null}
      {mode === "confirm" ? (
        <div className="space-y-4">
          {draft.source === "bill_upload" ? <p className="rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-900">Read from {draft.sourceFilename || "your text"}. Check each figure against the bill — anything blank wasn&apos;t found. The file itself isn&apos;t kept.</p> : null}
          {notes.filter(Boolean).map((note) => <p key={note} className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">{note}</p>)}
          <TariffConfirmFields draft={draft} setDraft={setDraft} />
          {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmButton disabled={pending || !draft.supplier.trim()} question={`Save ${draft.supplier.trim() || "these rates"} for your household?`} detail={tariffChangeSummary(energy, draft)} confirmLabel="Yes, save it" onConfirm={() => startTransition(async () => {
              try { await saveEnergyTariff({ homeId, ...draft }); onSaved(); }
              catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); }
            })} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{pending ? "Saving…" : "Save for our household"}</ConfirmButton>
            <button type="button" onClick={() => setMode("find")} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Back</button>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function TariffFinder({ homeId, onPick, onManual }: { homeId: string | null; onPick: (option: TariffOption, search: TariffSearch) => void; onManual: () => void }) {
  const [supplier, setSupplier] = useState("");
  const [search, setSearch] = useState<TariffSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = supplier.trim() ? SUPPLIER_NAMES.filter((name) => name.toLowerCase().includes(supplier.trim().toLowerCase())) : SUPPLIER_NAMES;
  function pickSupplier(name: string) {
    setSupplier(name); setSearch(null); setError(null); setSearching(true);
    quietly(() => findTariffs(homeId, name)).then(setSearch).catch((e) => setError(e instanceof Error ? e.message : "Couldn't look that up.")).finally(() => setSearching(false));
  }
  const options = (search?.options || []).filter((option) => !filter.trim() || option.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      {!search ? (
        <>
          <label className="block text-xs font-bold text-slate-600">Supplier
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Start typing, e.g. Octopus" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" autoFocus />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((name) => <button key={name} type="button" onClick={() => pickSupplier(name)} className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50">{name}</button>)}
            {supplier.trim() && !matches.length ? <button type="button" onClick={() => pickSupplier(supplier.trim())} className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">Use “{supplier.trim()}”</button> : null}
          </div>
        </>
      ) : null}
      {searching ? <p className="text-xs font-semibold text-slate-500">Looking up {supplier}&apos;s tariffs…</p> : null}
      {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
      {search ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">{search.supplier}{search.regionName ? <span className="font-semibold text-slate-500"> · rates for {search.regionName}</span> : null}{search.live ? <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">live</span> : null}</p>
            <button type="button" onClick={() => { setSearch(null); setSupplier(""); }} className="text-[11px] font-bold text-violet-700">Change supplier</button>
          </div>
          {search.message ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">{search.message}</p> : null}
          {search.options.length > 6 ? <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tariffs, e.g. Fixed, Flexible, Go" className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /> : null}
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {options.map((option) => (
              <li key={`${option.code || option.name}`}>
                <button type="button" onClick={() => onPick(option, search)} className="w-full rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-violet-50">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{option.name}</span>
                    <span className="text-xs font-bold tabular-nums text-slate-700">{option.electricity != null ? `⚡ ${option.electricity}p` : ""}{option.gas != null ? ` · 🔥 ${option.gas}p` : ""}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{option.fixed ? "Fixed" : "Variable"}</span>
                    {option.green ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Green</span> : null}
                    {option.timeOfUse ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Time of use</span> : null}
                    {option.electricityStanding != null ? <span className="text-slate-400">Standing {option.electricityStanding}p/day</span> : null}
                  </span>
                  {option.note ? <span className="mt-1 block text-[10px] font-semibold text-slate-500">{option.note}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" onClick={onManual} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">Or type the rates in yourself →</button>
    </div>
  );
}

function BillReader({ onRead }: { onRead: (result: BillReadResult, filename: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-3">
      <label
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files?.[0]; if (dropped) setFile(dropped); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-slate-50 hover:bg-violet-50/50"}`}
      >
        <span className="text-2xl" aria-hidden>🧾</span>
        <span className="text-sm font-bold text-slate-800">{file ? file.name : "Add a bill, tariff email or app screenshot"}</span>
        <span className="text-[11px] font-semibold text-slate-500">{file ? `${Math.round(file.size / 1024)} KB — tap to change` : "Photo, screenshot or PDF · up to 10MB"}</span>
        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      </label>
      <label className="block text-xs font-bold text-slate-600">Or paste the text
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} placeholder="e.g. the tariff section of a confirmation email — unit rates, standing charges, end date" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <p className="text-[10px] font-semibold text-slate-400">Loop reads the tariff figures only — not account numbers, meter numbers or your address — and doesn&apos;t keep the file.</p>
      {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
      <button type="button" disabled={pending || (!file && !text.trim())} onClick={() => startTransition(async () => {
        try {
          const form = new FormData();
          if (file) form.append("file", file);
          if (text.trim()) form.append("text", text);
          onRead(await quietly(() => readEnergyBillUpload(form)), file?.name || "pasted text");
        } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that."); }
      })} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{pending ? "Reading…" : "Read it"}</button>
    </div>
  );
}

function TariffConfirmFields({ draft, setDraft }: { draft: TariffDraft; setDraft: (next: TariffDraft) => void }) {
  const set = (patch: Partial<TariffDraft>) => setDraft({ ...draft, ...patch });
  const input = "mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";
  const label = "block text-xs font-bold text-slate-600";
  const field = (key: keyof TariffDraft, text: string, placeholder = "", type = "text", optional = false) => (
    <label className={label}>{text}
      <input type={type} inputMode={type === "text" && /P$|Gbp|Kwh/.test(key) ? "decimal" : undefined} value={String(draft[key] ?? "")} onChange={(event) => set({ [key]: event.target.value } as Partial<TariffDraft>)} placeholder={placeholder} className={`${input} ${draft[key] === "" && draft.source === "bill_upload" && !optional ? "border-amber-300 bg-amber-50/40" : ""}`} />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("supplier", "Supplier", "e.g. British Gas")}
        {field("paymentMethod", "Paying by", "Direct Debit")}
      </div>
      <fieldset className="rounded-xl bg-slate-50 p-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">⚡ Electricity (pence, inc VAT)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("electricityUnitP", draft.electricityNightUnitP ? "Day / peak p/kWh" : "Unit rate p/kWh", "e.g. 27.86")}
          {field("electricityNightUnitP", "Night / off-peak p/kWh", "Only if you have one", "text", true)}
          {field("electricityStandingP", "Standing charge p/day", "e.g. 54.83")}
        </div>
        {draft.electricityNightUnitP ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {field("offPeakStart", "Night rate from", "", "time", true)}
            {field("offPeakEnd", "Night rate until", "", "time", true)}
            <p className="self-end pb-1 text-[11px] font-semibold text-slate-500">On the house page, tick the appliances you run overnight — they&apos;ll use the night rate.</p>
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {field("tariffName", "Tariff name", "e.g. Fixed Tariff Dec27")}
          {field("fixedUntil", "Fixed until", "", "date")}
          {field("exitFeeGbp", "Exit fee £", "e.g. 50")}
        </div>
      </fieldset>
      <fieldset className="rounded-xl bg-slate-50 p-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">🔥 Gas (pence, inc VAT)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("gasUnitP", "Unit rate p/kWh", "e.g. 7.91")}
          {field("gasStandingP", "Standing charge p/day", "e.g. 29.68")}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {field("gasTariffName", "Tariff name", "Blank = same deal as electricity", "text", true)}
          {field("gasFixedUntil", "Fixed until", "", "date", true)}
          {field("gasExitFeeGbp", "Exit fee £", "0 if none", "text", true)}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("monthlyPaymentGbp", "Monthly payment £", "e.g. 145")}
        {field("annualElectricityKwh", "Electricity kWh a year", "From the bill")}
        {field("annualGasKwh", "Gas kWh a year", "From the bill")}
      </div>
    </div>
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
          {rates.electricityNight != null && (form.fuel || usage?.fuel || "electric") !== "gas" ? (
            <label className="mt-3 flex items-start gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={form.usesOffPeak} onChange={(event) => set({ usesOffPeak: event.target.checked })} className="mt-0.5" />
              <span>Usually run on the night rate ({rates.electricityNight}p instead of {rates.electricity}p)<span className="block font-semibold text-slate-500">Tick it if it&apos;s on a timer or you run it overnight.</span></span>
            </label>
          ) : null}
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
                <button type="button" disabled={looking} onClick={() => { setLooking(true); setLookupNote(null); quietly(() => previewProductLink(form.productUrl)).then((result) => { setForm({ ...form, imageUrl: form.imageUrl || result.image || "", brand: form.brand || result.brand || "", retailer: form.retailer || nameFromProductUrl(form.productUrl)?.retailer || "" }); setLookupNote(result.image ? "Picture found." : result.reason || "No picture on that page — paste a picture link below."); }).catch((error) => setLookupNote(error instanceof Error ? error.message : "Couldn't look that up.")).finally(() => setLooking(false)); }} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 disabled:opacity-50">{looking ? "Looking…" : "Get picture from the link"}</button>
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
