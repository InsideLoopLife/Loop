import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { buildFinancialBriefing } from "@/lib/briefing/build-financial-briefing";

export async function GET(request: NextRequest){
 const guard=verifyCronRequest(request); if(!guard.ok) return guard.response;
 const supabase=createWorkerDatabaseClient("wealth");
 const {data: users,error}=await supabase.from("app_user_profiles").select("user_id,display_name").limit(Number(request.nextUrl.searchParams.get("limit")||500));
 if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
 const results=[];
 for(const row of users||[]){
  try{
   const { data: entitlement } = await supabase.rpc("loop_effective_user_entitlements", { p_user_id: row.user_id });
   if (!entitlement?.features?.ai_financial_briefing?.enabled) { results.push({user_id:row.user_id,ok:true,skipped:"not_entitled"}); continue; }
   const briefing=await buildFinancialBriefing(supabase,{id:row.user_id,email:null});
   await supabase.from("financial_position_snapshots").upsert({user_id:row.user_id,snapshot_date:new Date().toISOString().slice(0,10),net_worth:briefing.currentNetWorth,total_assets:briefing.assets,total_liabilities:briefing.liabilities,investment_value:briefing.investments.value,savings_value:briefing.savings.balance,pension_value:0,property_equity:briefing.home?.equity||0,metadata:{source:"daily-financial-briefing"}},{onConflict:"user_id,snapshot_date"});
   await supabase.from("financial_briefings").upsert({user_id:row.user_id,briefing_date:new Date().toISOString().slice(0,10),scope:"household",status:"ready",headline:briefing.narrative[0],briefing_json:briefing,generated_at:new Date().toISOString(),model_key:"deterministic-v1",prompt_version:"v1"},{onConflict:"user_id,briefing_date,scope"});
   results.push({user_id:row.user_id,ok:true});
  }catch(e:any){results.push({user_id:row.user_id,ok:false,error:e?.message||"failed"});}
 }
 return NextResponse.json({ok:true,processed:results.length,failed:results.filter(r=>!r.ok).length,results});
}
