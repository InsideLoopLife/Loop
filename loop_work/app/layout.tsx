import type { Metadata } from "next";
import "./globals.css";
import { PageTour } from "@/components/PageTour";
import { RouteFreshnessManager } from "@/components/cache/RouteFreshnessManager";
import { RouteBootAutoPublisher } from "@/components/performance/RouteBootAutoPublisher";
import { PersistentLoopShell } from "@/components/shell/PersistentLoopShell";

export const metadata: Metadata = {
  title: "LOOP — Health, Wealth & Life, Connected",
  description: "One private view of your wealth, health, home and household.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><PersistentLoopShell>{children}</PersistentLoopShell><PageTour /><RouteFreshnessManager /><RouteBootAutoPublisher /></body>
    </html>
  );
}
