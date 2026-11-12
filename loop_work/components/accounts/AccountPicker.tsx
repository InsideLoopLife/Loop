"use client";

// "Which account?" picker used wherever money is paid in or out. Each account
// shows whose it is on the right – a person's face/initial, or a joint mark
// for shared accounts – and a new account can be added without leaving the form.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { quickAddFinancialAccount } from "@/app/accounts/actions";
import { isLoopError } from "@/lib/actions/friendly";

export type PickerAccount = { id: string; name: string; provider?: string | null; account_type?: string | null; owner_person_id?: string | null; ownership_scope?: string | null };
export type PickerPerson = { id: string; name: string; relationship?: string | null; avatar_url?: string | null };

const TYPE_LABEL: Record<string, string> = { current_account: "Everyday", savings: "Savings", credit_card: "Credit card", other: "Other" };
const PALETTE = ["bg-sky-100 text-sky-800", "bg-rose-100 text-rose-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800"];

function isShared(account: PickerAccount) {
  return !account.owner_person_id || ["joint", "household"].includes(String(account.ownership_scope || ""));
}

/** Two linked rings – "this account belongs to more than one person". */
export function JointMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span title="Joint account" className={`grid shrink-0 place-items-center rounded-full bg-teal-100 text-teal-800 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <circle cx="9" cy="12" r="5.5" />
        <circle cx="15" cy="12" r="5.5" />
      </svg>
      <span className="sr-only">Joint</span>
    </span>
  );
}

export function OwnerMark({ account, people, className = "h-6 w-6" }: { account: PickerAccount; people: PickerPerson[]; className?: string }) {
  if (isShared(account)) return <JointMark className={className} />;
  const index = people.findIndex((p) => p.id === account.owner_person_id);
  const person = people[index];
  if (!person) return <JointMark className={className} />;
  if (person.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatar_url} alt={person.name} title={`${person.name}'s account`} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span title={`${person.name}'s account`} className={`grid shrink-0 place-items-center rounded-full text-[11px] font-black ${PALETTE[index % PALETTE.length]} ${className}`}>
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ownerText(account: PickerAccount, people: PickerPerson[]) {
  if (isShared(account)) return "Joint";
  return people.find((p) => p.id === account.owner_person_id)?.name || "Joint";
}

export function AccountPicker({
  accounts,
  people,
  value,
  onChange,
  name,
  emptyLabel = "Choose later",
  defaultOwnerId,
  initial = "",
}: {
  accounts: PickerAccount[];
  people: PickerPerson[];
  value?: string;
  onChange?: (id: string) => void;
  /** Set to post the chosen id with a plain form. */
  name?: string;
  emptyLabel?: string;
  /** Who a new account belongs to by default. */
  defaultOwnerId?: string;
  /** Starting choice when the picker manages its own value. */
  initial?: string;
}) {
  const [added, setAdded] = useState<PickerAccount[]>([]);
  const [own, setOwn] = useState(value ?? initial);
  const selected = value ?? own;
  const choose = (id: string) => { setOwn(id); onChange?.(id); };

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...accounts, ...added].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }, [accounts, added]);
  const groups = useMemo(() => {
    const everyday = all.filter((a) => a.account_type === "current_account" || a.account_type === "credit_card");
    const savings = all.filter((a) => !everyday.includes(a));
    return [
      { label: "Everyday accounts", items: everyday },
      { label: "Savings", items: savings },
    ].filter((g) => g.items.length);
  }, [all]);
  const current = all.find((a) => a.id === selected);
  const adults = people.filter((p) => p.relationship !== "child");

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < 340 && r.top > 340;
      setRect({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 300), up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false); setAdding(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setAdding(false); button.current?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <>
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => { event.preventDefault(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none ring-orange-500 transition focus:ring-2"
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? <>{current.provider ? <span className="font-semibold">{current.provider} · </span> : null}{current.name}</> : <span className="text-slate-500">{emptyLabel}</span>}
        </span>
        {current ? <OwnerMark account={current} people={people} className="h-6 w-6" /> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panel}
              role="listbox"
              style={{ position: "fixed", left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top } : { top: rect.top }) }}
              className="z-[400] max-h-[min(420px,70vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-[0_24px_60px_-20px_rgba(15,23,42,.45)]"
            >
              {adding ? (
                <QuickAddAccount
                  people={adults}
                  defaultOwnerId={defaultOwnerId && adults.some((p) => p.id === defaultOwnerId) ? defaultOwnerId : adults.find((p) => p.relationship === "self")?.id || ""}
                  onCancel={() => setAdding(false)}
                  onAdded={(account) => { setAdded((list) => [...list, account]); choose(account.id); setAdding(false); setOpen(false); }}
                />
              ) : (
                <>
                  <Option active={!selected} onClick={() => { choose(""); setOpen(false); }}>
                    <span className="flex-1 text-slate-500">{emptyLabel}</span>
                  </Option>
                  {groups.map((group) => (
                    <div key={group.label} className="mt-1">
                      <p className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{group.label}</p>
                      {group.items.map((account) => (
                        <Option key={account.id} active={account.id === selected} onClick={() => { choose(account.id); setOpen(false); }}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{account.provider ? <span className="font-semibold">{account.provider} · </span> : null}{account.name}</span>
                            <span className="block text-xs text-slate-400">{TYPE_LABEL[String(account.account_type)] || "Account"} · {ownerText(account, people)}</span>
                          </span>
                          <OwnerMark account={account} people={people} className="h-7 w-7" />
                        </Option>
                      ))}
                    </div>
                  ))}
                  {!all.some((a) => a.account_type === "current_account") ? (
                    <p className="mx-2 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">No everyday (current) accounts yet – add the one your bills come out of.</p>
                  ) : null}
                  <button type="button" onClick={() => setAdding(true)} className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 font-semibold text-slate-700 hover:border-slate-950 hover:bg-slate-50">
                    <Plus className="h-4 w-4" /> Add an account
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Option({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="option" aria-selected={active} onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}>
      <span className="grid w-4 shrink-0 place-items-center">{active ? <Check className="h-4 w-4 text-[var(--pine,#0f766e)]" /> : null}</span>
      {children}
    </button>
  );
}

function QuickAddAccount({ people, defaultOwnerId, onCancel, onAdded }: { people: PickerPerson[]; defaultOwnerId: string; onCancel: () => void; onAdded: (account: PickerAccount) => void }) {
  const [provider, setProvider] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"current_account" | "savings">("current_account");
  const [owner, setOwner] = useState<string>(defaultOwnerId || "joint");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  async function save() {
    if (!provider.trim() && !label.trim()) { setError("Add the bank or a name."); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    const name = label.trim() || (type === "current_account" ? "Current account" : "Savings");
    fd.set("provider", provider.trim());
    fd.set("name", name);
    fd.set("account_type", type);
    if (owner === "joint") fd.set("ownership_scope", "joint");
    else { fd.set("owner_person_id", owner); fd.set("ownership_scope", "personal"); }
    const result: any = await quickAddFinancialAccount(fd).catch((e: any) => ({ __loopError: e?.message || "That didn't save." }));
    setBusy(false);
    if (isLoopError(result)) { setError(result.__loopError); return; }
    if (!result?.id) { setError("That didn't save. Please try again."); return; }
    onAdded({ id: result.id, name, provider: provider.trim(), account_type: type, owner_person_id: owner === "joint" ? null : owner, ownership_scope: owner === "joint" ? "joint" : "personal" });
  }

  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`;
  return (
    <div className="space-y-3 p-2" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}>
      <div className="flex items-center justify-between">
        <p className="font-black text-slate-950">Add an account</p>
        <button type="button" onClick={onCancel} aria-label="Back" className="text-slate-400 hover:text-slate-900"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={pill(type === "current_account")} onClick={() => setType("current_account")}>Everyday / current</button>
        <button type="button" className={pill(type === "savings")} onClick={() => setType("savings")}>Savings</button>
      </div>
      <input ref={first} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Bank – e.g. Monzo, Santander" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "current_account" ? "Name – e.g. Joint bills, Dan's main" : "Name – e.g. Rainy day"} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-500">Whose is it?</p>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <button key={p.id} type="button" className={pill(owner === p.id)} onClick={() => setOwner(p.id)}>{p.name}</button>
          ))}
          <button type="button" className={`${pill(owner === "joint")} inline-flex items-center gap-1.5`} onClick={() => setOwner("joint")}><span aria-hidden><JointMark className="h-4 w-4" /></span> Joint</button>
        </div>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Balance and rate can be added later in Accounts.</p>
        <button type="button" disabled={busy} onClick={save} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Adding…" : "Add and use"}</button>
      </div>
    </div>
  );
}
