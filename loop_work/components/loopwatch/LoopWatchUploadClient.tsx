"use client";

import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, Loader2, Paperclip, Search, ShieldCheck, Sparkles, UploadCloud, UserRound, X } from "lucide-react";

export type LoopWatchPerson = {
  id: string;
  name: string;
  relationship: string | null;
  avatar_url: string | null;
};

type ReviewPayload = {
  item?: {
    id?: string;
    item_type?: string;
    provider_name?: string | null;
    product_name?: string | null;
    payment_amount?: number | null;
    payment_frequency?: string | null;
    annual_cost?: number | null;
    renewal_date?: string | null;
    end_date?: string | null;
    summary?: string | null;
    confidence_score?: number | null;
    owner_person_id?: string | null;
    suggested_owner_person_id?: string | null;
  };
  routing?: {
    routingSummary?: string;
    suggestedOwnerPersonId?: string | null;
    suggestedOwnerName?: string | null;
    suggestions?: Array<{ title?: string; question?: string; summary?: string; type?: string }>;
  };
  message?: string;
  extractionWarning?: string | null;
  sourceFileDeleted?: boolean;
};

function initials(name?: string | null) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function prettyType(value?: string | null) {
  return String(value || "loopwatch_item")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not found";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 2 }).format(Number(value));
}

function Avatar({ person, active, compact = false }: { person: LoopWatchPerson; active: boolean; compact?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full text-xs font-black shadow-sm ${compact ? "h-10 w-10" : "h-12 w-12"} ${active ? "bg-orange-500 text-white ring-4 ring-orange-100" : "bg-slate-950 text-white"}`}>
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt={person.name} className="h-full w-full object-cover" />
      ) : (
        initials(person.name)
      )}
    </span>
  );
}

function OwnerPicker({ people, ownerPersonId, setOwnerPersonId, compact = false }: { people: LoopWatchPerson[]; ownerPersonId: string; setOwnerPersonId: (value: string) => void; compact?: boolean }) {
  if (!people.length) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
        <UserRound className="h-4 w-4" /> Saved to your account.
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      <button
        type="button"
        onClick={() => setOwnerPersonId("")}
        className={`flex items-center gap-2 rounded-full border text-left transition ${compact ? "px-2 py-1.5 pr-3" : "px-3 py-2 pr-4"} ${ownerPersonId === "" ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
      >
        <span className={`grid place-items-center rounded-full ${compact ? "h-10 w-10" : "h-12 w-12"} ${ownerPersonId === "" ? "bg-orange-500 text-white ring-4 ring-orange-100" : "bg-slate-950 text-white"}`}>
          <Sparkles className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-black text-slate-950">Auto-detect</span>
          {!compact ? <span className="block text-[11px] font-black uppercase tracking-wide text-slate-400">Ask LoopWatch</span> : null}
        </span>
      </button>
      {people.map((person) => {
        const active = ownerPersonId === person.id;
        return (
          <button
            key={person.id}
            type="button"
            onClick={() => setOwnerPersonId(person.id)}
            className={`flex items-center gap-2 rounded-full border text-left transition ${compact ? "px-1.5 py-1.5 pr-3" : "px-2 py-2 pr-4"} ${active ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
          >
            <Avatar person={person} active={active} compact={compact} />
            <span>
              <span className="block text-sm font-black text-slate-950">{person.name}</span>
              {!compact ? <span className="block text-[11px] font-black uppercase tracking-wide text-slate-400">{person.relationship || "Person"}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewModal({ payload, people, ownerPersonId, setOwnerPersonId, onClose }: { payload: ReviewPayload; people: LoopWatchPerson[]; ownerPersonId: string; setOwnerPersonId: (value: string) => void; onClose: () => void }) {
  const item = payload.item || {};
  const suggestions = payload.routing?.suggestions || [];
  const owner = people.find((person) => person.id === (ownerPersonId || item.owner_person_id || item.suggested_owner_person_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/70 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Review before Loop uses it</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{item.provider_name || item.product_name || "LoopWatch found something"}</h2>
              <p className="mt-1 max-w-2xl text-sm font-bold text-slate-500">{payload.routing?.routingSummary || payload.message || "Confirm the key facts, choose the owner, then open the review card to accept or overwrite fields."}</p>
            </div>
            <div className="flex items-center gap-2">
              {owner ? <Avatar person={owner} active compact /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-white"><Sparkles className="h-4 w-4" /></span>}
              <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Type</p>
              <p className="mt-1 text-lg font-black text-slate-950">{prettyType(item.item_type)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cost</p>
              <p className="mt-1 text-lg font-black text-slate-950">{item.payment_amount ? `${money(item.payment_amount)} ${item.payment_frequency || ""}` : money(item.annual_cost)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Date to watch</p>
              <p className="mt-1 text-lg font-black text-slate-950">{item.renewal_date || item.end_date || "Not found"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Confidence</p>
              <p className="mt-1 text-lg font-black text-slate-950">{typeof item.confidence_score === "number" ? `${Math.round(item.confidence_score * 100)}%` : "Review"}</p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-orange-100 bg-orange-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-orange-950">Attach to a person or household</p>
                <p className="mt-1 text-sm font-bold text-orange-800">Click a household image. This keeps bills, cars and policies against the right person without creating duplicate documents.</p>
              </div>
              {payload.sourceFileDeleted ? <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">Source file deleted</span> : null}
            </div>
            <div className="mt-3"><OwnerPicker people={people} ownerPersonId={ownerPersonId} setOwnerPersonId={setOwnerPersonId} compact /></div>
          </div>

          {payload.extractionWarning ? <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800 ring-1 ring-amber-100">{payload.extractionWarning}</div> : null}

          {suggestions.length ? (
            <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-black text-blue-950">Suggested next actions</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {suggestions.slice(0, 4).map((suggestion, index) => (
                  <div key={`${suggestion.type || "suggestion"}-${index}`} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-blue-100">
                    <p className="font-black text-slate-950">{suggestion.title || "Suggestion"}</p>
                    <p className="mt-1 font-bold text-slate-600">{suggestion.question || suggestion.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">Keep reviewing here</button>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15"><CheckCircle2 className="h-4 w-4" /> Open review card</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoopWatchUploadClient({ people, hasHousehold }: { people: LoopWatchPerson[]; hasHousehold: boolean }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ownerPersonId, setOwnerPersonId] = useState("");
  const [documentHint, setDocumentHint] = useState("");
  const [userNote, setUserNote] = useState("");
  const [attachSearch, setAttachSearch] = useState("");
  const [status, setStatus] = useState<"idle" | "context" | "processing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file && !attachSearch.trim()) {
      setStatus("error");
      setMessage("Search for something to attach or choose a document first.");
      return;
    }
    if (attachSearch.trim() && !userNote.trim()) {
      setStatus("context");
      setMessage("Give me context first — who/what it relates to, what you want LoopWatch to do, and any rough cost/date you already know. Then send.");
      return;
    }

    setStatus("processing");
    setMessage(file ? "Reading the document, extracting dates/terms, then deleting the source file. This usually takes 30–90 seconds." : "Creating a LoopWatch review card from your context and suggested watch logic.");

    try {
      let response: Response;
      if (file) {
        const body = new FormData();
        body.append("file", file);
        if (ownerPersonId) body.append("owner_person_id", ownerPersonId);
        if (documentHint) body.append("document_type_hint", documentHint);
        if (userNote || attachSearch) body.append("user_note", [attachSearch, userNote].filter(Boolean).join(" — "));
        response = await fetch("/api/loopwatch/process", { method: "POST", body });
      } else {
        response = await fetch("/api/loopwatch/intake", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: attachSearch, context: userNote, owner_person_id: ownerPersonId || null, document_type_hint: documentHint || null }),
        });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "LoopWatch could not process this.");
      setStatus("done");
      setMessage(payload.extractionWarning || payload.message || "LoopWatch created a review card.");
      setReviewPayload(payload);
    } catch (error: any) {
      setStatus("error");
      setMessage(String(error?.message || error || "Processing failed."));
    }
  }

  return (
    <>
      {reviewPayload ? <ReviewModal payload={reviewPayload} people={people} ownerPersonId={ownerPersonId} setOwnerPersonId={setOwnerPersonId} onClose={() => setReviewPayload(null)} /> : null}
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50/80 p-5">
          <div className="rounded-[1.5rem] border border-white bg-white p-4 shadow-inner shadow-slate-100">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                value={attachSearch}
                onChange={(event) => setAttachSearch(event.target.value)}
                placeholder="Search or attach a thing… e.g. car insurance, nursery bill, looking for a new car"
                className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-950 outline-none placeholder:text-slate-400"
              />
              <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-200 sm:inline">then add context</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[.95fr_1.05fr]">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center transition hover:border-orange-200 hover:bg-orange-50/35">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.md,.json,.rtf,.html,.xml,image/*,application/pdf,text/*"
                  className="sr-only"
                  onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name || "")}
                />
                <span className="grid h-14 w-14 place-items-center rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-950/20">
                  <UploadCloud className="h-7 w-7" />
                </span>
                <span className="mt-3 text-base font-black text-slate-950">Attach a document</span>
                <span className="mt-1 max-w-xl text-xs font-bold text-slate-500">Contracts, policies, bills, letters, school dates, warranties or screenshots.</span>
                <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                  <Paperclip className="h-3.5 w-3.5" /> {selectedFileName || "Choose PDF, image or text file"}
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Give me context</span>
                <textarea
                  value={userNote}
                  onChange={(event) => setUserNote(event.target.value)}
                  rows={8}
                  placeholder="e.g. Beth's car insurance renewal, paid monthly, likely due in September. If this is a bill, add it to spending or connect it to the existing bill."
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Type, optional</span>
              <select
                value={documentHint}
                onChange={(event) => setDocumentHint(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2"
              >
                <option value="">Auto-detect</option>
                <option value="car_insurance">Car insurance</option>
                <option value="home_insurance">Home insurance</option>
                <option value="life_insurance">Life insurance</option>
                <option value="car_finance">Car finance / PCP</option>
                <option value="vehicle_contract">Vehicle lease / purchase research</option>
                <option value="mortgage_offer">Mortgage offer</option>
                <option value="savings_terms">Savings terms</option>
                <option value="broadband_contract">Broadband</option>
                <option value="mobile_contract">Mobile phone</option>
                <option value="utility_contract">Utilities</option>
                <option value="council_tax_bill">Council tax</option>
                <option value="bill_statement">Bill / statement</option>
                <option value="tenancy_agreement">Tenancy</option>
                <option value="warranty">Warranty / care plan</option>
                <option value="school_nursery_contract">School / nursery contract</option>
                <option value="school_calendar">School calendar / term dates</option>
                <option value="school_agenda">School agenda / notice</option>
                <option value="appointment_letter">Appointment letter</option>
                <option value="vehicle_service">Vehicle service / MOT</option>
              </select>
            </label>
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900 ring-1 ring-emerald-100">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>LoopWatch keeps structured facts and review choices, not bulky source files. Bills can be linked to Financial Flow after you accept the review.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Owner / household</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Who should this be attached to?</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {hasHousehold ? "Let LoopWatch auto-detect, or click a household image before sending." : "This will be saved to your private LoopWatch area."}
            </p>
          </div>

          <OwnerPicker people={people} ownerPersonId={ownerPersonId} setOwnerPersonId={setOwnerPersonId} />

          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="flex items-start gap-2 text-sm font-bold text-slate-600"><FileText className="mt-0.5 h-4 w-4" /> Review box appears before LoopWatch treats the item as confirmed.</div>
            <div className="flex items-start gap-2 text-sm font-bold text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4" /> Accept or overwrite details in the card below, including allocating a bill to existing spending.</div>
          </div>

          {message ? (
            <div className={`rounded-2xl p-4 text-sm font-bold ${status === "error" ? "bg-red-50 text-red-700 ring-1 ring-red-100" : status === "done" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" : status === "context" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100" : "bg-blue-50 text-blue-800 ring-1 ring-blue-100"}`}>
              <div className="flex items-start gap-2">
                {status === "processing" ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <FileText className="mt-0.5 h-4 w-4" />}
                <span>{message}</span>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={status === "processing"}
            className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-xl shadow-slate-950/15 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "processing" ? "Processing with LoopWatch..." : "Send to LoopWatch"}
          </button>
        </div>
      </form>
    </>
  );
}
