import { Suspense } from "react";
import { NetWorthCachedRouteFallback } from "@/components/loading/NetWorthCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="net worth" />}><InstantBootSnapshot routeKey="net-worth" fallbackLabel="net worth" /></Suspense>; }
export default function Loading() { return <NetWorthCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
