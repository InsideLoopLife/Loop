import { Suspense } from "react";
import { RetirementCachedRouteFallback } from "@/components/loading/RetirementCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="retirement planning" />}><InstantBootSnapshot routeKey="retirement" fallbackLabel="retirement planning" /></Suspense>; }
export default function Loading() { return <RetirementCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
