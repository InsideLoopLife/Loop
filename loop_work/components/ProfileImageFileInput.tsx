"use client";

import { useRef, useState } from "react";

export function ProfileImageFileInput({
  name,
  label = "Profile image",
  maxBytes = 5_000_000,
  className = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white",
}: {
  name: string;
  label?: string;
  maxBytes?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/*"
        className={className}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) {
            setMessage(null);
            return;
          }
          if (!file.type.startsWith("image/")) {
            event.currentTarget.value = "";
            setMessage("Please choose an image file.");
            return;
          }
          if (file.size > maxBytes) {
            event.currentTarget.value = "";
            const mb = Math.round((maxBytes / 1_000_000) * 10) / 10;
            setMessage(`File too large. Please crop or reduce it to under ${mb}MB before uploading.`);
            return;
          }
          setMessage(`${file.name} selected.`);
        }}
      />
      {message ? (
        <span className={`mt-2 block text-xs font-bold ${message.startsWith("File too large") || message.startsWith("Please") ? "text-red-600" : "text-slate-500"}`}>{message}</span>
      ) : (
        <span className="mt-2 block text-xs font-bold text-slate-400">Images are checked before upload so large files do not submit.</span>
      )}
    </label>
  );
}
