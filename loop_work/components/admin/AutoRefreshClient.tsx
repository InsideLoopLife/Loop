"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefreshClient({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), Math.max(10_000, intervalMs));
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);
  return null;
}
