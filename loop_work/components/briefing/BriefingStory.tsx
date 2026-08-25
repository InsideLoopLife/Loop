"use client";

import { useState } from "react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { useLiveBriefing } from "./useLiveBriefing";
import { StoryBeat, useStorySequence } from "./StoryBeat";
import { NetWorthHero } from "./NetWorthHero";
import { CategoryGrid } from "./CategoryGrid";
import { ActionsBeat } from "./ActionsBeat";
import { FlowBeat } from "./FlowBeat";
import { PortfolioBeat } from "./PortfolioBeat";
import { SavingsBeat } from "./SavingsBeat";
import { HomeBeat } from "./HomeBeat";
import { EvidenceBeat } from "./EvidenceBeat";
import { RouteBootSnapshotPublisher } from "@/components/performance/RouteBootSnapshotPublisher";

// Beat count drives the reveal sequence — keep in sync with the number of
// <StoryBeat> wrappers rendered below. Adding a new beat: bump this, add a
// StoryBeat with the next index.
const BEAT_COUNT = 5;

export function BriefingStory({ initial }: { initial: FinancialBriefing }) {
  const { briefing, status, lastUpdated } = useLiveBriefing(initial);
  const { isOpen, done, skip } = useStorySequence(BEAT_COUNT, 500);
  const [period, setPeriod] = useState<BriefingPeriod>("week");

  return (
    <div className="space-y-6">
      <RouteBootSnapshotPublisher
        routeKey="briefing"
        payload={{
          version: 1,
          eyebrow: "Your LOOP",
          title: `Welcome back, ${briefing.firstName}`,
          headline: new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            maximumFractionDigits: 0,
          }).format(briefing.currentNetWorth),
          description: "Your last complete briefing is ready while LOOP checks what changed.",
          tone: "violet",
          metrics: [
            {
              label: "Assets",
              value: new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
                maximumFractionDigits: 0,
              }).format(briefing.assets),
            },
            {
              label: "Liabilities",
              value: new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
                maximumFractionDigits: 0,
              }).format(briefing.liabilities),
            },
            {
              label: "Available",
              value: new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
                maximumFractionDigits: 0,
              }).format(briefing.flow.unassigned),
            },
            {
              label: "Savings",
              value: new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
                maximumFractionDigits: 0,
              }).format(briefing.savings.balance),
            },
          ],
        }}
      />
      <StoryBeat open={isOpen(0)}>
        <NetWorthHero briefing={briefing} narrativeActive={isOpen(0)} isLive={status === "live"} period={period} onPeriodChange={setPeriod} />
      </StoryBeat>

      <StoryBeat open={isOpen(1)}>
        <CategoryGrid briefing={briefing} period={period} />
      </StoryBeat>

      <StoryBeat open={isOpen(2)}>
        <ActionsBeat actions={briefing.actions} />
      </StoryBeat>

      <StoryBeat open={isOpen(3)} className="grid gap-5 xl:grid-cols-2">
        <FlowBeat flow={briefing.flow} />
        <PortfolioBeat investments={briefing.investments} series={briefing.series} period={period} />
      </StoryBeat>

      <StoryBeat open={isOpen(4)} className="grid gap-5 lg:grid-cols-3">
        <SavingsBeat savings={briefing.savings} />
        <HomeBeat home={briefing.home} />
        <EvidenceBeat dataQuality={briefing.dataQuality} generatedAt={briefing.generatedAt} />
      </StoryBeat>

      <div className="flex items-center justify-between pb-6 pt-1 text-xs font-semibold text-slate-400">
        <span>Last updated {lastUpdated.toLocaleTimeString("en-GB")}{status === "error" ? " · Live refresh paused" : ""}</span>
        {!done && (
          <button type="button" onClick={skip} className="rounded-full border border-slate-200 px-3 py-1 font-black uppercase tracking-wide text-slate-500 hover:bg-slate-50">
            Skip →
          </button>
        )}
      </div>
    </div>
  );
}
