export type UserFeatureAccess = {
  mortgage: boolean;
  pensions: boolean;
  investments: boolean;
  savings: boolean;
  debt: boolean;
  childcare: boolean;
  carFinance: boolean;
  businessIncome: boolean;
  studentLoan: boolean;
  aiFinancialBriefing: boolean;
};

export const DEFAULT_USER_FEATURE_ACCESS: UserFeatureAccess = {
  mortgage: false,
  pensions: false,
  investments: false,
  savings: false,
  debt: false,
  childcare: false,
  carFinance: false,
  businessIncome: false,
  studentLoan: false,
  aiFinancialBriefing: false,
};

export function featureAccessFromProfile(profile: any): UserFeatureAccess {
  return {
    mortgage: profile?.wealth_has_mortgage === true,
    pensions: profile?.wealth_has_pension === true,
    investments: profile?.wealth_has_investments === true,
    savings: profile?.wealth_has_savings === true,
    debt: profile?.wealth_has_credit_cards_or_loans === true,
    childcare: profile?.wealth_has_childcare_costs === true,
    carFinance: profile?.wealth_has_car_finance === true,
    businessIncome: profile?.wealth_has_business_income === true,
    studentLoan: profile?.financial_flow_student_loan_enabled === true,
    aiFinancialBriefing: false,
  };
}

export async function loadUserFeatureAccess(supabase: any, userId: string): Promise<UserFeatureAccess> {
  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("wealth_has_mortgage,wealth_has_pension,wealth_has_investments,wealth_has_savings,wealth_has_credit_cards_or_loans,wealth_has_childcare_costs,wealth_has_car_finance,wealth_has_business_income,financial_flow_student_loan_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return DEFAULT_USER_FEATURE_ACCESS;
  return featureAccessFromProfile(data);
}
