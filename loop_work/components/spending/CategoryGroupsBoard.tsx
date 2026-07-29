"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCategoryGroup,
  addPlannedItem,
  assignCategoryGroup,
  deleteCategoryGroup,
  deleteSpendingCategory,
  addSpendingCategory,
  updateFinancialFlowLineCategories,
} from "@/app/spending/actions";

export type BoardPerson = { id: string; name: string; relationship: string; user_id?: string | null; linked_user_id?: string | null; account_status?: string | null };
export type BoardGroup = { id: string; name: string; icon?: string | null };
export type BoardCategory = { id: string; name: string; type: "fixed" | "variable" | "saving" | "debt"; category_icon?: string | null; group_id?: string | null };
export type BoardItem = { id: string; person_id: string | null; category_id: string | null; direction: "income" | "outgoing"; label: string; amount: number; recurrence: string; item_type: string; pet_id?: string | null };
export type BoardChildCost = { id: string; child_id: string | null; category_id: string | null; label: string; cost_kind: string | null; monthly_cost: number | null };
export type BoardPet = { id: string; name: string; species: string };

// A small fixed palette so groups get a stable, distinguishable colour without any config —
// index-based, so the same group always renders the same colour within a session.
const GROUP_COLOURS = [
  { dot: "bg-orange-500", ring: "ring-orange-200", chip: "bg-orange-50 text-orange-700" },
  { dot: "bg-emerald-500", ring: "ring-emerald-200", chip: "bg-emerald-50 text-emerald-700" },
  { dot: "bg-sky-500", ring: "ring-sky-200", chip: "bg-sky-50 text-sky-700" },
  { dot: "bg-violet-500", ring: "ring-violet-200", chip: "bg-violet-50 text-violet-700" },
  { dot: "bg-rose-500", ring: "ring-rose-200", chip: "bg-rose-50 text-rose-700" },
  { dot: "bg-amber-500", ring: "ring-amber-200", chip: "bg-amber-50 text-amber-700" },
  { dot: "bg-cyan-500", ring: "ring-cyan-200", chip: "bg-cyan-50 text-cyan-700" },
];

type PoolItem = { dragId: string; id: string; kind: "planned" | "child"; personId: string | null; categoryId: string | null; label: string; amount: number; sublabel: string; isSavingsOrInvestment: boolean };

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value || 0);

function personName(people: BoardPerson[], personId: string | null) {
  if (!personId) return "🏠 Household / shared";
  return people.find((person) => person.id === personId)?.name || "🏠 Household / shared";
}

function guessGroupIcon(name: string) {
  const lower = name.toLowerCase();
  if (/subscription|netflix|spotify|apple|phone|mobile|entertainment/.test(lower)) return "📱";
  if (/mortgage|rent|home|house|bill/.test(lower)) return "🏠";
  if (/utility|gas|electric|water|energy|council/.test(lower)) return "⚡";
  if (/car|fuel|transport|motor|vw|train|bus|parking/.test(lower)) return "🚗";
  if (/child|nursery|school|activity|kid/.test(lower)) return "👶";
  if (/pet|dog|cat|vet/.test(lower)) return "🐾";
  if (/food|grocery|shop|supermarket/.test(lower)) return "🛒";
  if (/insurance|cover|policy/.test(lower)) return "🛡️";
  if (/loan|debt|credit|card|finance/.test(lower)) return "💳";
  if (/saving|investment|isa|pension/.test(lower)) return "💰";
  if (/health|dental|doctor|medical/.test(lower)) return "🏥";
  if (/holiday|travel|trip/.test(lower)) return "✈️";
  if (/fun|gift|hobby/.test(lower)) return "🎉";
  return "📦";
}

export function CategoryGroupsBoard({ people, groups, categories, items, childCosts, pets, hasHousehold }: { people: BoardPerson[]; groups: BoardGroup[]; categories: BoardCategory[]; items: BoardItem[]; childCosts: BoardChildCost[]; pets: BoardPet[]; hasHousehold: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draggingBillId, setDraggingBillId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState<string | null>(null); // group_id to add a category into, "" for ungrouped
  const [showAddOutgoing, setShowAddOutgoing] = useState(false);
  const [showSavingsInPool, setShowSavingsInPool] = useState(false);
  const [hideGroupedFromPool, setHideGroupedFromPool] = useState(true);
  const [poolSearch, setPoolSearch] = useState("");

  const groupColourById = useMemo(() => {
    const map = new Map<string, (typeof GROUP_COLOURS)[number]>();
    groups.forEach((group, index) => map.set(group.id, GROUP_COLOURS[index % GROUP_COLOURS.length]));
    return map;
  }, [groups]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  // Derived, not stored: a bill's group comes from its single category, which itself belongs to
  // at most one group — so every bill is unambiguously in zero or one group, by construction.
  function groupColourForCategory(categoryId: string | null) {
    if (!categoryId) return null;
    const category = categoryById.get(categoryId);
    if (!category?.group_id) return null;
    return groupColourById.get(category.group_id) || null;
  }

  function isFullyGrouped(categoryId: string | null) {
    if (!categoryId) return false;
    return Boolean(categoryById.get(categoryId)?.group_id);
  }

  const allPoolItems: PoolItem[] = useMemo(() => {
    const plannedPool: PoolItem[] = items.map((item) => ({
      dragId: `planned:${item.id}`,
      id: item.id,
      kind: "planned" as const,
      personId: item.person_id,
      categoryId: item.category_id,
      label: item.label,
      amount: item.amount,
      sublabel: item.recurrence.replaceAll("_", " "),
      isSavingsOrInvestment: item.item_type === "saving_investment" || categoryById.get(item.category_id || "")?.type === "saving",
    }));
    const childPool: PoolItem[] = childCosts.map((cost) => ({
      dragId: `child:${cost.id}`,
      id: cost.id,
      kind: "child" as const,
      personId: cost.child_id,
      categoryId: cost.category_id,
      label: cost.label,
      amount: Number(cost.monthly_cost || 0),
      sublabel: cost.cost_kind === "nursery" ? "Nursery" : cost.cost_kind === "activity" ? "Activity" : "Child cost",
      isSavingsOrInvestment: false,
    }));
    return [...plannedPool, ...childPool];
  }, [items, childCosts, categoryById]);

  const pool = useMemo(() => {
    const query = poolSearch.trim().toLowerCase();
    return allPoolItems.filter((item) => {
      if (!showSavingsInPool && item.isSavingsOrInvestment) return false;
      if (hideGroupedFromPool && isFullyGrouped(item.categoryId)) return false;
      if (query && !item.label.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [allPoolItems, showSavingsInPool, hideGroupedFromPool, poolSearch, categoryById]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, PoolItem[]>();
    for (const item of allPoolItems) {
      const key = item.categoryId || "__uncategorised";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [allPoolItems]);

  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, BoardCategory[]>();
    for (const category of categories) {
      const key = category.group_id || "__ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(category);
    }
    return map;
  }, [categories]);

  function moveBillToCategory(dragId: string, categoryId: string | null) {
    const fd = new FormData();
    if (categoryId) fd.set("category_id", categoryId);
    fd.append("line_id", dragId);
    startTransition(async () => {
      await updateFinancialFlowLineCategories(fd);
      router.refresh();
    });
  }

  function moveCategoryToGroup(categoryId: string, groupId: string | null) {
    const fd = new FormData();
    fd.set("category_id", categoryId);
    if (groupId) fd.set("group_id", groupId);
    startTransition(async () => {
      await assignCategoryGroup(fd);
      router.refresh();
    });
  }

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    const fd = new FormData();
    fd.set("name", newGroupName.trim());
    startTransition(async () => {
      await addCategoryGroup(fd);
      setNewGroupName("");
      router.refresh();
    });
  }

  function handleDeleteGroup(groupId: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this group? Its categories move back to Ungrouped, nothing is deleted.")) return;
    const fd = new FormData();
    fd.set("id", groupId);
    startTransition(async () => {
      await deleteCategoryGroup(fd);
      router.refresh();
    });
  }

  function handleDeleteCategory(categoryId: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this category? Bills filed here become uncategorised.")) return;
    const fd = new FormData();
    fd.set("id", categoryId);
    startTransition(async () => {
      await deleteSpendingCategory(fd);
      router.refresh();
    });
  }

  function handleCreateCategory(groupId: string | null, name: string) {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("type", "variable");
    if (groupId) fd.set("group_id", groupId);
    startTransition(async () => {
      await addSpendingCategory(fd);
      setShowNewCategory(null);
      router.refresh();
    });
  }

  function handleAddOutgoing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get("label") || "").trim();
    const amount = String(data.get("amount") || "");
    if (!label || !amount) return;
    const fd = new FormData();
    fd.set("label", label);
    fd.set("amount", amount);
    fd.set("direction", "outgoing");
    fd.set("item_type", "monthly_cost");
    fd.set("recurrence", "monthly");
    fd.set("start_date", new Date().toISOString().slice(0, 10));
    const personId = String(data.get("person_id") || "");
    if (personId) fd.set("person_id", personId);
    const petId = String(data.get("pet_id") || "");
    if (petId) fd.set("pet_id", petId);
    startTransition(async () => {
      await addPlannedItem(fd);
      form.reset();
      setShowAddOutgoing(false);
      router.refresh();
    });
  }

  const billPool = (
    <div className="sticky top-4 self-start rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Drag from here</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">All outgoing bills</h2>
        </div>
        <button type="button" onClick={() => setShowAddOutgoing((value) => !value)} className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white">{showAddOutgoing ? "Close" : "+ Add outgoing"}</button>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-500">Every recurring or one-off outgoing across the household, including child costs. Drag any one of these onto a category box on the right.</p>

      {showAddOutgoing ? (
        <form onSubmit={handleAddOutgoing} className="mt-4 space-y-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
          <input name="label" placeholder="What is it? e.g. Council Tax" required className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950" />
          <input name="amount" type="number" step="0.01" placeholder="Amount" required className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950" />
          {hasHousehold ? (
            <select name="person_id" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950">
              <option value="">🏠 Household / shared</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          ) : null}
          {pets.length ? (
            <select name="pet_id" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950">
              <option value="">No specific pet</option>
              {pets.map((pet) => <option key={pet.id} value={pet.id}>🐾 {pet.name} · {pet.species}</option>)}
            </select>
          ) : null}
          <button type="submit" className="w-full rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white">Add as monthly outgoing</button>
          <p className="text-[11px] font-medium text-slate-400">Adds a monthly item starting today. Open "Add spending" on the Spending page for one-off spends or different recurrences.</p>
        </form>
      ) : null}

      <div className="mt-4 space-y-2">
        <input
          value={poolSearch}
          onChange={(event) => setPoolSearch(event.target.value)}
          placeholder="Search bills…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <input type="checkbox" checked={hideGroupedFromPool} onChange={(event) => setHideGroupedFromPool(event.target.checked)} className="rounded" />
            Hide already-grouped bills
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <input type="checkbox" checked={showSavingsInPool} onChange={(event) => setShowSavingsInPool(event.target.checked)} className="rounded" />
            Include savings &amp; investment transfers
          </label>
        </div>
      </div>

      <div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
        {pool.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-medium text-slate-400">Nothing to show — try adjusting the filters above.</p> : null}
        {pool.map((item) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : null;
          const groupColour = groupColourForCategory(item.categoryId);
          return (
            <div
              key={item.dragId}
              draggable
              onDragStart={() => setDraggingBillId(item.dragId)}
              onDragEnd={() => setDraggingBillId(null)}
              className={`cursor-grab rounded-2xl border bg-white p-3 shadow-sm transition active:cursor-grabbing ${draggingBillId === item.dragId ? "opacity-40" : "border-slate-200"} ${groupColour ? `ring-1 ${groupColour.ring}` : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-950">{item.kind === "child" ? "👶 " : ""}{item.label}</p>
                <p className="shrink-0 text-sm font-semibold text-slate-700">{money(item.amount)}</p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-medium text-slate-400">
                  {hasHousehold ? `${personName(people, item.personId)} · ` : ""}
                  {category ? category.name : "Uncategorised"}
                </p>
                {groupColour ? <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${groupColour.chip}`}>✓ grouped</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  function CategoryBox({ category }: { category: BoardCategory }) {
    const bills = itemsByCategory.get(category.id) || [];
    const isDropHover = dropTarget === category.id;
    const groupColour = category.group_id ? groupColourById.get(category.group_id) : null;
    return (
      <div
        draggable
        onDragStart={() => setDraggingCategoryId(category.id)}
        onDragEnd={() => setDraggingCategoryId(null)}
        onDragOver={(event) => { event.preventDefault(); if (draggingBillId) setDropTarget(category.id); }}
        onDragLeave={() => setDropTarget((current) => (current === category.id ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          setDropTarget(null);
          if (draggingBillId) {
            moveBillToCategory(draggingBillId, category.id);
            setDraggingBillId(null);
          }
        }}
        className={`rounded-2xl border p-4 transition ${isDropHover ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">{category.category_icon || guessGroupIcon(category.name)} {category.name}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{category.type} · {bills.length} bill{bills.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {groupColour ? <span className={`h-3 w-3 rounded-full ${groupColour.dot}`} title="This category's group" /> : null}
            <button type="button" onClick={() => handleDeleteCategory(category.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-700">Delete</button>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {bills.map((bill) => (
            <div key={bill.dragId} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
              <p className="truncate text-xs font-medium text-slate-700">{bill.kind === "child" ? "👶 " : ""}{bill.label}</p>
              <p className="shrink-0 text-xs font-semibold text-slate-900">{money(bill.amount)}</p>
            </div>
          ))}
          {bills.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-2 text-center text-[11px] font-medium text-slate-400">Drop a bill here</p> : null}
        </div>
      </div>
    );
  }

  function GroupSection({ group }: { group: BoardGroup | null }) {
    const groupId = group?.id ?? null;
    const groupKey = groupId || "__ungrouped";
    const groupCategories = categoriesByGroup.get(groupKey) || [];
    const isDropHover = dropTarget === `group:${groupKey}`;
    const addingHere = showNewCategory === groupKey;
    const colour = group ? groupColourById.get(group.id) : null;
    return (
      <div
        onDragOver={(event) => { event.preventDefault(); if (draggingCategoryId) setDropTarget(`group:${groupKey}`); }}
        onDragLeave={() => setDropTarget((current) => (current === `group:${groupKey}` ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          setDropTarget(null);
          if (draggingCategoryId) {
            moveCategoryToGroup(draggingCategoryId, groupId);
            setDraggingCategoryId(null);
          }
        }}
        className={`rounded-[2rem] border p-5 transition ${isDropHover ? "border-emerald-400 bg-emerald-50/60" : "border-white/70 bg-white/80"} shadow-sm`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {colour ? <span className={`h-3 w-3 shrink-0 rounded-full ${colour.dot}`} /> : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{group ? "Group" : "No group"}</p>
              <h3 className="text-lg font-bold text-slate-950">{group ? `${group.icon || guessGroupIcon(group.name)} ${group.name}` : "🗂️ Ungrouped categories"}</h3>
              {group ? <p className="mt-1 text-xs font-medium text-slate-500">Drag a category card here to add it to this group. Bills can belong to different people or joint accounts — that's fine, groups just bundle categories.</p> : null}
            </div>
          </div>
          {group ? <button type="button" onClick={() => handleDeleteGroup(group.id)} className="shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100">Delete group</button> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groupCategories.map((category) => <CategoryBox key={category.id} category={category} />)}
        </div>
        <div className="mt-3">
          {addingHere ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const name = String(new FormData(form).get("name") || "");
                handleCreateCategory(groupId, name);
              }}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-3"
            >
              <input name="name" autoFocus placeholder="New category name" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950" />
              <button type="submit" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white">Add</button>
              <button type="button" onClick={() => setShowNewCategory(null)} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">Cancel</button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowNewCategory(groupKey)} className="rounded-full border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-500 hover:border-slate-950 hover:text-slate-950">+ New category {group ? `in ${group.name}` : ""}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid items-start gap-5 xl:grid-cols-[360px_1fr] ${isPending ? "opacity-70" : ""}`}>
      {billPool}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-700">New group, e.g. "Household bills"</p>
          <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Group name" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950" />
          <button type="button" onClick={handleCreateGroup} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white">+ Create group</button>
        </div>

        {groups.map((group) => <GroupSection key={group.id} group={group} />)}
        <GroupSection group={null} />
      </div>
    </div>
  );
}
