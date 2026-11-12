// One way to create in-app notifications without duplicates. Every
// notification has a key (`period_key`) that says what it's about, such as
// "2026-W46" for a weekly update or "netflix-2026:<bill id>" for a price rise.
// If one with the same user, type and key already exists, it's updated in
// place (if still unread) or left alone (if read or dismissed), so running a
// job twice never doubles up.

export type NotificationInput = {
  user_id: string;
  household_id?: string | null;
  notification_type: string;
  /** What this is about; repeats with the same key are not created again. */
  key: string;
  category: "wealth" | "lifestyle" | "household" | "system";
  severity?: "info" | "success" | "warning" | "urgent";
  title: string;
  body: string;
  cta_label?: string | null;
  cta_href?: string | null;
  metadata?: Record<string, unknown>;
  /** When it stops being relevant; hidden after this. */
  expires_at?: string | null;
};

export async function notify(supabase: any, input: NotificationInput): Promise<"created" | "updated" | "skipped"> {
  const { data: existing } = await supabase
    .from("app_notifications")
    .select("id, status")
    .eq("user_id", input.user_id)
    .eq("notification_type", input.notification_type)
    .eq("period_key", input.key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = {
    household_id: input.household_id ?? null,
    category: input.category,
    severity: input.severity ?? "info",
    title: input.title,
    body: input.body,
    cta_label: input.cta_label ?? null,
    cta_href: input.cta_href ?? null,
    metadata: input.metadata ?? {},
    expires_at: input.expires_at ?? null,
  };
  if (existing) {
    if (existing.status !== "unread") return "skipped";
    const { error } = await supabase.from("app_notifications").update(row).eq("id", existing.id);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("app_notifications").insert({
    ...row,
    user_id: input.user_id,
    notification_type: input.notification_type,
    period_key: input.key,
    channel: "in_app",
    status: "unread",
  });
  return error ? "skipped" : "created";
}

/** ISO week key, e.g. "2026-W46". */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
