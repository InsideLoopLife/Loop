import { SubmissionTray } from "@/components/feedback/SubmissionTray";
import { LoopDatePicker } from "@/components/ui/LoopDatePicker";
import type { Metadata } from "next";
// Onest is bundled and served from our own domain; the site's security
// policy blocks Google's font stylesheet, so a <link> to it never loaded.
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
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
      <body><PersistentLoopShell>{children}</PersistentLoopShell><PageTour /><RouteFreshnessManager /><RouteBootAutoPublisher /><SubmissionTray /><LoopDatePicker /></body>
    </html>
  );
}
