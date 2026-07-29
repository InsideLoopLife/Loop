"use client";

import { SectionTabs } from "@/components/navigation/SectionTabs";
import { adminSections, visibleAdminSections } from "@/lib/navigation/sections";
import { AdminCommandSearch } from "@/components/admin/AdminCommandSearch";

export function AdminTabs() {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <SectionTabs sections={visibleAdminSections} tone="slate" className="-mt-2 flex-1" />
      <AdminCommandSearch sections={adminSections} />
    </div>
  );
}

