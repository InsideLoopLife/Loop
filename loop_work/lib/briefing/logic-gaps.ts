// Fire-and-forget logging of "the logic library didn't cover this, so a
// real AI call was needed" — reviewed later (via SQL against
// loop_briefing_chat_ai_gaps) to spot recurring question shapes worth
// turning into a new LOGIC_LIBRARY skill, which then answers that shape
// for free going forward. This is genuinely how the token budget shrinks
// over time rather than staying flat.
export async function logLogicLibraryGap(supabase: any, userId: string, message: string) {
  try {
    const { error } = await supabase.from("loop_briefing_chat_ai_gaps").insert({ user_id: userId, message: message.slice(0, 1000) });
    if (error) console.error("[logic-library] failed to log gap", error);
  } catch (error) {
    console.error("[logic-library] failed to log gap", error);
  }
}
