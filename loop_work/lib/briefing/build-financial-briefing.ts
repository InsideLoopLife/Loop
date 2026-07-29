import { calculateProjectedMortgageBalance } from "@/lib/calculations/mortgage";

export type BriefingContributor = { key: string; label: string; amount: number; href: string; tone: "positive" | "negative" | "neutral" };
export type BriefingAction = { rank: number; title: string; body: string; impact: string; href: string; confidence: "high" | "medium" | "low" };
export type FinancialBriefing = {
  firstName: string;
  currentNetWorth: number;
  weeklyChange: number;
  monthlyChange: number;
  assets: number;
  liabilities: number;
  contributors: BriefingContributor[];
  narrative: string[];
  actions: BriefingAction[];
  flow: { income: number; spending: number; savings: number; pensions: number; unassigned: number };
  investments: { value: number; weeklyChange: number; topExposure: string | null; topExposurePercent: number; evidence: string };
  savings: { balance: number; monthlyDeposits: number; monthlyWithdrawals: number; confirmedInterest: number; accruedInterest: number; blendedRate: number };
  home: { value: number; mortgage: number; equity: number; ltv: number; fixedEnd: string | null } | null;
  dataQuality: { area: string; issue: string; severity: "info" | "warning" | "critical" }[];
  generatedAt: string;
};

function n(value: unknown) { const x = Number(value ?? 0); return Number.isFinite(x) ? x : 0; }
function sum<T>(rows: T[], fn: (row: T) => number) { return rows.reduce((total, row) => total + fn(row), 0); }
function monthStart(offset = 0) { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + offset, 1); d.setUTCHours(0,0,0,0); return d.toISOString().slice(0,10); }
function daysAgo(days: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d.toISOString(); }

async function rows(query: PromiseLike<any>) {
  try { const { data } = await query; return Array.isArray(data) ? data : []; } catch { return []; }
}
async function one(query: PromiseLike<any>) {
  try { const { data } = await query; return data ?? null; } catch { return null; }
}

export async function buildFinancialBriefing(supabase: any, user: { id: string; email?: string | null }, visibleFilter?: string): Promise<FinancialBriefing> {
  const scope = <T extends any>(query: T) => visibleFilter ? query.or(visibleFilter) : query.eq("user_id", user.id);
  const [profile, assets, liabilities, homes, mortgages, pensionAccounts, pensionFunds, investmentAccounts, holdings, financialAccounts, movements, payEvents, plannedItems, snapshots] = await Promise.all([
    one(supabase.from("app_user_profiles").select("display_name,full_name,name").eq("user_id", user.id).maybeSingle()),
    rows(scope(supabase.from("assets").select("value,type,created_at"))),
    rows(scope(supabase.from("liabilities").select("balance,type,created_at"))),
    rows(scope(supabase.from("homes").select("id,label,property_value,estimated_value_mid,updated_at"))),
    rows(scope(supabase.from("home_mortgage_deals").select("id,home_id,balance,balance_as_of_date,interest_rate,term_years,monthly_payment_override,repayment_type,start_date,end_date"))),
    rows(scope(supabase.from("pension_accounts").select("id,current_value,value_as_of_date,updated_at"))),
    rows(scope(supabase.from("pension_funds").select("pension_account_id,current_value,units,unit_price"))),
    rows(scope(supabase.from("investment_accounts").select("id,label,provider"))),
    rows(scope(supabase.from("investment_holdings").select("investment_account_id,asset_name,ticker,group_label,units,latest_price,day_change_gbp,day_change_percent,updated_at"))),
    rows(scope(supabase.from("financial_accounts").select("id,name,account_type,current_balance,is_liability,interest_rate"))),
    rows(scope(supabase.from("savings_account_movements").select("movement_type,amount,effective_at,created_at").gte("effective_at", monthStart()))),
    rows(scope(supabase.from("pay_events").select("gross_annual_salary,monthly_take_home_override,pension_percent,effective_from,effective_until"))),
    rows(scope(supabase.from("planned_items").select("direction,amount,recurrence,start_date,end_date,item_type"))),
    rows(supabase.from("financial_position_snapshots").select("snapshot_date,net_worth,total_assets,total_liabilities,investment_value,savings_value,pension_value,property_equity").eq("user_id", user.id).gte("snapshot_date", daysAgo(40).slice(0,10)).order("snapshot_date", { ascending: true })),
  ]);

  const firstName = String(profile?.display_name || profile?.full_name || profile?.name || user.email?.split("@")[0] || "there").trim().split(/\s+/)[0];
  const manualAssets = sum(assets, (r:any) => n(r.value));
  const manualLiabilities = sum(liabilities, (r:any) => n(r.balance));
  const propertyValue = sum(homes, (r:any) => n(r.estimated_value_mid) || n(r.property_value));
  const mortgageValue = sum(mortgages, (r:any) => calculateProjectedMortgageBalance({ openingBalance:n(r.balance), annualInterestRate:n(r.interest_rate), termYears:n(r.term_years)||25, balanceAsOfDate:r.balance_as_of_date || r.start_date, monthlyPayment:r.monthly_payment_override, repaymentType:r.repayment_type || "repayment" }).projectedBalance);
  const pensionValue = sum(pensionAccounts, (a:any) => { const funds = pensionFunds.filter((f:any) => f.pension_account_id === a.id); const fv = sum(funds, (f:any) => n(f.current_value) || n(f.units)*n(f.unit_price)); return fv || n(a.current_value); });
  const investmentValue = sum(holdings, (h:any) => n(h.units)*n(h.latest_price));
  const investmentWeeklyChange = sum(holdings, (h:any) => n(h.day_change_gbp));
  const cashAssets = sum(financialAccounts.filter((a:any) => !a.is_liability), (a:any) => Math.abs(n(a.current_balance)));
  const accountLiabilities = sum(financialAccounts.filter((a:any) => a.is_liability), (a:any) => Math.abs(n(a.current_balance)));
  const assetsTotal = manualAssets + propertyValue + pensionValue + investmentValue + cashAssets;
  const liabilitiesTotal = manualLiabilities + mortgageValue + accountLiabilities;
  const currentNetWorth = assetsTotal - liabilitiesTotal;
  const latest = snapshots.at(-1); const weekRef = [...snapshots].reverse().find((s:any) => s.snapshot_date <= daysAgo(7).slice(0,10)); const monthRef = snapshots[0];
  const weeklyChange = latest && weekRef ? n(latest.net_worth)-n(weekRef.net_worth) : investmentWeeklyChange + sum(mortgages, (m:any) => Math.max(0,n(m.monthly_payment_override)/4));
  const monthlyChange = latest && monthRef ? n(latest.net_worth)-n(monthRef.net_worth) : weeklyChange*4;

  const deposits = sum(movements.filter((m:any) => ["deposit","interest"].includes(m.movement_type)), (m:any) => n(m.amount));
  const withdrawals = sum(movements.filter((m:any) => m.movement_type === "withdrawal"), (m:any) => Math.abs(n(m.amount)));
  const confirmedInterest = sum(movements.filter((m:any) => m.movement_type === "interest"), (m:any) => n(m.amount));
  const savingsAccounts = financialAccounts.filter((a:any) => !a.is_liability && ["savings","cash_isa","fixed_saver","regular_saver"].includes(String(a.account_type)));
  const savingsBalance = sum(savingsAccounts, (a:any) => Math.abs(n(a.current_balance)));
  const annualInterest = sum(savingsAccounts, (a:any) => Math.abs(n(a.current_balance))*n(a.interest_rate)/100);
  const blendedRate = savingsBalance ? annualInterest/savingsBalance*100 : 0;
  const accruedInterest = Math.max(0, annualInterest/12-confirmedInterest);

  const activePay = payEvents.find((p:any) => !p.effective_until || p.effective_until >= new Date().toISOString().slice(0,10));
  const income = n(activePay?.monthly_take_home_override) || n(activePay?.gross_annual_salary)*0.68/12;
  const spending = sum(plannedItems.filter((p:any) => p.direction === "outgoing"), (p:any) => n(p.amount));
  const plannedSavings = sum(plannedItems.filter((p:any) => p.item_type === "savings"), (p:any) => n(p.amount));
  const pensions = n(activePay?.gross_annual_salary)*n(activePay?.pension_percent)/100/12;
  const unassigned = income-spending-plannedSavings-pensions;

  const exposure = new Map<string, number>();
  for (const h of holdings) { const key = h.group_label || h.ticker || h.asset_name || "Other"; exposure.set(key, (exposure.get(key)||0)+n(h.units)*n(h.latest_price)); }
  const top = [...exposure.entries()].sort((a,b)=>b[1]-a[1])[0];
  const topExposurePercent = top && investmentValue ? top[1]/investmentValue*100 : 0;

  const contributors: BriefingContributor[] = [
    { key:"investments",label:"Investments",amount:investmentWeeklyChange,href:"/investments",tone:investmentWeeklyChange>0?"positive":investmentWeeklyChange<0?"negative":"neutral" },
    { key:"savings",label:"Savings",amount:deposits-withdrawals+confirmedInterest+accruedInterest,href:"/accounts?tab=savings",tone:deposits-withdrawals>=0?"positive":"negative" },
    { key:"mortgage",label:"Mortgage",amount:sum(mortgages,(m:any)=>Math.max(0,n(m.monthly_payment_override)/4)),href:"/mortgage",tone:"positive" },
  ].filter(x=>Math.abs(x.amount)>0.01).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,4);

  const dataQuality: FinancialBriefing["dataQuality"] = [];
  if (!homes.length) dataQuality.push({area:"Home",issue:"No property is linked, so property equity is excluded.",severity:"info"});
  if (!holdings.length) dataQuality.push({area:"Investments",issue:"No priced holdings are available for market-movement analysis.",severity:"warning"});
  if (!movements.length && savingsBalance>0) dataQuality.push({area:"Savings",issue:"No savings movements are logged this month, so deposits and withdrawals may be incomplete.",severity:"warning"});
  if (!activePay) dataQuality.push({area:"Income",issue:"No active income record was found, so Financial Flow capacity is estimated conservatively.",severity:"critical"});

  const actions: BriefingAction[] = [];
  if (unassigned > 100) actions.push({rank:1,title:"Give unassigned money a job",body:`Around £${Math.round(unassigned).toLocaleString("en-GB")} remains after known monthly commitments.`,impact:"Improve savings, debt reduction or pot progress",href:"/financial-flow",confidence:activePay?"high":"medium"});
  if (topExposurePercent > 25) actions.push({rank:actions.length+1,title:"Review portfolio concentration",body:`${top?.[0]} represents about ${topExposurePercent.toFixed(0)}% of priced investments.`,impact:"Understand how one exposure could drive future volatility",href:"/investments",confidence:"medium"});
  if (savingsBalance>0 && blendedRate<3) actions.push({rank:actions.length+1,title:"Check savings rate drag",body:`Your blended savings rate is approximately ${blendedRate.toFixed(2)}%.`,impact:"Compare compatible accounts before moving money",href:"/accounts?tab=better-rate",confidence:"medium"});
  if (homes.length && mortgageValue>0 && propertyValue>0 && mortgageValue/propertyValue*100 < 75) actions.push({rank:actions.length+1,title:"Use your improving LTV",body:`Estimated loan-to-value is ${Math.round(mortgageValue/propertyValue*100)}%.`,impact:"A lower LTV band may matter at your next mortgage review",href:"/mortgage",confidence:"medium"});
  while (actions.length < 3 && dataQuality[actions.length]) actions.push({rank:actions.length+1,title:`Improve ${dataQuality[actions.length].area.toLowerCase()} evidence`,body:dataQuality[actions.length].issue,impact:"Increase the confidence of future LOOP analysis",href:"/account",confidence:"high"});

  const direction = weeklyChange > 5 ? "increased" : weeklyChange < -5 ? "decreased" : "was broadly unchanged";
  const narrative = [
    `Your household net worth ${direction} this week${Math.abs(weeklyChange)>5?` by approximately £${Math.abs(Math.round(weeklyChange)).toLocaleString("en-GB")}`:""}.`,
    contributors[0] ? `${contributors[0].label} was the largest measurable contributor at ${contributors[0].amount>=0?"+":"-"}£${Math.abs(Math.round(contributors[0].amount)).toLocaleString("en-GB")}.` : "No single material movement is currently evidenced.",
    investmentValue>0 && top ? `${top[0]} is your largest visible investment exposure at about ${topExposurePercent.toFixed(0)}% of priced holdings.` : "Add or refresh investment holdings to unlock market-exposure commentary.",
  ];

  return {
    firstName,currentNetWorth,weeklyChange,monthlyChange,assets:assetsTotal,liabilities:liabilitiesTotal,contributors,narrative,actions,
    flow:{income,spending,savings:plannedSavings,pensions,unassigned},
    investments:{value:investmentValue,weeklyChange:investmentWeeklyChange,topExposure:top?.[0]||null,topExposurePercent,evidence:holdings.length?`${holdings.length} priced holding${holdings.length===1?"":"s"}`:"No priced holdings"},
    savings:{balance:savingsBalance,monthlyDeposits:deposits,monthlyWithdrawals:withdrawals,confirmedInterest,accruedInterest,blendedRate},
    home: homes.length ? {value:propertyValue,mortgage:mortgageValue,equity:propertyValue-mortgageValue,ltv:propertyValue?mortgageValue/propertyValue*100:0,fixedEnd:mortgages.map((m:any)=>m.end_date).filter(Boolean).sort()[0]||null}:null,
    dataQuality,generatedAt:new Date().toISOString(),
  };
}
