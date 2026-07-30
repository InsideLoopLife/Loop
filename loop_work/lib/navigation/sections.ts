export type LoopArea = "wealth" | "health" | "admin";

export type LoopSection = {
  key: string;
  label: string;
  href: string;
  area: LoopArea;
  description?: string;
  icon: string;
  hidden?: boolean;
  exact?: boolean;
};

export const wealthSections: LoopSection[] = [
  { key: "overview", label: "Overview", href: "/dashboard", area: "wealth", icon: "dashboard", exact: true, description: "Financial command centre." },
  { key: "financial-flow", label: "Financial Flow", href: "/financial-flow", area: "wealth", icon: "accounts", description: "Income, spending, savings and pots in one consolidated view." },
  { key: "savings", label: "Savings", href: "/accounts", area: "wealth", icon: "accounts", hidden: true, description: "Savings accounts, fixed-rate ladders and cash-growth tracking." },
  { key: "income", label: "Income", href: "/income", area: "wealth", icon: "income", hidden: true, description: "Salary, maternity, dividends and household income." },
  { key: "spending", label: "Spending", href: "/spending", area: "wealth", icon: "spending", hidden: true, description: "Bills, planned outgoings and renewal tracking." },
  { key: "loopwatch", label: "LoopWatch", href: "/loopwatch", area: "wealth", icon: "documents", description: "Document intelligence for contracts, insurance, renewal dates and deal-watch triggers." },
  { key: "net-worth", label: "Net worth", href: "/net-worth", area: "wealth", icon: "net-worth", hidden: true, description: "Hidden until the wealth summary is rebuilt." },
  { key: "house", label: "House", href: "/mortgage", area: "wealth", icon: "mortgage", description: "Homes, ownership, valuations, mortgage balance and affordability impact." },
  { key: "affordability", label: "Affordability", href: "/affordability", area: "wealth", icon: "home", hidden: true, description: "Hidden lab until rebuilt." },
  { key: "can-i-afford", label: "Can I afford?", href: "/affordability-lab", area: "wealth", icon: "search", hidden: true, description: "Hidden lab until rebuilt." },
  { key: "investments", label: "Pensions & Investments", href: "/investments", area: "wealth", icon: "investments", description: "Pension pots, funds, holdings and investment performance." },
  // BUGFIX (missing nav entry): the /integrations page (SnapTrade/broker
  // connections) has existed and worked the whole time, but there was no
  // link to it anywhere in the nav after the navigation rebuild — it was
  // an orphaned route, not a tier/entitlement gate. The page itself
  // already gates the connect panel correctly via canConnectPaidProvider.
  { key: "integrations", label: "Integrations", href: "/integrations", area: "wealth", icon: "investments", description: "Connect SnapTrade/brokerage accounts and manage which pots sync automatically." },
];

export const healthSections: LoopSection[] = [
  { key: "nutrition-overview", label: "Nutrition overview", href: "/nutrition", area: "health", icon: "nutrition", exact: true, description: "Daily nutrition score and household view." },
  { key: "nutrition-recipes", label: "Recipes", href: "/nutrition/recipes", area: "health", icon: "recipes", description: "Recipe cards and cooking-method logic." },
  { key: "nutrition-food-log", label: "Food log", href: "/nutrition/food-log", area: "health", icon: "food-log", description: "Timeline logging by time, person and meal slot." },
  { key: "nutrition-meal-cards", label: "Meal cards", href: "/nutrition/meal-cards", area: "health", icon: "meal-cards", description: "Reusable product, ingredient and meal cards." },
  { key: "lifestyle", label: "Lifestyle", href: "/lifestyle", area: "health", icon: "lifestyle", hidden: true, description: "Hidden until the lifestyle section is rebuilt." },
];

export const adminSections: LoopSection[] = [
  { key: "overview", label: "Overview", href: "/admin", area: "admin", icon: "dashboard", exact: true, description: "Admin control centre summary." },
  { key: "users", label: "Users", href: "/admin/users", area: "admin", icon: "users", description: "Customer, profile, tier and household checks." },
  { key: "admin-investments", label: "Investments", href: "/admin/investments", area: "admin", icon: "investments", description: "Investment coverage, broker imports, raw price points, chart storage and cadence." },
  { key: "admin-houses", label: "House", href: "/admin/houses", area: "admin", icon: "mortgage", description: "Homes, mortgage catalogue, moving-home enrichment and valuation automation." },
  { key: "admin-financial-flow", label: "Financial Flow", href: "/admin/financial-flow", area: "admin", icon: "accounts", description: "Income, savings transfers, spending planner and cashflow checks." },
  { key: "admin-savings", label: "Savings", href: "/admin/savings", area: "admin", icon: "accounts", description: "Savings deal sources, recommendations and surplus optimiser controls." },
  { key: "admin-loopwatch", label: "LoopWatch", href: "/admin/loopwatch", area: "admin", icon: "documents", description: "Document intelligence rules, provider increases and renewal opportunities." },
  { key: "admin-health", label: "Health", href: "/admin/health", area: "admin", icon: "products", description: "Nutrition, product data, ingredient quality and health logic." },
  { key: "admin-lifestyle", label: "Lifestyle", href: "/admin/lifestyle", area: "admin", icon: "sparkles", description: "Lifestyle, routines and future family planning modules." },
  { key: "tiers", label: "Tiers", href: "/admin/tiers", area: "admin", icon: "tiers", description: "Plan limits, AI routing and tier API keys." },
  { key: "notifications", label: "Ops", href: "/admin/notifications", area: "admin", icon: "notifications", description: "Notifications, runtime issues and security checks." },
  { key: "beta", label: "Beta", href: "/admin/beta", area: "admin", icon: "sparkles", description: "Private beta access codes, release flags and upgrade approval rules." },
  { key: "products", label: "Health products", href: "/admin/products/quality", area: "admin", icon: "products", hidden: true, description: "Product, ingredient and nutrition quality database." },
  { key: "investment-coverage", label: "Investment coverage", href: "/admin/investment-coverage", area: "admin", icon: "investments", hidden: true, description: "Markets, providers and quote/source coverage." },
  { key: "investment-storage", label: "Investment storage", href: "/admin/investment-storage", area: "admin", icon: "database", hidden: true, description: "Chart point storage, retention and database usage." },
  { key: "wealth-watch", label: "Wealth Watch", href: "/admin/wealth-watch", area: "admin", icon: "runtime", hidden: true, description: "Savings, mortgage and moving-source cron controls." },
  { key: "future-integrations", label: "Future integrations", href: "/admin/future-integrations", area: "admin", icon: "sparkles", hidden: true, description: "Upcoming premium products, provider setup and launch checklists." },
  { key: "databases-infrastructure", label: "Databases / Infrastructure", href: "/admin/databases-infrastructure", area: "admin", icon: "database", hidden: true, description: "Database objects, env vars and infra readiness." },
  { key: "security", label: "Security", href: "/admin/security", area: "admin", icon: "security", hidden: true, description: "Admin access and security settings." },
  { key: "runtime-issues", label: "Runtime issues", href: "/admin/runtime-issues", area: "admin", icon: "runtime", hidden: true, description: "Runtime failures with AI-ready suggestions." },
  { key: "email-formats", label: "Email formats", href: "/admin/email-formats", area: "admin", icon: "email", hidden: true, description: "Email templates, model prompts and sending checks." },
];

export const visibleWealthSections = wealthSections.filter((section) => !section.hidden);
export const visibleHealthSections = healthSections.filter((section) => !section.hidden);
export const visibleAdminSections = adminSections.filter((section) => !section.hidden);

export function isSectionActive(pathname: string, section: Pick<LoopSection, "href" | "exact">) {
  if (section.exact) return pathname === section.href;
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

export function isHealthPath(pathname: string) {
  return pathname === "/nutrition" || pathname.startsWith("/nutrition/") || pathname === "/lifestyle" || pathname.startsWith("/lifestyle/") || healthSections.some((section) => isSectionActive(pathname, section));
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
