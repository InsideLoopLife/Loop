"use client";

import * as React from "react";

export type FoodPersonOption = {
  id: string;
  name: string;
  relationship?: string | null;
  avatar_url?: string | null;
  initials?: string | null;
  is_self?: boolean;
};

type PersonAvatarMultiSelectProps = {
  people: FoodPersonOption[];
  defaultSelectedIds?: string[];
  name?: string;
};

function initials(person: FoodPersonOption) {
  return person.initials || person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function PersonAvatarMultiSelect({ people, defaultSelectedIds, name = "person_ids" }: PersonAvatarMultiSelectProps) {
  const fallbackSelf = people.find((person) => person.is_self)?.id;
  const [selected, setSelected] = React.useState<string[]>(defaultSelectedIds?.length ? defaultSelectedIds : fallbackSelf ? [fallbackSelf] : []);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function selectAll() {
    setSelected((current) => current.length === people.length ? [] : people.map((person) => person.id));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <input type="hidden" name={name} value={selected.join(",")} />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black">Who had this?</p>
        <button type="button" onClick={selectAll} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
          {selected.length === people.length ? "Clear" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {people.map((person) => {
          const active = selected.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => toggle(person.id)}
              className={`relative flex items-center gap-2 rounded-2xl border px-3 py-2 text-left shadow-sm transition ${
                active ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"
              }`}
              aria-pressed={active}
            >
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-black">
                {person.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(person)
                )}
              </span>
              <span>
                <span className="block text-sm font-black">{person.name}</span>
                <span className="block text-xs text-slate-500">{person.relationship || (person.is_self ? "self" : "member")}</span>
              </span>
              {active ? <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 text-xs font-black text-white">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
