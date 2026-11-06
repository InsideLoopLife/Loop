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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><PersistentLoopShell>{children}</PersistentLoopShell><PageTour /><RouteFreshnessManager /><RouteBootAutoPublisher /></body>
    </html>
  );
}
