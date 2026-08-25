import { Suspense } from "react";
import { InvestmentsCachedRouteFallback } from "@/components/loading/InvestmentsCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="investments and pensions" />}><InstantBootSnapshot routeKey="investments" fallbackLabel="investments and pensions" /></Suspense>; }
export default function Loading() { return <InvestmentsCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
