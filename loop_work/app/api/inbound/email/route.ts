import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, describeSupabaseAdminKey, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { authResultsPass, bodyToPlainText, getProviderMessageId, hasAttachmentSignal, inboundFromEmail, inboundRecipientEmail, normaliseEmail, parseInboundContent, postmarkAuthResults, recipientParts } from "@/lib/inbound/parse";

export const runtime = "nodejs";

const INBOUND_DOMAIN = (process.env.INBOUND_EMAIL_DOMAIN || "inbox.insideloop.life").toLowerCase();
const MAX_CONTENT_LENGTH = Number(process.env.INBOUND_EMAIL_MAX_BYTES || 128_000);
const MAX_PER_ALIAS_HOUR = Number(process.env.INBOUND_EMAIL_MAX_PER_ALIAS_HOUR || 30);
const MAX_PER_SENDER_HOUR = Number(process.env.INBOUND_EMAIL_MAX_PER_SENDER_HOUR || 60);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function constantTimeEquals(a: string, b: string) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function secretOk(req: NextRequest) {
  const expected = process.env.INBOUND_EMAIL_WEBHOOK_SECRET || "";
  if (!expected || expected.length < 24) return false;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const loopHeader = req.headers.get("x-loop-inbound-secret") || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || req.nextUrl.searchParams.get("token") || "";

  const basicUser = process.env.INBOUND_EMAIL_BASIC_USER || "loop";
  const basicPassword = process.env.INBOUND_EMAIL_BASIC_PASSWORD || expected;
  const auth = req.headers.get("authorization") || "";
  let basicOk = false;
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const [user, ...passwordParts] = decoded.split(":");
      const password = passwordParts.join(":");
      basicOk = constantTimeEquals(user, basicUser) && constantTimeEquals(password, basicPassword);
    } catch {
      basicOk = false;
    }
  }

  return basicOk || constantTimeEquals(loopHeader, expected) || constantTimeEquals(bearer, expected) || constantTimeEquals(querySecret, expected);
}

function contentLengthOk(req: NextRequest) {
  const raw = req.headers.get("content-length");
  if (!raw) return true;
  const length = Number(raw);
  return Number.isFinite(length) && length <= MAX_CONTENT_LENGTH;
}

async function readPayload(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("application/json")) return await req.json();
  const form = await req.formData();
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, typeof value === "string" ? value : value.name]));
}

async function logReject(base: Record<string, unknown>, reason: string, userId?: string | null) {
  try {
    const supabase = createAdminClient();
    await supabase.from("loop_inbound_email_events").insert({ ...base, user_id: userId || null, status: "rejected", reject_reason: reason });
  } catch {
    // Never expose logging failures to inbound providers.
  }
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) return json(401, { ok: false, error: "unauthorised" });
  if (!contentLengthOk(req)) return json(413, { ok: false, error: "payload_too_large" });
  if (!hasSupabaseAdminKey()) {
    const status = describeSupabaseAdminKey();
    return json(500, { ok: false, error: "supabase_admin_key_unavailable", detail: status.reason });
  }

  const payload = await readPayload(req).catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") return json(400, { ok: false, error: "invalid_payload" });

  const fromEmail = inboundFromEmail(payload);
  const toEmailRaw = inboundRecipientEmail(payload);
  const { email: toEmail, alias, domain } = recipientParts(toEmailRaw);
  const subject = String(payload.Subject || payload.subject || "").slice(0, 300);
  const text = bodyToPlainText(payload);
  const provider = String(payload.provider || req.headers.get("x-provider") || (payload.MessageID ? "postmark" : "generic")).slice(0, 50);
  const providerMessageId = getProviderMessageId(payload);
  const authHeaders = postmarkAuthResults(payload);

  const eventBase = { provider, provider_message_id: providerMessageId, alias, domain, from_email: fromEmail, to_email: toEmail };
  const supabase = createAdminClient();

  if (!alias || !domain || domain !== INBOUND_DOMAIN) {
    await logReject(eventBase, "invalid_recipient_domain");
    return json(202, { ok: false, status: "rejected", reason: "invalid_recipient_domain" });
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(alias)) {
    await logReject(eventBase, "invalid_alias_format");
    return json(202, { ok: false, status: "rejected", reason: "invalid_alias_format" });
  }
  if (hasAttachmentSignal(payload)) {
    await logReject(eventBase, "attachments_not_allowed");
    return json(202, { ok: false, status: "rejected", reason: "attachments_not_allowed" });
  }
  if (!authResultsPass(payload)) {
    await logReject(eventBase, "email_authentication_failed");
    return json(202, { ok: false, status: "rejected", reason: "email_authentication_failed" });
  }

  if (providerMessageId) {
    const { data: existing } = await supabase
      .from("loop_inbound_email_events")
      .select("id,status")
      .eq("provider_message_id", providerMessageId)
      .eq("alias", alias)
      .eq("domain", domain)
      .maybeSingle();
    if (existing?.id) return json(202, { ok: true, status: "duplicate", existing_status: existing.status });
  }

  const { data: aliasRow } = await supabase
    .from("loop_inbound_aliases")
    .select("id,user_id,alias,domain,status,allowed_sender_email")
    .eq("alias", alias)
    .eq("domain", domain)
    .maybeSingle();

  if (!aliasRow || aliasRow.status !== "active") {
    await logReject(eventBase, "alias_not_found_or_inactive");
    return json(202, { ok: false, status: "rejected", reason: "alias_not_found_or_inactive" });
  }

  const allowedSender = normaliseEmail(aliasRow.allowed_sender_email);
  if (!fromEmail || fromEmail !== allowedSender) {
    await logReject(eventBase, "sender_not_verified", aliasRow.user_id);
    return json(202, { ok: false, status: "rejected", reason: "sender_not_verified" });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count: aliasCount }, { count: senderCount }] = await Promise.all([
    supabase.from("loop_inbound_email_events").select("id", { count: "exact", head: true }).eq("alias", alias).eq("domain", domain).gte("created_at", since),
    supabase.from("loop_inbound_email_events").select("id", { count: "exact", head: true }).eq("from_email", fromEmail).gte("created_at", since),
  ]);
  if ((aliasCount || 0) >= MAX_PER_ALIAS_HOUR || (senderCount || 0) >= MAX_PER_SENDER_HOUR) {
    await logReject(eventBase, "rate_limited", aliasRow.user_id);
    return json(202, { ok: false, status: "rejected", reason: "rate_limited" });
  }

  const { data: entitled } = await supabase.rpc("loop_user_has_inbound_email_entitlement", { p_user_id: aliasRow.user_id });
  if (!entitled) {
    await logReject(eventBase, "premium_required", aliasRow.user_id);
    return json(202, { ok: false, status: "rejected", reason: "premium_required" });
  }

  const items = parseInboundContent({ subject, text });
  const safeItems = items.filter((item) => item.kind !== "unknown" && item.flags.length === 0);
  const blockedItems = items.filter((item) => item.kind === "unknown" || item.flags.length > 0);

  const { data: event, error: eventError } = await supabase
    .from("loop_inbound_email_events")
    .insert({
      ...eventBase,
      user_id: aliasRow.user_id,
      status: safeItems.length ? "accepted" : "rejected",
      reject_reason: safeItems.length ? null : "no_supported_content",
      extracted_json: { subject, item_count: items.length, blocked_count: blockedItems.length },
      raw_headers_json: { content_type: req.headers.get("content-type"), user_agent: req.headers.get("user-agent"), auth: authHeaders },
    })
    .select("id")
    .single();

  if (eventError) return json(500, { ok: false, error: eventError.message });

  if (safeItems.length) {
    const { error } = await supabase.from("loop_inbound_imports").insert(safeItems.map((item) => ({
      user_id: aliasRow.user_id,
      inbound_event_id: event.id,
      import_kind: item.kind,
      source_value: item.value,
      status: "needs_review",
      title: item.title,
      parsed_json: item.meta,
      security_flags: item.flags,
    })));
    if (error) return json(500, { ok: false, error: error.message });
    await supabase.from("loop_inbound_aliases").update({ last_received_at: new Date().toISOString() }).eq("id", aliasRow.id);
  }

  return json(202, { ok: true, accepted: safeItems.length, blocked: blockedItems.length });
}
