"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function NotificationAutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => {
      setLastRefresh(new Date());
      router.refresh();
    };
    window.addEventListener("loop:notifications-updated", refresh);
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.removeEventListener("loop:notifications-updated", refresh);
      window.clearInterval(timer);
    };
  }, [router, intervalMs]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-900 sm:flex-row sm:items-center sm:justify-between">
      <span>Live notification refresh is on. Import acknowledgements, household approvals and weekly insights will appear without a manual refresh.</span>
      <span className="text-blue-700/70">{lastRefresh ? `Last checked ${lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Checking now"}</span>
    </div>
  );
}
