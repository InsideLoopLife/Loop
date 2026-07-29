"use client";

import { useState } from "react";
import {
  institutionLogoClass,
  institutionLogoText,
  institutionLogoUrl,
} from "@/lib/catalogue/financial-institutions";

export function FinancialInstitutionLogo({
  provider,
  className = "h-14 w-14 rounded-2xl",
}: {
  provider?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const logoUrl = institutionLogoUrl(provider);
  const fallback = institutionLogoText(provider);

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden text-sm font-black shadow-sm ring-1 ring-slate-200/70 ${institutionLogoClass(provider)} ${className}`}
      aria-label={`${provider || "Savings provider"} logo`}
    >
      {!failed && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-[72%] w-[72%] rounded-xl bg-white object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}
