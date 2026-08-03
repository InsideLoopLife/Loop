export type MonthlyPerformanceSide = {
  baselineTotal: number;
  currentTotal: number;
  changeAmount: number;
  changePercent: number;
  hasData: boolean;
  hasBaseline: boolean;
};

export async function buildMonthlyInvestmentPensionPerformance(supabase: any, userIds: string[], month: string) {
  const monthStartDate = `${month}-01`;
  const { data, error } = await supabase.rpc("loop_monthly_portfolio_performance", {
    p_user_ids: userIds,
    p_month_start: monthStartDate,
  });

  if (error) throw error;
  return data as {
    investments: MonthlyPerformanceSide;
    pensions: MonthlyPerformanceSide;
  };
}
