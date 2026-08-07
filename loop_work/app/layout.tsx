import type { Metadata } from "next";
import "./globals.css";
import { PageTour } from "@/components/PageTour";

export const metadata: Metadata = {
  title: "LOOP — Health, Wealth & Life, Connected",
  description: "One private view of your wealth, health, home and household.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<PageTour /></body>
    </html>
  );
}
