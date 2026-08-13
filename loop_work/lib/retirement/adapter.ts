import type { RetirementAsset, RetirementContribution } from "@/lib/calculations/retirement";

type PensionAccount = { id:string; label:string; provider:string; current_value:number; fixed_monthly_contribution?:number|null; };
type PensionFund = { id:string; pension_account_id:string; current_value:number; };
type InvestmentAccount = { id:string; label:string; provider:string; account_type:string; provider_cash_value?:number|null; };
type InvestmentHolding = { id:string; investment_account_id:string; asset_name:string; units:number; latest_price:number; imported_current_value?:number|null; };

export function pensionSourceLines(accounts:PensionAccount[], funds:PensionFund[]) {
  return accounts.map(account => {
    const fundValue = funds.filter(f => f.pension_account_id === account.id).reduce((s,f)=>s+Number(f.current_value||0),0);
    return { id:account.id, label:account.provider || account.label, value:fundValue || Number(account.current_value||0) };
  }).sort((a,b)=>b.value-a.value);
}

export function investmentSourceLines(accounts:InvestmentAccount[], holdings:InvestmentHolding[]) {
  return accounts.map(account => {
    const holdingValue = holdings.filter(h=>h.investment_account_id===account.id).reduce((s,h)=>s+(Number(h.imported_current_value||0)||Number(h.units||0)*Number(h.latest_price||0)),0);
    return { id:account.id, label:account.provider || account.label, value:holdingValue + Number(account.provider_cash_value||0) };
  }).sort((a,b)=>b.value-a.value);
}

export function retirementAssetsFromCurrentWealth({pensionAccounts,pensionFunds,investmentAccounts,investmentHoldings,pensionAccessAge}:{pensionAccounts:PensionAccount[];pensionFunds:PensionFund[];investmentAccounts:InvestmentAccount[];investmentHoldings:InvestmentHolding[];pensionAccessAge?:number|null;}):RetirementAsset[] {
  return [
    ...pensionSourceLines(pensionAccounts,pensionFunds).map(s=>({id:`pension-${s.id}`,label:s.label,kind:"pension" as const,currentValue:s.value,accessAge:pensionAccessAge??null})),
    ...investmentSourceLines(investmentAccounts,investmentHoldings).map(s=>({id:`investment-${s.id}`,label:s.label,kind:"investment" as const,currentValue:s.value,accessAge:null})),
  ];
}

export function retirementContributionsFromPensions(accounts:PensionAccount[]):RetirementContribution[] {
  return accounts.filter(a=>Number(a.fixed_monthly_contribution||0)>0).map(a=>({id:`pension-contribution-${a.id}`,label:`${a.provider||a.label} contribution`,monthlyAmount:Number(a.fixed_monthly_contribution||0),assetId:`pension-${a.id}`}));
}

export function ageFromBirthDate(birthDate?:string|null, now=new Date()) {
  if (!birthDate) return null;
  const birth=new Date(`${birthDate}T00:00:00`); if (Number.isNaN(birth.getTime())) return null;
  let age=now.getFullYear()-birth.getFullYear(); const m=now.getMonth()-birth.getMonth();
  if (m<0 || (m===0 && now.getDate()<birth.getDate())) age-=1;
  return Math.max(0,age);
}
