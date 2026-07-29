import type { Metadata } from "next";
import "./globals.css";
import { PageTour } from "@/components/PageTour";

export const metadata: Metadata = {
  title: "Life Tracker",
  description: "Private dashboard for income, spending, mortgage and net worth tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<PageTour /></body>
    </html>
  );
}
