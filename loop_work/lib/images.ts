export function proxiedImageSrc(src?: string | null) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("/")) return value;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `/api/image-proxy?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return "";
  }
}
