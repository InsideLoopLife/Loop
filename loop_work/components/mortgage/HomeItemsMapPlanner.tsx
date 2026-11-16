"use client";
// Parked for now (16 Nov 2026): the room-map and floor-plan view. Not shown; the list view in
// HomeItemsPlanner.tsx is used instead. Kept so it can come back later.

// Things in the home. The floors come from the house drawing (a bungalow has one, "2 + loft"
// has three, a garage shows only if there is one), each floor is a rough plan the person can
// redraw, and each appliance sits in the room it's in, coloured by warranty and age.

import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { deleteHomeItem, listHomeItems, saveFloorPlan, saveHomeItem, setHomeItemStatus, type HomeItemInput } from "@/app/mortgage/home-items-actions";
import { HOME_ITEM_KINDS, KIND_BY_KEY, ROOM_LABELS, STATUS_STYLE, parseHomeItemText, planHomeItem, type HomeItem, type HomeRoom } from "@/lib/home/items";
import { GRID_H, GRID_W, SPACE_BY_KEY, SPACE_TYPES, newSpaceId, resolvePlan, spaceName, suggestedSpaces, type FloorKey, type FloorPlan, type HouseShape, type Space, type SpaceType } from "@/lib/home/floor-plan";

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const money2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const niceDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const CELL = 40;
const STATUS_RANK = { past_life: 0, nearing_end: 1, warranty_ending: 2, out_of_warranty: 3, unknown: 4, in_warranty: 5 } as const;

type HouseLook = HouseShape & { brick?: string; render?: string; renderColour?: string; roof?: string };
type Draft = HomeItemInput & { warrantyChoice: string };
type Planned = { item: HomeItem; plan: ReturnType<typeof planHomeItem> };

const spaceRoom = (space: Space): HomeRoom => SPACE_BY_KEY.get(space.type)?.room || "other";

function blankDraft(space: Space | null, kindKey: string, homeId: string | null): Draft {
  const kind = KIND_BY_KEY.get(kindKey) || KIND_BY_KEY.get("other")!;
  return { homeId, spaceId: space?.id ?? null, room: space ? spaceRoom(space) : kind.room, kind: kind.key, label: kind.key === "other" ? "" : kind.label, purchasedOn: "", price: "", warrantyMonths: 12, warrantyChoice: "12" };
}

function draftFromItem(item: HomeItem, spaceId: string | null): Draft {
  const months = item.warranty_months;
  return {
    id: item.id, homeId: item.home_id, spaceId, room: item.room, kind: item.kind, label: item.label, brand: item.brand, model: item.model,
    purchasedOn: item.purchased_on ? item.purchased_on.slice(0, 7) : "", price: item.price ?? "", retailer: item.retailer,
    warrantyMonths: months, warrantyChoice: months == null ? "" : ["0", "12", "24", "36", "60", "120"].includes(String(months)) ? String(months) : "custom",
    extendedWarrantyEndsOn: item.extended_warranty_ends_on, warrantyProvider: item.warranty_provider,
    expectedLifeYears: item.expected_life_years ?? "", replacementCost: item.replacement_cost ?? "", notes: item.notes,
  };
}

export function HomeItemsMapPlanner({ homeId, houseStyle }: { homeId: string | null; houseStyle: HouseLook | null }) {
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [savedPlan, setSavedPlan] = useState<FloorPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [floorKey, setFloorKey] = useState<FloorKey>("ground");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quickText, setQuickText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [editing, setEditing] = useState<Space[] | null>(null);
  const [today] = useState(londonToday);
  const [isPending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listHomeItems(homeId)
      .then((result) => { if (!cancelled) { setItems(result.items); setSavedPlan(result.floorPlan); } })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load your things."); });
    return () => { cancelled = true; };
  }, [reloadKey, homeId]);

  const floors = useMemo(() => resolvePlan(houseStyle, savedPlan), [houseStyle, savedPlan]);
  const floor = floors.find((f) => f.key === floorKey) || floors[0];
  const allSpaces = useMemo(() => floors.flatMap((f) => f.spaces.map((space) => ({ space, floor: f }))), [floors]);
  const places = useMemo(() => allSpaces.map(({ space, floor: f }) => ({ id: space.id, label: `${spaceName(space)} · ${f.label}`, room: spaceRoom(space) })), [allSpaces]);

  const active = useMemo(() => (items || []).filter((item) => item.status === "active" && (!homeId || !item.home_id || item.home_id === homeId)), [items, homeId]);
  // Each item goes in its drawn room; older items (or ones whose room was removed) go in the first room of the same kind.
  const placement = useMemo(() => {
    const bySpace = new Map<string, Planned[]>();
    const unplaced: Planned[] = [];
    const ids = new Set(allSpaces.map(({ space }) => space.id));
    for (const item of active) {
      const row = { item, plan: planHomeItem(item, today) };
      const target = item.space_id && ids.has(item.space_id) ? item.space_id : allSpaces.find(({ space }) => spaceRoom(space) === item.room)?.space.id;
      if (target) bySpace.set(target, [...(bySpace.get(target) || []), row]);
      else unplaced.push(row);
    }
    for (const rows of bySpace.values()) rows.sort((a, b) => STATUS_RANK[a.plan.status] - STATUS_RANK[b.plan.status]);
    return { bySpace, unplaced, spaceOf: (item: HomeItem) => [...bySpace.entries()].find(([, rows]) => rows.some((r) => r.item.id === item.id))?.[0] ?? null };
  }, [active, allSpaces, today]);
  const planned = useMemo(() => [...placement.bySpace.values()].flat().concat(placement.unplaced), [placement]);

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

  const selected = floor.spaces.find((space) => space.id === spaceId) || null;
  const selectedRows = selected ? placement.bySpace.get(selected.id) || [] : [];
  const selectedRoom = selected ? spaceRoom(selected) : null;
  const roomKinds = selectedRoom ? HOME_ITEM_KINDS.filter((kind) => kind.room === selectedRoom && kind.key !== "other") : [];
  const gone = (items || []).filter((item) => item.status !== "active");

  function pickFloor(key: FloorKey) { setFloorKey(key); setSpaceId(null); setDraft(null); setEditing(null); }
  function openAdd(kindKey: string) { setMessage(null); setDraft(blankDraft(selected, kindKey, homeId)); }

  function quickAdd() {
    const parsed = parseHomeItemText(quickText, today);
    const kind = parsed.kind ? KIND_BY_KEY.get(parsed.kind)! : null;
    const match = (selected && kind && spaceRoom(selected) === kind.room ? { space: selected, floor } : null) || (kind ? allSpaces.find(({ space }) => spaceRoom(space) === kind.room) : null) || (selected ? { space: selected, floor } : null);
    const base = blankDraft(match?.space ?? null, parsed.kind || "other", homeId);
    if (!parsed.kind) base.label = quickText.trim().slice(0, 60);
    setDraft({
      ...base,
      brand: parsed.brand,
      price: parsed.price ?? "",
      purchasedOn: parsed.purchasedOn ? parsed.purchasedOn.slice(0, 7) : "",
      warrantyMonths: parsed.warrantyMonths ?? base.warrantyMonths,
      warrantyChoice: parsed.warrantyMonths == null ? base.warrantyChoice : ["0", "12", "24", "36", "60", "120"].includes(String(parsed.warrantyMonths)) ? String(parsed.warrantyMonths) : "custom",
    });
    if (match) { setFloorKey(match.floor.key); setSpaceId(match.space.id); }
    setMessage(parsed.kind ? null : "Couldn't tell what that is — pick it below.");
  }

  function run(task: () => Promise<unknown>, after?: () => void) {
    startTransition(async () => {
      try { await task(); after?.(); setReloadKey((key) => key + 1); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't save that."); }
    });
  }
  const save = () => { if (draft) { const payload = { ...draft }; run(() => saveHomeItem(payload), () => { setDraft(null); setQuickText(""); setMessage("Saved."); }); } };
  const changeStatus = (id: string, status: "active" | "replaced" | "gone") => run(() => setHomeItemStatus(id, status), () => setDraft(null));
  const remove = (id: string) => { if (window.confirm("Delete this item? This can't be undone. (Use 'Replaced it' to keep its history instead.)")) run(() => deleteHomeItem(id), () => setDraft(null)); };

  function savePlan(spaces: Space[]) {
    if (!homeId) { setMessage("Add your home first, then you can draw its rooms."); return; }
    const next: FloorPlan = { version: 1, floors: Object.fromEntries(floors.map((f) => [f.key, f.key === floor.key ? spaces : f.spaces])) };
    run(() => saveFloorPlan(homeId, next), () => { setEditing(null); setMessage("Floor plan saved."); });
  }

  if (loadError) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{loadError}</p>;

  return (
    <div className="space-y-5">
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="home-item-quick">Add something in one line</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="home-item-quick" value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && quickText.trim()) { event.preventDefault(); quickAdd(); } }} placeholder="e.g. Bosch dishwasher, March 2023, £450, 5 year warranty" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="button" disabled={!quickText.trim()} onClick={quickAdd} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:bg-slate-300">Fill it in</button>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold text-slate-400">You&apos;ll see it before it&apos;s saved.</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="rounded-[18px] border border-slate-200 bg-[#eef4f1] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <HouseFloorPicker style={houseStyle} floors={floors} current={floor.key} counts={Object.fromEntries(floors.map((f) => [f.key, f.spaces.reduce((n, s) => n + (placement.bySpace.get(s.id)?.length || 0), 0)]))} onPick={pickFloor} />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">{floor.label}</p>
                {editing ? null : <button type="button" onClick={() => { setDraft(null); setSpaceId(null); setEditing(floor.spaces.map((s) => ({ ...s }))); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50">✎ Draw the rooms</button>}
              </div>
              {editing ? (
                <PlanEditor spaces={editing} onChange={setEditing} onSave={() => savePlan(editing)} onCancel={() => setEditing(null)} onReset={() => setEditing(suggestedSpaces(houseStyle, floor.key).map((s) => ({ ...s, id: newSpaceId() })))} pending={isPending} />
              ) : (
                <PlanView spaces={floor.spaces} bySpace={placement.bySpace} selectedId={spaceId} onSelect={(id) => { setSpaceId(id); setDraft(null); setMessage(null); }} />
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 px-1 text-[10px] font-semibold text-slate-500">
            {(["in_warranty", "warranty_ending", "out_of_warranty", "nearing_end", "past_life"] as const).map((key) => (
              <span key={key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[key].dot }} />{STATUS_STYLE[key].label}</span>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
          {draft ? (
            <ItemForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => { setDraft(null); setMessage(null); }} onStatus={changeStatus} onDelete={remove} pending={isPending} message={message} today={today} places={places} />
          ) : editing ? (
            <div className="space-y-3 text-sm text-slate-600">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Drawing {floor.label.toLowerCase()}</p>
              <p><span className="font-bold text-slate-900">Draw a room:</span> drag across empty squares.</p>
              <p><span className="font-bold text-slate-900">Move it:</span> drag the room. <span className="font-bold text-slate-900">Resize:</span> drag its bottom-right corner.</p>
              <p><span className="font-bold text-slate-900">Name it:</span> tap a room, then pick what it is underneath the plan.</p>
              <p className="text-xs text-slate-400">It doesn&apos;t need to be exact — rough squares are fine. Things already in a room stay with it.</p>
              {message ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p> : null}
            </div>
          ) : selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{floor.label}</p>
                  <h2 className="text-xl font-bold">{spaceName(selected)}</h2>
                </div>
                <button type="button" onClick={() => openAdd("other")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">+ Something else</button>
              </div>
              {message ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</p> : null}
              <ItemList rows={selectedRows} onOpen={(item) => { setMessage(null); setDraft(draftFromItem(item, placement.spaceOf(item))); }} />
              {roomKinds.length ? (
                <>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Add to {spaceName(selected).toLowerCase()}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {roomKinds.map((kind) => (
                      <button key={kind.key} type="button" onClick={() => openAdd(kind.key)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs font-bold hover:border-violet-300 hover:bg-violet-50">
                        <span className="text-base">{kind.icon}</span>{kind.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{floor.label}</p>
              <h2 className="text-xl font-bold">Tap a room</h2>
              <p className="mt-2 text-sm text-slate-500">Pick a room on the plan to see what&apos;s in it or add something. Pick a floor on the house to move between floors.</p>
              {message ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</p> : null}
              {items === null ? <p className="mt-4 text-sm text-slate-400">Loading…</p> : null}
              {placement.unplaced.length ? (
                <>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-amber-700">Not in a room yet</p>
                  <ItemList rows={placement.unplaced} onOpen={(item) => { setMessage(null); setDraft(draftFromItem(item, null)); }} />
                </>
              ) : null}
            </>
          )}
          <p className="mt-5 text-[11px] font-semibold leading-5 text-slate-400">Lifespans and replacement prices are rough UK guides unless you add your own. Put aside spreads the replacement cost over the time it&apos;s likely to last.</p>
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

function ItemList({ rows, onOpen }: { rows: Planned[]; onOpen: (item: HomeItem) => void }) {
  if (!rows.length) return <p className="mt-4 text-sm text-slate-500">Nothing here yet.</p>;
  return (
    <ul className="mt-4 space-y-2">
      {rows.map(({ item, plan }) => (
        <li key={item.id}>
          <button type="button" onClick={() => onOpen(item)} className="flex w-full items-start gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-violet-50">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg" style={{ boxShadow: `0 0 0 2px ${STATUS_STYLE[plan.status].dot}` }}>{KIND_BY_KEY.get(item.kind)?.icon || "📦"}</span>
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
  );
}

/** A small front view of the house in its own colours; each floor is a button. */
function HouseFloorPicker({ style, floors, current, counts, onPick }: { style: HouseLook | null; floors: Array<{ key: FloorKey; label: string }>; current: FloorKey; counts: Record<string, number>; onPick: (key: FloorKey) => void }) {
  const type = style?.type || "semi";
  const isFlat = type === "flat";
  const wall = style?.render === "full" ? style?.renderColour || "#f3f1ea" : style?.brick || "#a8513a";
  const upper = style?.render === "upper" ? style?.renderColour || "#f3f1ea" : wall;
  const lower = style?.render === "lower" ? style?.renderColour || "#f3f1ea" : wall;
  const roof = style?.roof || "#4a505a";
  const indoor = floors.filter((f) => f.key !== "outside" && f.key !== "loft");
  const hasLoft = floors.some((f) => f.key === "loft");
  const garage = style?.garage && style.garage !== "none" && style.garage !== "integral" && style.garageAttached !== false ? style.garage : null;
  const integral = style?.garage === "integral";
  const left = style?.garageSide === "left";
  const bandH = 38;
  const houseW = 120;
  const gW = garage === "double" ? 56 : garage ? 40 : 0;
  const hx = garage && left ? 10 + gW : 10;
  const roofH = isFlat ? 0 : hasLoft ? 46 : 34;
  const top = 8 + roofH;
  const bottom = top + indoor.length * bandH;
  const width = 20 + houseW + gW;
  const outside = floors.find((f) => f.key === "outside");
  const ring = (key: FloorKey) => (current === key ? "#7c3aed" : "transparent");
  const badge = (key: FloorKey, x: number, y: number) => counts[key] ? <g><circle cx={x} cy={y} r="9" fill="#7c3aed" /><text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{counts[key]}</text></g> : null;
  return (
    <svg viewBox={`0 0 ${width} ${bottom + 30}`} className="mx-auto h-auto w-full max-w-[200px] shrink-0 sm:mx-0 sm:w-[150px]" role="group" aria-label="Pick a floor">
      {!isFlat ? (
        <g role="button" tabIndex={hasLoft ? 0 : -1} aria-label={hasLoft ? "Loft room" : undefined} aria-pressed={hasLoft ? current === "loft" : undefined} onClick={() => hasLoft && onPick("loft")} onKeyDown={(e) => { if (hasLoft && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick("loft"); } }} className={hasLoft ? "cursor-pointer" : ""}>
          <polygon points={`${hx - 6},${top} ${hx + houseW / 2},8 ${hx + houseW + 6},${top}`} fill={roof} stroke={ring("loft")} strokeWidth="3" />
          {hasLoft ? <><rect x={hx + houseW / 2 - 9} y={top - 32} width="18" height="12" rx="2" fill="#fde68a" stroke="#fff" strokeWidth="1.5" /><rect x={hx + houseW / 2 - 20} y={top - 17} width="40" height="14" rx="7" fill={current === "loft" ? "#7c3aed" : "rgba(255,255,255,.92)"} /><text x={hx + houseW / 2} y={top - 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={current === "loft" ? "#fff" : "#1e293b"}>Loft</text>{badge("loft", hx + houseW - 14, top - 8)}</> : null}
        </g>
      ) : <rect x={hx} y={top - 6} width={houseW} height="6" fill={roof} />}
      {indoor.map((f, index) => {
        const y = bottom - (index + 1) * bandH;
        return (
          <g key={f.key} role="button" tabIndex={0} aria-label={f.label} aria-pressed={current === f.key} onClick={() => onPick(f.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(f.key); } }} className="cursor-pointer">
            <rect x={hx} y={y} width={houseW} height={bandH} fill={index === 0 ? lower : upper} stroke={ring(f.key)} strokeWidth="3" />
            <rect x={hx + 8} y={y + 8} width="16" height="13" rx="2" fill="#cfe3f3" stroke="#fff" strokeWidth="1.5" />
            <rect x={hx + houseW - 24} y={y + 8} width="16" height="13" rx="2" fill="#cfe3f3" stroke="#fff" strokeWidth="1.5" />
            {index === 0 && integral ? <rect x={left ? hx + 4 : hx + houseW - 40} y={y + 8} width="36" height={bandH - 8} rx="2" fill="#e5e7eb" stroke="#94a3b8" /> : null}
            {index === 0 && !isFlat ? <rect x={hx + houseW / 2 - 7} y={y + bandH - 14} width="14" height="14" rx="2" fill="#1f4f3d" /> : null}
            <rect x={hx + houseW / 2 - 34} y={y + 6} width="68" height="15" rx="7.5" fill={current === f.key ? "#7c3aed" : "rgba(255,255,255,.92)"} />
            <text x={hx + houseW / 2} y={y + 17} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={current === f.key ? "#fff" : "#1e293b"}>{f.label}</text>
            {badge(f.key, hx + houseW - 8, y + 8)}
          </g>
        );
      })}
      {garage ? (
        <g role="button" tabIndex={0} aria-label="Garage, on the ground floor plan" onClick={() => onPick("ground")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick("ground"); } }} className="cursor-pointer">
          <rect x={left ? 10 : hx + houseW} y={bottom - bandH - 4} width={gW} height={bandH + 4} fill={style?.brick || "#a8513a"} opacity="0.9" />
          <rect x={(left ? 10 : hx + houseW) + 5} y={bottom - bandH + 6} width={gW - 10} height={bandH - 6} rx="2" fill="#e5e7eb" stroke="#94a3b8" />
        </g>
      ) : null}
      {outside ? (
        <g role="button" tabIndex={0} aria-label="Outside" aria-pressed={current === "outside"} onClick={() => onPick("outside")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick("outside"); } }} className="cursor-pointer">
          <rect x="2" y={bottom} width={width - 4} height="24" rx="8" fill="#bfe0c4" stroke={ring("outside")} strokeWidth="3" />
          <text x={width / 2} y={bottom + 16} textAnchor="middle" fontSize="10" fontWeight="700" fill="#14532d">Outside</text>
          {badge("outside", width - 16, bottom + 12)}
        </g>
      ) : null}
    </svg>
  );
}

/** The floor seen from above: rough rooms with what's in them. */
function PlanView({ spaces, bySpace, selectedId, onSelect }: { spaces: Space[]; bySpace: Map<string, Planned[]>; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <svg viewBox={`-4 -4 ${GRID_W * CELL + 8} ${GRID_H * CELL + 8}`} className="h-auto w-full rounded-xl bg-white" role="group" aria-label="Floor plan">
      {spaces.map((space) => {
        const rows = bySpace.get(space.id) || [];
        const selected = space.id === selectedId;
        const x = space.x * CELL, y = space.y * CELL, w = space.w * CELL, h = space.h * CELL;
        const maxBadges = Math.max(1, Math.floor((w - 12) / 28));
        const small = w < 100 || h < 70;
        return (
          <g key={space.id} role="button" tabIndex={0} aria-label={`${spaceName(space)}: ${rows.length} item${rows.length === 1 ? "" : "s"}`} aria-pressed={selected} onClick={() => onSelect(space.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(space.id); } }} className="cursor-pointer outline-none">
            <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="6" fill={SPACE_BY_KEY.get(space.type)?.fill || "#f5f5f4"} stroke={selected ? "#7c3aed" : "#475569"} strokeWidth={selected ? 4 : 2} />
            {space.type === "stairs" ? Array.from({ length: Math.max(2, space.h * 2) }, (_, i) => <line key={i} x1={x + 8} x2={x + w - 8} y1={y + 8 + i * ((h - 16) / Math.max(2, space.h * 2))} y2={y + 8 + i * ((h - 16) / Math.max(2, space.h * 2))} stroke="#94a3b8" strokeWidth="1.5" />) : null}
            <text x={x + 10} y={y + 20} fontSize={small ? 11 : 14} fontWeight="700" fill={selected ? "#5b21b6" : "#1e293b"}>{spaceName(space).length > Math.max(4, Math.floor(w / 8)) ? `${spaceName(space).slice(0, Math.max(3, Math.floor(w / 8) - 1))}…` : spaceName(space)}</text>
            {rows.slice(0, maxBadges).map(({ item, plan }, index) => (
              <g key={item.id} transform={`translate(${x + 20 + index * 28}, ${y + h - 20})`}>
                <title>{`${item.label} · ${STATUS_STYLE[plan.status].label}`}</title>
                <circle r="12" fill="#ffffff" stroke={STATUS_STYLE[plan.status].dot} strokeWidth="3" />
                <text y="5" textAnchor="middle" fontSize="13">{KIND_BY_KEY.get(item.kind)?.icon || "📦"}</text>
              </g>
            ))}
            {rows.length > maxBadges ? <text x={x + 12 + maxBadges * 28} y={y + h - 15} fontSize="12" fontWeight="700" fill="#475569">+{rows.length - maxBadges}</text> : null}
          </g>
        );
      })}
      {!spaces.length ? <text x={(GRID_W * CELL) / 2} y={(GRID_H * CELL) / 2} textAnchor="middle" fontSize="15" fill="#94a3b8">No rooms drawn yet — tap “Draw the rooms”.</text> : null}
    </svg>
  );
}

type Drag = { mode: "draw" | "move" | "resize"; id: string; startX: number; startY: number; origin: Space };

/** Draw, move and resize rough rooms on a grid. */
function PlanEditor({ spaces, onChange, onSave, onCancel, onReset, pending }: { spaces: Space[]; onChange: (spaces: Space[]) => void; onSave: () => void; onCancel: () => void; onReset: () => void; pending: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = spaces.find((space) => space.id === selectedId) || null;

  function cellAt(event: ReactPointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: Math.max(0, Math.min(GRID_W, local.x / CELL)), y: Math.max(0, Math.min(GRID_H, local.y / CELL)) };
  }
  const update = (id: string, patch: Partial<Space>) => onChange(spaces.map((space) => (space.id === id ? { ...space, ...patch } : space)));

  function startDraw(event: ReactPointerEvent<SVGRectElement>) {
    const at = cellAt(event);
    const x = Math.min(GRID_W - 1, Math.floor(at.x)), y = Math.min(GRID_H - 1, Math.floor(at.y));
    const space: Space = { id: newSpaceId(), type: "other", x, y, w: 1, h: 1 };
    onChange([...spaces, space]);
    setSelectedId(space.id);
    setDrag({ mode: "draw", id: space.id, startX: x, startY: y, origin: space });
    svgRef.current?.setPointerCapture(event.pointerId);
  }
  function startOn(event: ReactPointerEvent, space: Space, mode: "move" | "resize") {
    event.stopPropagation();
    const at = cellAt(event);
    setSelectedId(space.id);
    setDrag({ mode, id: space.id, startX: at.x, startY: at.y, origin: { ...space } });
    svgRef.current?.setPointerCapture(event.pointerId);
  }
  function onMove(event: ReactPointerEvent) {
    if (!drag) return;
    const at = cellAt(event);
    const o = drag.origin;
    if (drag.mode === "draw") {
      const x2 = Math.min(GRID_W - 1, Math.floor(at.x)), y2 = Math.min(GRID_H - 1, Math.floor(at.y));
      update(drag.id, { x: Math.min(drag.startX, x2), y: Math.min(drag.startY, y2), w: Math.abs(x2 - drag.startX) + 1, h: Math.abs(y2 - drag.startY) + 1 });
    } else if (drag.mode === "move") {
      const dx = Math.round(at.x - drag.startX), dy = Math.round(at.y - drag.startY);
      update(drag.id, { x: Math.max(0, Math.min(GRID_W - o.w, o.x + dx)), y: Math.max(0, Math.min(GRID_H - o.h, o.y + dy)) });
    } else {
      update(drag.id, { w: Math.max(1, Math.min(GRID_W - o.x, Math.round(at.x - o.x))), h: Math.max(1, Math.min(GRID_H - o.y, Math.round(at.y - o.y))) });
    }
  }
  function onUp() {
    if (drag?.mode === "draw") {
      const drawn = spaces.find((space) => space.id === drag.id);
      if (drawn && drawn.w * drawn.h < 2) { onChange(spaces.filter((space) => space.id !== drag.id)); setSelectedId(null); }
    }
    setDrag(null);
  }

  return (
    <div>
      <svg ref={svgRef} viewBox={`-4 -4 ${GRID_W * CELL + 8} ${GRID_H * CELL + 8}`} className="h-auto w-full touch-none select-none rounded-xl bg-white" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Floor plan editor">
        <rect x="0" y="0" width={GRID_W * CELL} height={GRID_H * CELL} fill="#ffffff" onPointerDown={startDraw} className="cursor-crosshair" />
        {Array.from({ length: GRID_W + 1 }, (_, i) => <line key={`v${i}`} x1={i * CELL} x2={i * CELL} y1="0" y2={GRID_H * CELL} stroke="#e2e8f0" strokeWidth="1" pointerEvents="none" />)}
        {Array.from({ length: GRID_H + 1 }, (_, i) => <line key={`h${i}`} y1={i * CELL} y2={i * CELL} x1="0" x2={GRID_W * CELL} stroke="#e2e8f0" strokeWidth="1" pointerEvents="none" />)}
        {spaces.map((space) => {
          const x = space.x * CELL, y = space.y * CELL, w = space.w * CELL, h = space.h * CELL;
          const isSelected = space.id === selectedId;
          return (
            <g key={space.id}>
              <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="6" fill={SPACE_BY_KEY.get(space.type)?.fill || "#f5f5f4"} fillOpacity="0.92" stroke={isSelected ? "#7c3aed" : "#475569"} strokeWidth={isSelected ? 4 : 2} onPointerDown={(e) => startOn(e, space, "move")} className="cursor-move" />
              <text x={x + 10} y={y + 20} fontSize="13" fontWeight="700" fill="#1e293b" pointerEvents="none">{spaceName(space)}</text>
              <rect x={x + w - 18} y={y + h - 18} width="16" height="16" rx="3" fill={isSelected ? "#7c3aed" : "#64748b"} onPointerDown={(e) => startOn(e, space, "resize")} className="cursor-nwse-resize" />
            </g>
          );
        })}
      </svg>
      {selected ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="flex flex-wrap gap-1.5">
            {SPACE_TYPES.map((type) => (
              <button key={type.key} type="button" onClick={() => update(selected.id, { type: type.key as SpaceType })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selected.type === type.key ? "bg-slate-950 text-white" : "text-slate-700 ring-1 ring-slate-200"}`} style={selected.type === type.key ? undefined : { background: type.fill }}>{type.label}</button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={selected.name || ""} onChange={(e) => update(selected.id, { name: e.target.value.slice(0, 40) })} placeholder={`Name (e.g. ${selected.type === "bedroom" ? "Myla's room" : "Downstairs loo"})`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            <button type="button" onClick={() => { onChange(spaces.filter((space) => space.id !== selected.id)); setSelectedId(null); }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">Remove room</button>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={onSave} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{pending ? "Saving…" : "Save floor plan"}</button>
        <button type="button" onClick={onCancel} className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-slate-200">Cancel</button>
        <button type="button" onClick={() => { if (window.confirm("Start this floor again from the suggested layout?")) { onReset(); setSelectedId(null); } }} className="ml-auto text-xs font-bold text-slate-500">Start again</button>
      </div>
    </div>
  );
}

const WARRANTY_CHOICES: Array<[string, string]> = [["0", "None"], ["12", "1 year"], ["24", "2 years"], ["36", "3 years"], ["60", "5 years"], ["120", "10 years"], ["custom", "Other"]];

function ItemForm({ draft, setDraft, onSave, onCancel, onStatus, onDelete, pending, message, today, places }: {
  places: Array<{ id: string; label: string; room: HomeRoom }>;
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
          <select value={draft.kind} onChange={(event) => { const next = KIND_BY_KEY.get(event.target.value)!; set({ kind: next.key, label: !draft.label || draft.label === kind.label ? (next.key === "other" ? "" : next.label) : draft.label, room: next.key === "other" || draft.spaceId ? draft.room : next.room }); }} className={input}>
            {HOME_ITEM_KINDS.map((option) => <option key={option.key} value={option.key}>{option.icon} {option.label}</option>)}
          </select>
        </label>
        <label className={label}>Name
          <input value={draft.label} onChange={(event) => set({ label: event.target.value })} placeholder={kind.label} className={input} required />
        </label>
        <label className={label}>Where is it?
          <select value={draft.spaceId || ""} onChange={(event) => { const place = places.find((p) => p.id === event.target.value); set({ spaceId: place?.id || null, room: place?.room || draft.room }); }} className={input}>
            {!draft.spaceId ? <option value="">{ROOM_LABELS[draft.room as HomeRoom] || "Choose a room"}</option> : null}
            {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
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
