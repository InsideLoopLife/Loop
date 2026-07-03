const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^::1$/,
];

export function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function safeExternalUrl(value: unknown, maxLength = 1200) {
  const text = cleanText(value, maxLength);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return null;
    return url.toString().slice(0, maxLength);
  } catch {
    return null;
  }
}

export function compactJson<T>(value: T, maxBytes = 60_000): T | Record<string, unknown> {
  try {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).byteLength <= maxBytes) return value;
  } catch {
    return { omitted: true, reason: "not_json_serialisable" };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30) as T;
  }

  if (value && typeof value === "object") {
    const compact: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "string") compact[key] = cleanText(item, 1000);
      else if (typeof item === "number" || typeof item === "boolean" || item === null) compact[key] = item;
      else if (Array.isArray(item)) compact[key] = item.slice(0, 20);
    }
    return compact;
  }

  return { omitted: true, reason: "too_large" };
}
