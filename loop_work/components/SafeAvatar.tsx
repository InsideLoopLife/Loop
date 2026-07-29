"use client";

import { useMemo, useState } from "react";

type SafeAvatarProps = {
  src?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
  imgClassName?: string;
};

function initials(name?: string | null) {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function SafeAvatar({ src, name, className = "h-16 w-16 rounded-3xl", fallbackClassName = "bg-white/10 text-white", imgClassName }: SafeAvatarProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = useMemo(() => String(src || "").trim(), [src]);
  const base = `${className} grid shrink-0 place-items-center overflow-hidden font-black shadow-sm`;

  if (!safeSrc || failed) {
    return <span className={`${base} ${fallbackClassName}`}>{initials(name)}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 object-cover shadow-sm ${imgClassName || ""}`}
    />
  );
}
