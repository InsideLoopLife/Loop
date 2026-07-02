import crypto from "crypto";

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function config() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID || process.env.SNAPTRADE_CLIENTID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY || process.env.SNAPTRADE_CONSUMERKEY;
  const baseUrl = (process.env.SNAPTRADE_BASE_URL || "https://api.snaptrade.com/api/v1").replace(/\/$/, "");
  if (!clientId || !consumerKey) throw new Error("Missing SnapTrade credentials. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY server-side.");
  return { clientId, consumerKey, baseUrl };
}

function signature(pathWithQuery: string, body: any, consumerKey: string) {
  const [path, query = ""] = pathWithQuery.split("?");
  const payload = {
    content: body && Object.keys(body).length ? body : null,
    path: `/api/v1${path}`,
    query,
  };
  return crypto.createHmac("sha256", consumerKey).update(stableStringify(payload)).digest("base64");
}

export async function snapTradeRequest<T = any>(method: "GET" | "POST" | "DELETE", path: string, body?: any) {
  const { clientId, consumerKey, baseUrl } = config();
  const join = path.includes("?") ? "&" : "?";
  const queryPath = `${path}${join}clientId=${encodeURIComponent(clientId)}&timestamp=${Math.floor(Date.now() / 1000)}`;
  const sig = signature(queryPath, body || null, consumerKey);
  const response = await fetch(`${baseUrl}${queryPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Signature: sig,
    },
    body: method === "GET" || !body ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `SnapTrade request failed (${response.status})`);
  return data as T;
}

export function loopSnapTradeUserId(appUserId: string) {
  return `loop_${appUserId.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 120);
}

export type SnapTradeRegisteredUser = { userId: string; userSecret: string };
export type SnapTradeLoginResponse = { redirectURI: string; sessionId?: string };
