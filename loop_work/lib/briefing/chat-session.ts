// Persists the /briefing chat's message history for the current UTC day so
// a conversation survives navigation and page reloads. Deliberately
// day-scoped, not permanent history — matches the "today's briefing" shape
// of the rest of this feature, and keeps the stored payload small.
export type StoredChatMessage = { role: "user" | "assistant"; content: string; card?: string | null };

const MAX_STORED_MESSAGES = 60;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadTodaysChatMessages(supabase: any, userId: string): Promise<StoredChatMessage[]> {
  try {
    const { data } = await supabase
      .from("loop_briefing_chat_days")
      .select("messages")
      .eq("user_id", userId)
      .eq("chat_date", todayUtc())
      .maybeSingle();
    return Array.isArray(data?.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

export async function appendTodaysChatMessages(supabase: any, userId: string, newMessages: StoredChatMessage[]) {
  try {
    const existing = await loadTodaysChatMessages(supabase, userId);
    const merged = [...existing, ...newMessages].slice(-MAX_STORED_MESSAGES);
    await supabase
      .from("loop_briefing_chat_days")
      .upsert({ user_id: userId, chat_date: todayUtc(), messages: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id,chat_date" });
  } catch {
    // Persisting the conversation should never break the chat response itself.
  }
}
