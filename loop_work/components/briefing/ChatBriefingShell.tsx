"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { useLiveBriefing } from "./useLiveBriefing";
import { PeriodToggle } from "./PeriodToggle";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import { UsageMeter, type ChatBudget } from "./UsageMeter";
import { isBriefingCardKey, type BriefingCardKey } from "@/lib/briefing/chat-cards";

function id() {
  return Math.random().toString(36).slice(2);
}

export function ChatBriefingShell({ initial }: { initial: FinancialBriefing }) {
  const { briefing, status } = useLiveBriefing(initial);
  const [period, setPeriod] = useState<BriefingPeriod>("week");
  const [messages, setMessages] = useState<ChatMessageData[]>(() => [
    {
      id: id(),
      role: "assistant",
      content: initial.narrative.join(" "),
      card: "net_worth",
      typed: true,
    },
  ]);
  const [sending, setSending] = useState(false);
  const [budgetNote, setBudgetNote] = useState<string | null>(null);
  const [budget, setBudget] = useState<ChatBudget>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    fetch("/api/briefing/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.budget && setBudget(data.budget))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/briefing/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const stored = Array.isArray(data?.messages) ? data.messages : [];
        if (!stored.length) return;
        const restored: ChatMessageData[] = stored
          .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m: any) => ({ id: id(), role: m.role, content: m.content, card: isBriefingCardKey(m.card) ? m.card : null, typed: false }));
        // Keep the live opener bubble, then continue with today's real history —
        // this is what lets a link the assistant gave earlier stay usable: the
        // conversation is still here after navigating back.
        setMessages((prev) => [prev[0], ...restored]);
      })
      .catch(() => {});
    // Only ever run once on mount — this hydrates from the day's saved
    // session, it shouldn't re-run as local state changes afterwards.
  }, []);

  async function handleSend(text: string) {
    const userMessage: ChatMessageData = { id: id(), role: "user", content: text };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    setBudgetNote(null);
    try {
      const res = await fetch("/api/briefing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { id: id(), role: "assistant", content: data?.error || "Something went wrong — try again.", card: null, typed: true }]);
        return;
      }
      const card: BriefingCardKey | null = data.card ?? null;
      setMessages((prev) => [...prev, { id: id(), role: "assistant", content: data.reply, card, typed: true }]);
      if (data.note) setBudgetNote(data.note);
      if (data.budget) setBudget(data.budget);
    } catch {
      setMessages((prev) => [...prev, { id: id(), role: "assistant", content: "I couldn't reach LOOP just then — try again in a moment.", card: null, typed: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-indigo-500">
            Your LOOP
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">
              <Radio className={`h-3 w-3 ${status === "live" ? "animate-pulse" : ""}`} /> {status === "live" ? "Live" : "Refreshing…"}
            </span>
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Welcome back, {briefing.firstName}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <UsageMeter budget={budget} />
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
      </header>

      <div className="flex-1 space-y-5 pb-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} briefing={briefing} period={period} />
        ))}
        {sending && (
          <div className="flex items-center gap-2.5 pl-9 text-sm font-semibold text-slate-400">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
            </span>
            LOOP is thinking…
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <ChatComposer onSend={handleSend} disabled={sending} hint={budgetNote} />
    </div>
  );
}
