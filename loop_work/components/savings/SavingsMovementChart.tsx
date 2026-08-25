"use client";

import { SavingsMovementSvg } from "@/components/charts/StableSavingsCharts";

export type SavingsMovementPoint = {
  month: string;
  saved: number;
  interest: number;
  withdrawn: number;
};

export function SavingsMovementChart({ data }: { data: SavingsMovementPoint[] }) {
  return <SavingsMovementSvg data={data} />;
}
