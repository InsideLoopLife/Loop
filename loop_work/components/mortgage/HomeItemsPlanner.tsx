"use client";

// Things in the home: a drawing of the house split into rooms, with each appliance shown in
// its room and coloured by warranty and age. Tap a room to add something; or type it in one line.

import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteHomeItem, listHomeItems, saveHomeItem, setHomeItemStatus, type HomeItemInput } from "@/app/mortgage/home-items-actions";
import { HOME_ITEM_KINDS, KIND_BY_KEY, ROOM_LABELS, STATUS_STYLE, parseHomeItemText, planHomeItem, type HomeItem, type HomeRoom } from "@/lib/home/items";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const money2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const niceDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type MapRoom = { room: HomeRoom; x: number; y: number; w: number; h: number; points?: string };
const MAP_ROOMS: MapRoom[] = [
  { room: "loft", x: 210, y: 70, w: 240, h: 70, points: "70,150 330,32 590,150" },
  { room: "bedroom", x: 70, y: 150, w: 200, h: 115 },
  { room: "bathroom", x: 270, y: 150, w: 140, h: 115 },
  { room: "office", x: 410, y: 150, w: 180, h: 115 },
  { room: "living", x: 70, y: 265, w: 170, h: 120 },
  { room: "hallway", x: 240, y: 265, w: 80, h: 120 },
  { room: "kitchen", x: 320, y: 265, w: 160, h: 120 },
  { room: "utility", x: 480, y: 265, w: 110, h: 120 },
  { room: "garage", x: 590, y: 235, w: 140, h: 150 },
  { room: "garden", x: 20, y: 385, w: 720, h: 70 },
];
const OFF_MAP: HomeRoom[] = ["dining", "other"];

const STATUS_RANK = { past_life: 0, nearing_end: 1, warranty_ending: 2, out_of_warranty: 3, unknown: 4, in_warranty: 5 } as const;

type Draft = HomeItemInput & { warrantyChoice: string };

function blankDraft(room: HomeRoom, kindKey: string, homeId: string | null): Draft {
  const kind = KIND_BY_KEY.get(kindKey) || KIND_BY_KEY.get("other")!;
  return { homeId, room: kindKey === "other" ? room : kind.room === room || room === "other" ? kind.room : room, kind: kind.key, label: kind.key === "other" ? "" : kind.label, purchasedOn: "", price: "", warrantyMonths: 12, warrantyChoice: "12" };
}

function draftFromItem(item: HomeItem): Draft {
  const months = item.warranty_months;
  return {
    id: item.id, homeId: item.home_id, room: item.room, kind: item.kind, label: item.label, brand: item.brand, model: item.model,
    purchasedOn: item.purchased_on ? item.purchased_on.slice(0, 7) : "", price: item.price ?? "", retailer: item.retailer,
    warrantyMonths: months, warrantyChoice: months == null ? "" : ["0", "12", "24", "36", "60", "120"].includes(String(months)) ? String(months) : "custom",
    extendedWarrantyEndsOn: item.extended_warranty_ends_on, warrantyProvider: item.warranty_provider,
    expectedLifeYears: item.expected_life_years ?? "", replacementCost: item.replacement_cost ?? "", notes: item.notes,
  };
}

export function HomeItemsPlanner({ homeId }: { homeId: string | null }) {
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [room, setRoom] = useState<HomeRoom>("kitchen");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quickText, setQuickText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [today] = useState(londonToday);
  const [isPending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listHomeItems()
      .then((result) => { if (!cancelled) setItems(result.items); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load your things."); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const active = useMemo(() => (items || []).filter((item) => item.status === "active" && (!homeId || !item.home_id || item.home_id === homeId)), [items, homeId]);
  const planned = useMemo(() => active.map((item) => ({ item, plan: planHomeItem(item, today) })), [active, today]);
  const byRoom = useMemo(() => {
    const map = new Map<HomeRoom, typeof planned>();
    for (const row of planned) map.set(row.item.room, [...(map.get(row.item.room) || []), row]);
    for (const rows of map.values()) rows.sort((a, b) => STATUS_RANK[a.plan.status] - STATUS_RANK[b.plan.status]);
    return map;
  }, [planned]);

  const totals = useMemo(() => {
    const inYear = planned.filter(({ plan }) => plan.status === "past_life" || plan.status === "nearing_end");
    return {
      count: planned.length,
      outOfWarranty: planned.filter(({ plan }) => ["out_of_warranty", "nearing_end", "past_life"].includes(plan.status)).length,
      ending: planned.filter(({ plan }) => plan.status === "warranty_ending").length,
      setAside: planned.reduce((sum, { plan }) => sum + plan.monthlySetAside, 0),
      dueSoonCost: inYear.reduce((sum, { plan }) => sum + plan.replacementCost, 0),
      dueSoonCount: inYear.length,
      guesses: planned.filter(({ plan }) => plan.costIsGuess).length,
    };
  }, [planned]);

  const gone = (items || []).filter((item) => item.status !== "active");
  const roomItems = byRoom.get(room) || [];
  const roomKinds = HOME_ITEM_KINDS.filter((kind) => kind.room === room && kind.key !== "other");

  function openAdd(kindKey: string, forRoom: HomeRoom = room) {
    setMessage(null);
    setDraft(blankDraft(forRoom, kindKey, homeId));
  }

  function quickAdd() {
    const parsed = parseHomeItemText(quickText, today);
    const base = blankDraft(parsed.room || room, parsed.kind || "other", homeId);
    if (!parsed.kind) base.label = quickText.trim().slice(0, 60);
    setDraft({
      ...base,
      brand: parsed.brand,
      price: parsed.price ?? "",
      purchasedOn: parsed.purchasedOn ? parsed.purchasedOn.slice(0, 7) : "",
      warrantyMonths: parsed.warrantyMonths ?? base.warrantyMonths,
      warrantyChoice: parsed.warrantyMonths == null ? base.warrantyChoice : ["0", "12", "24", "36", "60", "120"].includes(String(parsed.warrantyMonths)) ? String(parsed.warrantyMonths) : "custom",
    });
    if (parsed.room) setRoom(parsed.room);
    setMessage(parsed.kind ? null : "Couldn't tell what that is — pick it below.");
  }

  function save() {
    if (!draft) return;
    const payload = { ...draft };
    startTransition(async () => {
      try {
        await saveHomeItem(payload);
        setDraft(null);
        setQuickText("");
        setMessage("Saved.");
        setReloadKey((key) => key + 1);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Couldn't save that.");
      }
    });
  }

  function changeStatus(id: string, status: "active" | "replaced" | "gone") {
    startTransition(async () => {
      try { await setHomeItemStatus(id, status); setDraft(null); setReloadKey((key) => key + 1); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't change that."); }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this item? This can't be undone. (Use 'Replaced' to keep its history instead.)")) return;
    startTransition(async () => {
      try { await deleteHomeItem(id); setDraft(null); setReloadKey((key) => key + 1); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't delete that."); }
    });
  }

  if (loadError) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{loadError}</p>;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {[
          ["Things logged", String(totals.count), totals.count ? `${totals.outOfWarranty} out of warranty` : "Tap a room to start"],
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

      {/* Quick add */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="home-item-quick">Add something in one line</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="home-item-quick" value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && quickText.trim()) { event.preventDefault(); quickAdd(); } }} placeholder="e.g. Bosch dishwasher, March 2023, £450, 5 year warranty" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="button" disabled={!quickText.trim()} onClick={quickAdd} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Fill it in</button>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold text-slate-400">You&apos;ll see it before it&apos;s saved.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Map */}
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-[#eef4f1] p-3">
          <svg viewBox="0 0 760 470" className="h-auto w-full" role="img" aria-label="Your home, room by room">
            <rect x="0" y="0" width="760" height="470" fill="#eef4f1" />
            {/* garden */}
            <rect x="10" y="385" width="740" height="75" rx="18" fill="#cfe6d2" />
            {/* roof */}
            <polygon points="58,152 330,22 602,152" fill="#b45f4d" />
            <polygon points="70,150 330,32 590,150" fill="#f6efe7" />
            {/* garage roof */}
            <polygon points="584,238 660,196 736,238" fill="#9a8f84" />
            {/* walls */}
            <rect x="64" y="146" width="532" height="243" rx="4" fill="#d9cbbb" />
            <rect x="586" y="232" width="150" height="157" rx="4" fill="#cbbfb2" />
            {MAP_ROOMS.map((spot) => {
              const rows = byRoom.get(spot.room) || [];
              const selected = room === spot.room;
              const worst = rows[0]?.plan.status;
              const tint = worst && (worst === "past_life" || worst === "nearing_end") ? "#fff1f2" : "#ffffff";
              const shape = spot.points
                ? <polygon points={spot.points} fill={spot.room === "loft" ? (selected ? "#f5f3ff" : "#f6efe7") : tint} stroke={selected ? "#7c3aed" : "transparent"} strokeWidth={selected ? 4 : 0} />
                : <rect x={spot.x + 3} y={spot.y + 3} width={spot.w - 6} height={spot.h - 6} rx={spot.room === "garden" ? 16 : 8} fill={spot.room === "garden" ? (selected ? "#bfe0c4" : "transparent") : selected ? "#f5f3ff" : tint} stroke={selected ? "#7c3aed" : spot.room === "garden" ? "transparent" : "#e7ddd2"} strokeWidth={selected ? 4 : 1.5} />;
              const maxBadges = Math.max(1, Math.floor((spot.w - 20) / 30));
              const badgeY = spot.room === "loft" ? spot.y + 48 : spot.room === "garden" ? spot.y + 44 : spot.y + spot.h - 28;
              const startX = spot.room === "loft" ? spot.x + spot.w / 2 - (Math.min(rows.length, maxBadges) * 30) / 2 + 15 : spot.x + 22;
              return (
                <g key={spot.room} role="button" tabIndex={0} aria-label={`${ROOM_LABELS[spot.room]}: ${rows.length} item${rows.length === 1 ? "" : "s"}`} aria-pressed={selected}
                  onClick={() => { setRoom(spot.room); setDraft(null); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRoom(spot.room); setDraft(null); } }}
                  className="cursor-pointer outline-none [&:focus-visible>*:first-child]:stroke-violet-500">
                  {shape}
                  <text x={spot.room === "loft" ? spot.x + spot.w / 2 : spot.x + 14} y={spot.room === "loft" ? spot.y + 20 : spot.y + 24} textAnchor={spot.room === "loft" ? "middle" : "start"} fontSize="15" fontWeight="700" fill={selected ? "#5b21b6" : "#334155"}>{ROOM_LABELS[spot.room]}</text>
                  {rows.slice(0, maxBadges).map(({ item, plan }, index) => (
                    <g key={item.id} transform={`translate(${startX + index * 30}, ${badgeY})`}>
                      <title>{`${item.label} · ${STATUS_STYLE[plan.status].label}`}</title>
                      <circle r="13" fill="#ffffff" stroke={STATUS_STYLE[plan.status].dot} strokeWidth="3" />
                      <text y="5" textAnchor="middle" fontSize="14">{KIND_BY_KEY.get(item.kind)?.icon || "📦"}</text>
                    </g>
                  ))}
                  {rows.length > maxBadges ? <text x={startX + maxBadges * 30 - 6} y={badgeY + 5} fontSize="13" fontWeight="700" fill="#475569">+{rows.length - maxBadges}</text> : null}
                  {!rows.length && spot.room !== "loft" ? <text x={spot.x + 14} y={spot.y + spot.h - (spot.room === "garden" ? 22 : 18)} fontSize="12" fontWeight="600" fill="#94a3b8">Tap to add</text> : null}
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
            {OFF_MAP.map((extra) => (
              <button key={extra} type="button" onClick={() => { setRoom(extra); setDraft(null); }} className={`rounded-full px-3 py-1.5 text-xs font-bold ${room === extra ? "bg-violet-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{ROOM_LABELS[extra]} {byRoom.get(extra)?.length ? `· ${byRoom.get(extra)!.length}` : ""}</button>
            ))}
            <span className="ml-auto flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
              {(["in_warranty", "warranty_ending", "out_of_warranty", "nearing_end", "past_life"] as const).map((key) => (
                <span key={key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[key].dot }} />{STATUS_STYLE[key].label}</span>
              ))}
            </span>
          </div>
        </div>

        {/* Room panel */}
        <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
          {draft ? (
            <ItemForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => { setDraft(null); setMessage(null); }} onStatus={changeStatus} onDelete={remove} pending={isPending} message={message} today={today} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Room</p>
                  <h2 className="text-xl font-bold">{ROOM_LABELS[room]}</h2>
                </div>
                <button type="button" onClick={() => openAdd("other")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">+ Something else</button>
              </div>
              {message ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</p> : null}
              {items === null ? <p className="mt-4 text-sm text-slate-400">Loading…</p> : null}
              {roomItems.length ? (
                <ul className="mt-4 space-y-2">
                  {roomItems.map(({ item, plan }) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => { setMessage(null); setDraft(draftFromItem(item)); }} className="flex w-full items-start gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-violet-50">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg ring-2" style={{ ["--tw-ring-color" as string]: STATUS_STYLE[plan.status].dot }}>{KIND_BY_KEY.get(item.kind)?.icon || "📦"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-950">{item.label}{item.brand ? <span className="font-semibold text-slate-500"> · {item.brand}</span> : null}</span>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[plan.status].chip}`}>{STATUS_STYLE[plan.status].label}</span>
                          <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                            {item.purchased_on ? `Bought ${niceDate(item.purchased_on)}` : "Purchase date not set"}
                            {plan.warrantyEnds ? ` · warranty ${plan.daysToWarrantyEnd != null && plan.daysToWarrantyEnd < 0 ? "ended" : "ends"} ${niceDate(plan.warrantyEnds)}` : ""}
                            {plan.lifeEnds ? ` · usually lasts to ~${niceDate(plan.lifeEnds)}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-bold">{money(plan.replacementCost)}</span>
                          <span className="block text-[10px] font-semibold text-slate-400">{plan.monthlySetAside > 0 ? `${money2(plan.monthlySetAside)}/mo` : plan.status === "past_life" ? "could go any time" : "to replace"}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : items !== null ? <p className="mt-4 text-sm text-slate-500">Nothing here yet.</p> : null}
              {roomKinds.length ? (
                <>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Add to {ROOM_LABELS[room].toLowerCase()}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {roomKinds.map((kind) => (
                      <button key={kind.key} type="button" onClick={() => openAdd(kind.key)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs font-bold hover:border-violet-300 hover:bg-violet-50">
                        <span className="text-base">{kind.icon}</span>{kind.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <p className="mt-5 text-[11px] font-semibold leading-5 text-slate-400">Lifespans and replacement prices are rough UK guides unless you add your own. Put aside spreads the replacement cost over the time it&apos;s likely to last.</p>
            </>
          )}
        </div>
      </section>

      {gone.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setShowGone((v) => !v)} className="text-xs font-bold text-slate-600">{showGone ? "Hide" : "Show"} replaced or gone ({gone.length})</button>
          {showGone ? (
            <ul className="mt-3 space-y-1.5">
              {gone.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate font-semibold text-slate-600">{KIND_BY_KEY.get(item.kind)?.icon} {item.label} · {item.status === "replaced" ? "replaced" : "gone"}</span>
                  <button type="button" onClick={() => changeStatus(item.id, "active")} className="shrink-0 text-xs font-bold text-violet-700">Bring back</button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

const WARRANTY_CHOICES: Array<[string, string]> = [["0", "None"], ["12", "1 year"], ["24", "2 years"], ["36", "3 years"], ["60", "5 years"], ["120", "10 years"], ["custom", "Other"]];

function ItemForm({ draft, setDraft, onSave, onCancel, onStatus, onDelete, pending, message, today }: {
  draft: Draft; setDraft: (draft: Draft) => void; onSave: () => void; onCancel: () => void;
  onStatus: (id: string, status: "active" | "replaced" | "gone") => void; onDelete: (id: string) => void; pending: boolean; message: string | null; today: string;
}) {
  const kind = KIND_BY_KEY.get(draft.kind) || KIND_BY_KEY.get("other")!;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const preview = planHomeItem({
    id: "draft", home_id: null, room: draft.room as HomeRoom, kind: draft.kind, label: draft.label, brand: null, model: null,
    purchased_on: draft.purchasedOn ? `${String(draft.purchasedOn).slice(0, 7)}-01` : null, price: draft.price === "" || draft.price == null ? null : Number(draft.price),
    retailer: null, warranty_months: draft.warrantyMonths === "" || draft.warrantyMonths == null ? null : Number(draft.warrantyMonths),
    extended_warranty_ends_on: draft.extendedWarrantyEndsOn || null, warranty_provider: null,
    expected_life_years: draft.expectedLifeYears === "" || draft.expectedLifeYears == null ? null : Number(draft.expectedLifeYears),
    replacement_cost: draft.replacementCost === "" || draft.replacementCost == null ? null : Number(draft.replacementCost), notes: null, status: "active",
  }, today);
  const input = "mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const label = "block text-xs font-bold text-slate-600";
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{draft.id ? "Edit" : "Add"}</p>
          <h2 className="text-xl font-bold">{kind.icon} {draft.label || kind.label}</h2>
        </div>
        <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">Back</button>
      </div>
      {message ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>What is it?
          <select value={draft.kind} onChange={(event) => { const next = KIND_BY_KEY.get(event.target.value)!; set({ kind: next.key, label: !draft.label || draft.label === kind.label ? (next.key === "other" ? "" : next.label) : draft.label, room: next.key === "other" ? draft.room : next.room }); }} className={input}>
            {HOME_ITEM_KINDS.map((option) => <option key={option.key} value={option.key}>{option.icon} {option.label}</option>)}
          </select>
        </label>
        <label className={label}>Name
          <input value={draft.label} onChange={(event) => set({ label: event.target.value })} placeholder={kind.label} className={input} required />
        </label>
        <label className={label}>Room
          <select value={draft.room} onChange={(event) => set({ room: event.target.value })} className={input}>
            {(Object.keys(ROOM_LABELS) as HomeRoom[]).map((key) => <option key={key} value={key}>{ROOM_LABELS[key]}</option>)}
          </select>
        </label>
        <label className={label}>Bought (month)
          <input type="month" value={String(draft.purchasedOn || "")} max={today.slice(0, 7)} onChange={(event) => set({ purchasedOn: event.target.value })} className={input} />
        </label>
        <label className={label}>Price paid (£)
          <input inputMode="decimal" value={String(draft.price ?? "")} onChange={(event) => set({ price: event.target.value })} placeholder="Optional" className={input} />
        </label>
        <label className={label}>Brand
          <input value={draft.brand || ""} onChange={(event) => set({ brand: event.target.value })} placeholder="Optional" className={input} />
        </label>
      </div>
      <div>
        <p className={label}>Warranty from new</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WARRANTY_CHOICES.map(([value, text]) => (
            <button key={value} type="button" onClick={() => set({ warrantyChoice: value, warrantyMonths: value === "custom" ? draft.warrantyMonths : Number(value) })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${draft.warrantyChoice === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{text}</button>
          ))}
        </div>
        {draft.warrantyChoice === "custom" ? (
          <label className={`${label} mt-2`}>Months
            <input inputMode="numeric" value={String(draft.warrantyMonths ?? "")} onChange={(event) => set({ warrantyMonths: event.target.value })} className={`${input} max-w-32`} />
          </label>
        ) : null}
      </div>
      <details className="rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-600">More details (extended warranty, model, your own lifespan)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>Extended warranty or cover ends
            <input type="date" value={draft.extendedWarrantyEndsOn || ""} onChange={(event) => set({ extendedWarrantyEndsOn: event.target.value })} className={input} />
          </label>
          <label className={label}>Who covers it
            <input value={draft.warrantyProvider || ""} onChange={(event) => set({ warrantyProvider: event.target.value })} placeholder="e.g. Currys Care & Repair" className={input} />
          </label>
          <label className={label}>Model
            <input value={draft.model || ""} onChange={(event) => set({ model: event.target.value })} className={input} />
          </label>
          <label className={label}>Bought from
            <input value={draft.retailer || ""} onChange={(event) => set({ retailer: event.target.value })} className={input} />
          </label>
          <label className={label}>Expected life (years)
            <input inputMode="decimal" value={String(draft.expectedLifeYears ?? "")} onChange={(event) => set({ expectedLifeYears: event.target.value })} placeholder={`About ${kind.lifeYears}`} className={input} />
          </label>
          <label className={label}>Cost to replace (£)
            <input inputMode="decimal" value={String(draft.replacementCost ?? "")} onChange={(event) => set({ replacementCost: event.target.value })} placeholder={draft.price ? `Uses price paid` : kind.typicalCost ? `About ${money(kind.typicalCost)}` : "Optional"} className={input} />
          </label>
          <label className={`${label} sm:col-span-2`}>Notes
            <textarea value={draft.notes || ""} onChange={(event) => set({ notes: event.target.value })} rows={2} placeholder="Serial number, where the receipt is, repair history…" className={input} />
          </label>
        </div>
      </details>
      <div className="rounded-xl bg-violet-50 p-3 text-xs font-semibold text-violet-900">
        {preview.warrantyEnds ? <p>Warranty {preview.daysToWarrantyEnd != null && preview.daysToWarrantyEnd < 0 ? "ended" : "ends"} {niceDate(preview.warrantyEnds)}.</p> : <p>Add when it was bought to work out the warranty.</p>}
        {preview.lifeEnds ? <p>Usually lasts about {preview.lifeYears} years, so plan to replace around {niceDate(preview.lifeEnds)}: {money(preview.replacementCost)}{preview.costIsGuess ? " (typical price)" : ""}{preview.monthlySetAside > 0 ? `, or ${money2(preview.monthlySetAside)} a month from now` : ""}.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || !draft.label.trim()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:bg-slate-300">{pending ? "Saving…" : "Save"}</button>
        {draft.id ? (
          <>
            <button type="button" disabled={pending} onClick={() => onStatus(draft.id!, "replaced")} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold">Replaced it</button>
            <button type="button" disabled={pending} onClick={() => onStatus(draft.id!, "gone")} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold">Got rid of it</button>
            <button type="button" disabled={pending} onClick={() => onDelete(draft.id!)} className="ml-auto text-xs font-bold text-rose-700">Delete</button>
          </>
        ) : null}
      </div>
    </form>
  );
}
