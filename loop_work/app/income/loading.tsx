import { Suspense } from "react";
import { IncomeCachedRouteFallback } from "@/components/loading/IncomeCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="income" />}><InstantBootSnapshot routeKey="income" fallbackLabel="income" /></Suspense>; }
export default function Loading() { return <IncomeCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
