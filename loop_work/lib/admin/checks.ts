import { createClient } from "@/lib/supabase/server";

export async function refreshAdminAttentionQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loop_admin_refresh_attention_queue");
  if (error) throw new Error(error.message);
  return data;
}

export async function getAdminAttentionSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loop_admin_attention_summary");
  if (error) throw new Error(error.message);
  return data || [];
}
