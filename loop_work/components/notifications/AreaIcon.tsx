import { BellRing, Hand, HeartPulse, Home, LineChart, PiggyBank, Receipt, Users, type LucideIcon } from "lucide-react";
import { areaByKey, type AreaKey } from "@/lib/notifications/areas";

const ICONS: Record<AreaKey, LucideIcon> = {
  decisions: Hand,
  money: Receipt,
  home: Home,
  invest: LineChart,
  savings: PiggyBank,
  health: HeartPulse,
  household: Users,
  account: BellRing,
};

export function AreaIcon({ area, size = "md" }: { area: AreaKey; size?: "sm" | "md" }) {
  const Icon = ICONS[area];
  const box = size === "sm" ? "h-8 w-8 rounded-[10px]" : "h-10 w-10 rounded-xl";
  return (
    <span className={`grid flex-none place-items-center ${box} ${areaByKey(area)?.tile ?? ""}`} aria-hidden>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </span>
  );
}
