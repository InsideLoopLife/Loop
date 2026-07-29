"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { proxiedImageSrc } from "@/lib/images";

export function AjaxProfileImageInput({
  initialUrl,
  label = "Profile image",
  maxBytes = 5_000_000,
  hiddenName = "existing_avatar_url",
  fileName = "profile_image",
  className = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-white",
}: {
  initialUrl?: string | null;
  label?: string;
  maxBytes?: number;
  hiddenName?: string;
  fileName?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialUrl || "");
  const [previewUrl, setPreviewUrl] = useState(initialUrl || "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const safePreview = useMemo(() => proxiedImageSrc(previewUrl), [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function upload(file: File) {
    const formData = new FormData();
    formData.set("profile_image", file);
    setBusy(true);
    setMessage("Uploading image…");
    try {
      const response = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image upload failed");
      const nextUrl = String(data.avatar_url || "");
      setAvatarUrl(nextUrl);
      setPreviewUrl(nextUrl || previewUrl);
      setMessage("Image saved. The profile preview updates immediately; no page refresh needed.");
      inputRef.current && (inputRef.current.value = "");
      window.dispatchEvent(new CustomEvent("loop:avatar-updated", { detail: { avatarUrl: nextUrl } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input type="hidden" name={hiddenName} value={avatarUrl} />
      <div className="mt-1 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-xs font-black text-slate-400">
          {safePreview ? <img src={safePreview} alt="" className="h-full w-full object-cover" /> : "IMG"}
        </span>
        <input
          ref={inputRef}
          name={fileName}
          type="file"
          accept="image/*"
          disabled={busy}
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
            const localPreview = URL.createObjectURL(file);
            setPreviewUrl(localPreview);
            void upload(file);
          }}
        />
      </div>
      {message ? (
        <span className={`mt-2 block text-xs font-bold ${message.includes("failed") || message.startsWith("File too large") || message.startsWith("Please") ? "text-red-600" : "text-slate-500"}`}>{message}</span>
      ) : (
        <span className="mt-2 block text-xs font-bold text-slate-400">Choose an image and it saves immediately. The main form still saves the rest of your profile.</span>
      )}
    </label>
  );
}
