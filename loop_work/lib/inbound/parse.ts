export type InboundParsedItem = {
  kind: "property_url" | "investment_ticker" | "unknown";
  value: string;
  title?: string;
  flags: string[];
  meta: Record<string, unknown>;
};

const PROPERTY_HOSTS = [
  "rightmove.co.uk",
  "zoopla.co.uk",
  "onthemarket.com",
  "primelocation.com",
];

const RESERVED_TOKENS = new Set(["HTTP", "HTTPS", "WWW", "RIGHTMOVE", "ZOOPLA", "THE", "AND", "FOR", "LOOP", "FROM", "TO", "RE", "FWD", "FW", "SUBJECT", "PROPERTY", "HOUSE", "URL", "EMAIL", "INBOX"]);
const BLOCKED_SCHEMES = /^(javascript|data|file|ftp):/i;
const EXPLICIT_TICKER_RE = /(?:^|[\s,;])(?:\$|TICKER[:\s]+|STOCK[:\s]+|BUY[:\s]+|WATCH[:\s]+)?([A-Z]{1,6}(?:\.[A-Z]{1,3})?|[A-Z]{2,12}:[A-Z]{1,8}|[A-Z]{2}[A-Z0-9]{9}[0-9])(?=$|[\s,;.!?])/g;
const ONLY_TICKERS_LINE_RE = /^[\s,$A-Z0-9.:-]+$/;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

type MaybePostmarkAddress = { Email?: string; Name?: string; MailboxHash?: string };

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normaliseEmail(value?: unknown) {
  if (value && typeof value === "object" && "Email" in (value as Record<string, unknown>)) {
    return normaliseEmail((value as MaybePostmarkAddress).Email);
  }
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).replace(/^mailto:/, "").trim();
}

export function inboundFromEmail(payload: Record<string, unknown>) {
  const fromFull = payload.FromFull as MaybePostmarkAddress | undefined;
  return normaliseEmail(fromFull?.Email || payload.from || payload.sender || payload.From || payload["From"]);
}

export function inboundRecipientEmail(payload: Record<string, unknown>) {
  const recipients = payload.ToFull;
  if (Array.isArray(recipients) && recipients.length) {
    const first = recipients[0] as MaybePostmarkAddress;
    if (first?.Email) return normaliseEmail(first.Email);
  }
  return normaliseEmail(payload.OriginalRecipient || payload.original_recipient || payload.to || payload.recipient || payload.To || payload.envelope_to);
}

export function recipientParts(toEmail?: unknown) {
  const email = normaliseEmail(toEmail);
  const [local = "", domain = ""] = email.split("@");
  return { email, alias: local.toLowerCase(), domain: domain.toLowerCase() };
}

export function bodyToPlainText(payload: Record<string, unknown>) {
  const text = firstString(payload.TextBody, payload.text, payload["body-plain"], payload.plain, payload["stripped-text"]);
  if (text.trim()) return text.slice(0, 20_000);
  const html = firstString(payload.HtmlBody, payload.html, payload["body-html"], payload["stripped-html"]);
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

export function getProviderMessageId(payload: Record<string, unknown>) {
  return firstString(payload.MessageID, payload.MessageId, payload["Message-Id"], payload.message_id, payload["message-id"], payload["Message-ID"]).slice(0, 300) || null;
}

export function postmarkAuthResults(payload: Record<string, unknown>) {
  const headers = Array.isArray(payload.Headers) ? payload.Headers : [];
  const findHeader = (name: string) => {
    const hit = headers.find((header: any) => String(header?.Name || "").toLowerCase() === name.toLowerCase());
    return String((hit as any)?.Value || "");
  };
  return {
    authenticationResults: findHeader("Authentication-Results").slice(0, 1000),
    receivedSpf: findHeader("Received-SPF").slice(0, 1000),
  };
}

export function authResultsPass(payload: Record<string, unknown>) {
  const { authenticationResults, receivedSpf } = postmarkAuthResults(payload);
  const joined = `${authenticationResults}\n${receivedSpf}`.toLowerCase();
  // Some providers omit these headers in test webhooks. If present, fail closed on explicit failures.
  if (/spf=(fail|softfail|permerror)|dkim=(fail|permerror)|dmarc=(fail|permerror)/i.test(joined)) return false;
  return true;
}

function safeUrl(raw: string) {
  const cleaned = raw.replace(/[)\].,;!?]+$/g, "").trim();
  if (BLOCKED_SCHEMES.test(cleaned)) return null;
  try {
    const url = new URL(cleaned);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isPropertyHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return PROPERTY_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function normaliseTicker(raw: string) {
  return String(raw || "").toUpperCase().replace(/^[$\s]+|[^A-Z0-9.:-]+$/g, "").trim();
}

function shouldAcceptTicker(value: string, line: string) {
  if (!value || value.length < 2 || RESERVED_TOKENS.has(value)) return false;
  if (ISIN_RE.test(value)) return true;
  if (value.includes(":")) return true;
  if (/\.[A-Z]{1,3}$/.test(value)) return true;
  if (/^\$[A-Z]/.test(line.trim())) return true;
  if (/\b(TICKER|STOCK|BUY|WATCH)\b[:\s]/i.test(line)) return true;
  return ONLY_TICKERS_LINE_RE.test(line) && line.replace(/[\s,$.;:-]/g, "").length <= 60;
}

function stripUrls(value: string) {
  return value.replace(/https?:\/\/[^\s<>'"]+/gi, " ");
}

export function parseInboundContent(input: { subject?: string | null; text?: string | null }) {
  const content = `${input.subject || ""}\n${input.text || ""}`.slice(0, 20_000);
  const items: InboundParsedItem[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/https?:\/\/[^\s<>'"]+/gi)) {
    const url = safeUrl(match[0]);
    if (!url) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const flags: string[] = [];
    const property = isPropertyHost(url.hostname);
    if (!property) flags.push("url_domain_not_allowlisted");
    items.push({
      kind: property ? "property_url" : "unknown",
      value: key,
      title: property ? `Property link from ${url.hostname.replace(/^www\./, "")}` : `Unsupported URL from ${url.hostname}`,
      flags,
      meta: { hostname: url.hostname, pathname: url.pathname },
    });
  }

  for (const rawLine of stripUrls(content).split(/\r?\n/).slice(0, 80)) {
    const line = rawLine.trim().toUpperCase();
    if (!line) continue;
    for (const match of line.matchAll(EXPLICIT_TICKER_RE)) {
      const value = normaliseTicker(match[1] || "");
      if (!shouldAcceptTicker(value, line)) continue;
      const key = `ticker:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        kind: "investment_ticker",
        value,
        title: `Investment ticker ${value}`,
        flags: [],
        meta: { raw: value, source_line: line.slice(0, 200) },
      });
    }
  }

  return items.slice(0, 10);
}

export function hasAttachmentSignal(payload: Record<string, unknown>) {
  const postmarkAttachments = Array.isArray(payload.Attachments) ? payload.Attachments.length : 0;
  const count = Number(payload["attachment-count"] || payload.attachment_count || postmarkAttachments || 0) || 0;
  if (count > 0) return true;
  return Object.keys(payload).some((key) => /^attachment/i.test(key) || /^attachments\[/i.test(key));
}
