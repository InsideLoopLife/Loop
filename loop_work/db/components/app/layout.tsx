import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Tracker",
  description: "Private dashboard for income, spending, mortgage and net worth tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
