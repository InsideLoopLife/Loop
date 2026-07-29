"use client";

import { useEffect, useMemo, useState } from "react";
import { proxiedImageSrc } from "@/lib/images";

type LiveAvatarProps = {
  initialUrl?: string | null;
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

export function LiveAvatar({ initialUrl, name, className = "h-16 w-16 rounded-3xl", fallbackClassName = "bg-white/10 text-white", imgClassName }: LiveAvatarProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [failed, setFailed] = useState(false);
  const safeUrl = useMemo(() => proxiedImageSrc(url), [url]);
  const base = `${className} grid shrink-0 place-items-center overflow-hidden font-black shadow-sm`;

  useEffect(() => {
    const listener = (event: Event) => {
      const avatarUrl = (event as CustomEvent<{ avatarUrl?: string }>).detail?.avatarUrl;
      if (avatarUrl) {
        setUrl(avatarUrl);
        setFailed(false);
      }
    };
    window.addEventListener("loop:avatar-updated", listener as EventListener);
    return () => window.removeEventListener("loop:avatar-updated", listener as EventListener);
  }, []);

  if (!safeUrl || failed) {
    return <span className={`${base} ${fallbackClassName}`}>{initials(name)}</span>;
  }

  return <img src={safeUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${className} shrink-0 object-cover shadow-sm ${imgClassName || ""}`} />;
}
