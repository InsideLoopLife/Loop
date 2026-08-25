import { Suspense } from "react";
import { NutritionCachedRouteFallback } from "@/components/loading/NutritionCachedRouteFallback";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

function ColdSnapshot() { return <Suspense fallback={<WealthRouteSkeleton label="nutrition" />}><InstantBootSnapshot routeKey="nutrition" fallbackLabel="nutrition" /></Suspense>; }
export default function Loading() { return <NutritionCachedRouteFallback coldFallback={<ColdSnapshot />} />; }
