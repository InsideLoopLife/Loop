"use client";

import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import type { BriefingCardKey } from "@/lib/briefing/chat-cards";
import { NetWorthCard } from "./NetWorthCard";
import { CategoryGrid } from "./CategoryGrid";
import { ActionsBeat } from "./ActionsBeat";
import { FlowBeat } from "./FlowBeat";
import { PortfolioBeat } from "./PortfolioBeat";
import { SavingsBeat } from "./SavingsBeat";
import { HomeBeat } from "./HomeBeat";
import { EvidenceBeat } from "./EvidenceBeat";

export function ChatCardRenderer({ card, briefing, period }: { card: BriefingCardKey; briefing: FinancialBriefing; period: BriefingPeriod }) {
  switch (card) {
    case "net_worth":
      return <NetWorthCard briefing={briefing} period={period} />;
    case "category_grid":
      return <CategoryGrid briefing={briefing} period={period} />;
    case "actions":
      return <ActionsBeat actions={briefing.actions} />;
    case "flow":
      return <FlowBeat flow={briefing.flow} />;
    case "portfolio":
      return <PortfolioBeat investments={briefing.investments} series={briefing.series} period={period} />;
    case "savings":
      return <SavingsBeat savings={briefing.savings} />;
    case "home":
      return <HomeBeat home={briefing.home} />;
    case "evidence":
      return <EvidenceBeat dataQuality={briefing.dataQuality} generatedAt={briefing.generatedAt} />;
    default:
      return null;
  }
}
