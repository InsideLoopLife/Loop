"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminCommandSearch } from "@/components/admin/AdminCommandSearch";
import { isSectionActive, visibleAdminSections } from "@/lib/navigation/sections";

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Admin areas</p>
          <p className="mt-1 text-sm font-bold text-slate-600">
            Pick the job you want to do. Technical controls stay inside each area.
          </p>
        </div>
        <div className="xl:min-w-[360px]">
          <AdminCommandSearch sections={visibleAdminSections} />
        </div>
      </div>

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Admin sections">
        {visibleAdminSections.map((section) => {
          const active = isSectionActive(pathname, section);
          return (
            <Link
              key={section.key}
              href={section.href}
              className={[
                "group rounded-2xl border p-4 transition",
                active
                  ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                  : "border-slate-200 bg-white text-slate-950 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{section.label}</p>
                  <p className={active ? "mt-1 text-xs font-bold leading-5 text-white/65" : "mt-1 text-xs font-bold leading-5 text-slate-500"}>
                    {section.description}
                  </p>
                </div>
                <span className={active ? "mt-0.5 text-white" : "mt-0.5 text-slate-300 transition group-hover:text-slate-500"}>→</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
