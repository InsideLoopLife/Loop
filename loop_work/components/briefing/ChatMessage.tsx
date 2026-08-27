"use client";

import { Sparkles } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import type { BriefingCardKey } from "@/lib/briefing/chat-cards";
import type { BriefingLineChart } from "@/lib/briefing/projections";
import { ChatCardRenderer } from "./ChatCardRenderer";
import { LineChartCard } from "./LineChartCard";
import { TypedText } from "./TypedText";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card?: BriefingCardKey | null;
  chart?: BriefingLineChart | null;
  typed?: boolean;
};

export function ChatMessage({ message, briefing, period }: { message: ChatMessageData; briefing: FinancialBriefing; period: BriefingPeriod }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-600">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold leading-6 text-slate-700 shadow-sm">
            {message.typed ? <TypedText text={message.content} active speedMs={10} /> : message.content}
          </div>
        </div>
        {message.chart ? (
          <div className="ml-9">
            <LineChartCard chart={message.chart} />
          </div>
        ) : message.card ? (
          <div className="ml-9">
            <ChatCardRenderer card={message.card} briefing={briefing} period={period} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
