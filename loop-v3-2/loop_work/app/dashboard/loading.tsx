import { Suspense } from "react";
import { DashboardCachedRouteFallback } from "@/components/loading/DashboardCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="dashboard" />}><InstantBootSnapshot routeKey="dashboard" fallbackLabel="dashboard" /></Suspense>; }
export default function Loading() { return <DashboardCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
