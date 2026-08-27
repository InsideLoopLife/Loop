import type { BriefingLineChart } from "./projections";

// Persists the /briefing chat's message history for the current UTC day so
// a conversation survives navigation and page reloads. Deliberately
// day-scoped, not permanent history — matches the "today's briefing" shape
// of the rest of this feature, and keeps the stored payload small.
export type StoredChatMessage = { role: "user" | "assistant"; content: string; card?: string | null; chart?: BriefingLineChart | null };

const MAX_STORED_MESSAGES = 60;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadTodaysChatMessages(supabase: any, userId: string): Promise<StoredChatMessage[]> {
  const { data, error } = await supabase
    .from("loop_briefing_chat_days")
    .select("messages")
    .eq("user_id", userId)
    .eq("chat_date", todayUtc())
    .maybeSingle();
  if (error) {
    // Supabase-js does NOT throw on RLS/constraint failures — it returns
    // {error}. A previous version of this file only wrapped this in
    // try/catch without ever checking that, so persistence failures were
    // completely invisible. Logging here at minimum surfaces the real
    // Postgres error in server logs if this ever breaks again.
    console.error("[briefing-chat-session] loadTodaysChatMessages failed", error);
    return [];
  }
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function appendTodaysChatMessages(supabase: any, userId: string, newMessages: StoredChatMessage[]) {
  const existing = await loadTodaysChatMessages(supabase, userId);
  const merged = [...existing, ...newMessages].slice(-MAX_STORED_MESSAGES);
  const { error } = await supabase
    .from("loop_briefing_chat_days")
    .upsert({ user_id: userId, chat_date: todayUtc(), messages: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id,chat_date" });
  if (error) {
    console.error("[briefing-chat-session] appendTodaysChatMessages failed", error);
    // Persisting the conversation should never break the chat response
    // itself — but the error above is now visible in server logs.
  }
}
