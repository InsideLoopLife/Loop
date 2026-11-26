"use client";

// "Balance holdings from source": upload screenshots of the holdings list in
// your trading app, check what was read, and bring Loop's quantities and
// average buy prices into line. Nothing is saved until you press Apply.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { addHoldingsFromScreenshot, applyHoldingsBalance } from "@/lib/investments/actions";
import type { BalanceRow } from "@/lib/investments/screenshot-balance";

type ReadResponse = {
  account: { id: string; label: string };
  imagesRead: number;
  rows: BalanceRow[];
  notInScreenshot: Array<{ holdingId: string; name: string; ticker: string | null; units: number }>;
  notes: string[];
};

const money = (value: number) => `${value < 0 ? "-" : ""}£${Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const unitPrice = (value: number) => `£${value >= 10 ? value.toFixed(2) : value >= 1 ? value.toFixed(4) : value.toPrecision(3)}`;
const quantity = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 8 });
const addKey = (row: { name: string; quantity: number }) => `${row.name}|${row.quantity}`;

export function BalanceHoldingsFromSource({ accountId, accountLabel, provider, onDone }: { accountId: string; accountLabel: string; provider?: string | null; onDone: () => void }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReadResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedAdds, setPickedAdds] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  const editable = useMemo(() => (data?.rows || []).filter((row) => row.match && !row.locked && row.averageBuyPrice !== null), [data]);
  const unmatched = useMemo(() => (data?.rows || []).filter((row) => !row.match), [data]);
  const addable = useMemo(() => unmatched.filter((row) => row.addCandidate && row.averageBuyPrice !== null), [unmatched]);
  const locked = useMemo(() => (data?.rows || []).filter((row) => row.match && row.locked), [data]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 4);
    setFiles(next);
    setError(null);
  }

  async function read() {
    if (!files.length || reading) return;
    setReading(true);
    setError(null);
    setData(null);
    try {
      const body = new FormData();
      body.set("account_id", accountId);
      for (const file of files) body.append("images", file);
      const response = await fetch("/api/investments/balance-from-screenshot", { method: "POST", body });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "That screenshot couldn't be read.");
      const result = json as ReadResponse;
      setData(result);
      setPicked(new Set(result.rows.filter((row) => row.match && !row.locked && row.averageBuyPrice !== null && row.confidence === "high").map((row) => row.match!.holdingId)));
      // Only listings whose name and price both agree with the app are pre-ticked.
      setPickedAdds(new Set(result.rows.filter((row) => !row.match && row.averageBuyPrice !== null && row.addCandidate?.mode === "listed" && row.addCandidate.verified).map(addKey)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That screenshot couldn't be read.");
    } finally {
      setReading(false);
    }
  }

  function toggle(holdingId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(holdingId)) next.delete(holdingId);
      else next.add(holdingId);
      return next;
    });
  }

  function toggleAdd(key: string) {
    setPickedAdds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalPicked = picked.size + pickedAdds.size;

  async function apply() {
    if (!data || applying || !totalPicked) return;
    setApplying(true);
    setError(null);
    try {
      const messages: string[] = [];
      if (picked.size) {
        const rows = editable
          .filter((row) => picked.has(row.match!.holdingId))
          .map((row) => ({ holdingId: row.match!.holdingId, units: row.quantity, averageBuyPrice: row.averageBuyPrice! }));
        messages.push((await applyHoldingsBalance({ accountId, rows })).message);
      }
      if (pickedAdds.size) {
        const rows = addable
          .filter((row) => pickedAdds.has(addKey(row)))
          .map((row) => ({
            name: row.addCandidate!.assetName || row.name,
            mode: row.addCandidate!.mode,
            ticker: row.addCandidate!.ticker,
            exchange: row.addCandidate!.exchange,
            assetKind: row.addCandidate!.assetKind,
            units: row.quantity,
            averageBuyPrice: row.averageBuyPrice!,
            latestPrice: row.impliedPrice,
          }));
        const result = await addHoldingsFromScreenshot({ accountId, rows });
        messages.push(result.message);
        if (result.failed.length) messages.push(result.failed.map((item) => `${item.name}: ${item.reason}`).join(" "));
      }
      setDone(messages.join(" "));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't save. Try again.");
    } finally {
      setApplying(false);
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h3 className="mt-3 text-xl font-black text-slate-950">{done}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-500">Quantities and average buy prices in {accountLabel} now match your screenshot. Current prices still come from Loop&apos;s live price source.</p>
        <button type="button" onClick={onDone} className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white">Done</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      {!data ? (
        <>
          <p className="text-sm font-semibold text-slate-600">
            Upload screenshots of your holdings list{provider ? ` in ${provider}` : ""}. Loop reads each holding&apos;s quantity, current value and profit or loss, then works out your average buy price: <span className="font-black text-slate-950">(value − profit/loss) ÷ quantity</span>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs font-semibold text-slate-500">
            <li>Make sure the quantity, value and profit/loss are all visible.</li>
            <li>A long list needs more than one screenshot. Up to 4 at a time.</li>
            <li>You&apos;ll check everything before anything is saved.</li>
          </ul>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-slate-400">
            <Camera className="h-7 w-7 text-slate-500" />
            <span className="text-sm font-black text-slate-800">Choose screenshots</span>
            <span className="text-xs font-semibold text-slate-500">PNG, JPG or WEBP, up to 8MB each</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          </label>
          {files.length ? (
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  <span className="truncate">{file.name}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" disabled={!files.length || reading} onClick={read} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:opacity-40">
            {reading ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : "Read screenshots"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-slate-700">
            Read {data.rows.length} holding{data.rows.length === 1 ? "" : "s"} from {data.imagesRead} screenshot{data.imagesRead === 1 ? "" : "s"}. {editable.length} can be updated in {accountLabel}{addable.length ? ` and ${addable.length} can be added` : ""}.
          </p>
          {data.notes.map((note) => <p key={note} className="text-xs font-semibold text-amber-700">{note}</p>)}

          <div className="space-y-2">
            {editable.map((row) => {
              const id = row.match!.holdingId;
              const checked = picked.has(id);
              return (
                <label key={id} className={`block cursor-pointer rounded-2xl p-3 ring-1 ${checked ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="mt-1 h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-black text-slate-950">{row.match!.name}{row.ticker ? <span className="font-semibold text-slate-500"> · {row.ticker}</span> : null}</p>
                        <p className="shrink-0 text-sm font-black text-slate-950">{money(row.value)}</p>
                      </div>
                      <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                        <div><dt className="inline text-slate-400">Quantity </dt><dd className="inline">{quantity(row.match!.units)} → <strong className="text-slate-900">{quantity(row.quantity)}</strong></dd></div>
                        <div><dt className="inline text-slate-400">Average buy price </dt><dd className="inline">{row.match!.averageBuyPrice ? unitPrice(row.match!.averageBuyPrice) : "none"} → <strong className="text-slate-900">{unitPrice(row.averageBuyPrice!)}</strong></dd></div>
                        <div><dt className="inline text-slate-400">Total cost </dt><dd className="inline">{money(row.cost!)}</dd></div>
                        <div><dt className="inline text-slate-400">Profit/loss </dt><dd className={`inline ${row.pnl < 0 ? "text-red-600" : "text-emerald-700"}`}>{signedMoney(row.pnl)}{row.pnlPercent !== null ? ` (${row.pnlPercent > 0 ? "+" : ""}${row.pnlPercent.toFixed(2)}%)` : ""}</dd></div>
                      </dl>
                      {row.flags.length ? (
                        <ul className="mt-2 space-y-1">
                          {row.flags.map((flag) => <li key={flag} className="flex items-start gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{flag}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {locked.length ? (
            <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
              <p className="font-black text-slate-800">Kept up to date by your connection, so not changed</p>
              <p className="mt-1">{locked.map((row) => row.match!.name).join(" · ")}</p>
            </div>
          ) : null}

          {unmatched.length ? (
            <div className="space-y-2">
              <p className="text-sm font-black text-slate-900">In the screenshot but not in this pot</p>
              {unmatched.map((row) => {
                const key = addKey(row);
                const candidate = row.addCandidate;
                const canAdd = Boolean(candidate) && row.averageBuyPrice !== null;
                const checked = pickedAdds.has(key);
                return (
                  <label key={key} className={`block rounded-2xl p-3 ring-1 ${canAdd ? "cursor-pointer" : ""} ${checked ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" disabled={!canAdd} checked={checked} onChange={() => toggleAdd(key)} className="mt-1 h-4 w-4" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-black text-slate-950">{row.name}{row.ticker ? <span className="font-semibold text-slate-500"> · {row.ticker}</span> : null}</p>
                          <p className="shrink-0 text-sm font-black text-slate-950">{money(row.value)}</p>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {quantity(row.quantity)} units{row.averageBuyPrice !== null ? <> · average buy price <strong className="text-slate-900">{unitPrice(row.averageBuyPrice)}</strong> · total cost {money(row.cost!)}</> : null} · <span className={row.pnl < 0 ? "text-red-600" : "text-emerald-700"}>{signedMoney(row.pnl)}</span>
                        </p>
                        {candidate ? (
                          <p className="mt-1 text-xs font-semibold text-slate-600">
                            {candidate.mode === "listed"
                              ? <>Add as <strong className="text-slate-900">{candidate.assetName}</strong> ({candidate.ticker}{candidate.exchange ? `, ${candidate.exchange}` : ""}){candidate.verified ? " · name and price match the app" : ""}</>
                              : <>Add as a <strong className="text-slate-900">manual holding</strong> (no live price)</>}
                          </p>
                        ) : null}
                        {candidate?.note ? <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{candidate.note}</p> : null}
                        {row.flags.filter((flag) => flag !== "Not in this Loop account yet.").map((flag) => <p key={flag} className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{flag}</p>)}
                        {!canAdd ? <p className="mt-1 text-xs font-semibold text-slate-500">This one can&apos;t be added automatically. Use Add holding.</p> : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : null}

          {data.notInScreenshot.length ? (
            <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
              <p className="font-black text-slate-800">In Loop but not in the screenshot</p>
              <p className="mt-1">{data.notInScreenshot.map((item) => item.name).join(" · ")}</p>
              <p className="mt-1 text-slate-500">If you've sold these, edit or remove them in Loop. They weren't changed.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => { setData(null); setPicked(new Set()); setPickedAdds(new Set()); }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Start again</button>
            <button type="button" disabled={!totalPicked || applying} onClick={apply} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:opacity-40">
              {applying ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : `Apply ${totalPicked} change${totalPicked === 1 ? "" : "s"}${pickedAdds.size ? ` (${pickedAdds.size} new)` : ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
