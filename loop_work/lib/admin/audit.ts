import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function writeAdminAuditEvent(input: {
  actionKey: string;
  entityKind?: string | null;
  entityId?: string | null;
  beforePayload?: unknown;
  afterPayload?: unknown;
  severity?: "info" | "warning" | "critical";
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const h = await headers();

  await supabase.from("loop_admin_audit_events").insert({
    actor_user_id: userData.user?.id || null,
    actor_email: userData.user?.email || null,
    action_key: input.actionKey,
    entity_kind: input.entityKind || null,
    entity_id: input.entityId || null,
    before_payload: input.beforePayload || null,
    after_payload: input.afterPayload || null,
    request_host: h.get("host"),
    request_ip: h.get("x-forwarded-for") || h.get("x-real-ip"),
    user_agent: h.get("user-agent"),
    severity: input.severity || "info",
  });
}
