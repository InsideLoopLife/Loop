"use client";

import { FormEvent, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

export function HelpAskClient() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not answer that yet.");
      setAnswer(payload.answer || "I could not find a clear answer yet.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not answer that yet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 rounded-3xl bg-white p-2">
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
        <input value={question} onChange={(event) => setQuestion(event.target.value)} className="w-full rounded-2xl border-0 px-4 py-3 text-sm font-semibold text-slate-950 outline-none" placeholder="Ask: how do I import a menu, accept a household request, or understand processed load?" />
        <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ask</button>
      </form>
      {answer ? <div className="mt-3 whitespace-pre-line rounded-2xl bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">{answer}</div> : null}
      {error ? <div className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}
    </div>
  );
}
