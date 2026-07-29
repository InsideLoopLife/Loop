import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Car,
  CreditCard,
  HeartPulse,
  Home,
  LineChart,
  PiggyBank,
  Plus,
  Salad,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type LandingExperienceKey =
  | "overview"
  | "financial-flow"
  | "income"
  | "spending"
  | "savings"
  | "mortgage"
  | "investments"
  | "net-worth"
  | "loopwatch"
  | "nutrition"
  | "lifestyle";

type LandingAction = {
  label: string;
  href: string;
  tone?: "dark" | "soft";
};

type LandingConfig = {
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  accent: "emerald" | "orange" | "blue" | "purple" | "rose";
  primaryAction: LandingAction;
  secondaryAction?: LandingAction;
  steps: Array<{ label: string; body: string; icon: LucideIcon }>;
  illustration: "piggy" | "flow" | "home" | "watch" | "health" | "growth";
};

const configs: Record<LandingExperienceKey, LandingConfig> = {
  overview: {
    eyebrow: "Start gently",
    title: "Build your picture one useful piece at a time",
    body: "LOOP gets more helpful as you add income, bills, savings, housing and health signals. The first screen should guide, not overwhelm.",
    icon: Sparkles,
    accent: "emerald",
    primaryAction: { label: "Add your first item", href: "/financial-flow", tone: "dark" },
    secondaryAction: { label: "Open household setup", href: "/account?tab=sharing", tone: "soft" },
    illustration: "growth",
    steps: [
      { label: "Add a few basics", body: "Income, savings and key bills are enough to start useful guidance.", icon: WalletCards },
      { label: "Watch the logic build", body: "Each new item powers affordability, goal and renewal prompts.", icon: LineChart },
      { label: "Improve health + wealth", body: "Connect money decisions to family, lifestyle and long-term plans.", icon: HeartPulse },
    ],
  },
  "financial-flow": {
    eyebrow: "Financial Flow",
    title: "Show how money moves before showing lots of tables",
    body: "Start with one income source and a few repeating payments. LOOP then turns them into an easy flow diagram across income, spending and savings.",
    icon: WalletCards,
    accent: "blue",
    primaryAction: { label: "Add income", href: "/income", tone: "dark" },
    secondaryAction: { label: "Add a bill", href: "/spending", tone: "soft" },
    illustration: "flow",
    steps: [
      { label: "Income in", body: "Salary, dividends, benefits or partner income.", icon: Banknote },
      { label: "Commitments out", body: "House, bills, nursery, insurance and debt payments.", icon: CreditCard },
      { label: "Future built", body: "Savings, investments, pension and leftover cash.", icon: PiggyBank },
    ],
  },
  income: {
    eyebrow: "Income setup",
    title: "Tell LOOP what normally comes in",
    body: "Add pay, dividends or irregular income once and the rest of the wealth logic can use the monthly baseline.",
    icon: Banknote,
    accent: "emerald",
    primaryAction: { label: "Add income", href: "/income#add-income", tone: "dark" },
    secondaryAction: { label: "Open Financial Flow", href: "/financial-flow?tab=income", tone: "soft" },
    illustration: "flow",
    steps: [
      { label: "Net income", body: "Use take-home overrides or salary modelling.", icon: Banknote },
      { label: "Pension impact", body: "Salary sacrifice and pension choices become visible.", icon: ShieldCheck },
      { label: "Affordability", body: "Housing, car and savings decisions can be checked against real income.", icon: Target },
    ],
  },
  spending: {
    eyebrow: "Spending setup",
    title: "Add the commitments that shape everyday affordability",
    body: "Start with regular bills. LOOP can then show what is fixed, what changes, and where a better deal might help.",
    icon: CreditCard,
    accent: "orange",
    primaryAction: { label: "Add a bill", href: "/spending#add-spending", tone: "dark" },
    secondaryAction: { label: "Use LoopWatch", href: "/loopwatch", tone: "soft" },
    illustration: "watch",
    steps: [
      { label: "Bills", body: "Energy, broadband, insurance, childcare and subscriptions.", icon: CreditCard },
      { label: "Renewals", body: "Contract dates tell LOOP when to check prices.", icon: BookOpenCheck },
      { label: "Pressure check", body: "See what each bill does to savings and mortgage capacity.", icon: Target },
    ],
  },
  savings: {
    eyebrow: "Savings setup",
    title: "Add a savings account and we’ll get that piggy filled in no time",
    body: "Each pot can have a goal, target date and top-up. LOOP then shows how far away you are and whether you’re on track.",
    icon: PiggyBank,
    accent: "emerald",
    primaryAction: { label: "Add a savings account", href: "/accounts?tab=add", tone: "dark" },
    secondaryAction: { label: "See projection", href: "/accounts?tab=projection", tone: "soft" },
    illustration: "piggy",
    steps: [
      { label: "Name the pot", body: "Emergency fund, holiday, child saver or house move.", icon: PiggyBank },
      { label: "Set the goal", body: "Target amount, date and normal monthly top-up.", icon: Target },
      { label: "Track the gap", body: "LOOP calculates time to target and monthly shortfall.", icon: LineChart },
    ],
  },
  mortgage: {
    eyebrow: "Housing setup",
    title: "Your home becomes the anchor for affordability",
    body: "Add a property, mortgage or move idea. LOOP can then blend equity, debt, running costs and savings pressure.",
    icon: Home,
    accent: "orange",
    primaryAction: { label: "Add a home", href: "/mortgage#add-home", tone: "dark" },
    secondaryAction: { label: "Watch a move", href: "/mortgage#move-watch", tone: "soft" },
    illustration: "home",
    steps: [
      { label: "Property value", body: "Use purchase price, valuation or a watched listing.", icon: Home },
      { label: "Mortgage debt", body: "Projected balances feed net worth automatically.", icon: ShieldCheck },
      { label: "Move impact", body: "Understand payment, council tax, bills and savings pressure.", icon: Target },
    ],
  },
  investments: {
    eyebrow: "Investments setup",
    title: "Start with one pot, then LOOP builds the portfolio story",
    body: "Manual pots, provider imports and purchase threads help users understand tranches, cost basis and long-term movement.",
    icon: LineChart,
    accent: "purple",
    primaryAction: { label: "Add investment pot", href: "/investments?tab=add", tone: "dark" },
    secondaryAction: { label: "Open live view", href: "/investments?view=live", tone: "soft" },
    illustration: "growth",
    steps: [
      { label: "Add a wrapper", body: "ISA, GIA, pension platform or child account.", icon: WalletCards },
      { label: "Add holdings", body: "Stocks, ETFs, funds and cash can be bundled by asset.", icon: LineChart },
      { label: "Build history", body: "Threads explain purchases, prices and performance.", icon: BookOpenCheck },
    ],
  },
  "net-worth": {
    eyebrow: "Net worth setup",
    title: "Show personal progress beside household progress",
    body: "Net worth should become clearer as homes, debts, savings, pensions and investments are added — not a wall of empty rows.",
    icon: WalletCards,
    accent: "blue",
    primaryAction: { label: "Add an asset", href: "/net-worth#add-asset", tone: "dark" },
    secondaryAction: { label: "Add savings", href: "/accounts?tab=add", tone: "soft" },
    illustration: "growth",
    steps: [
      { label: "Your view", body: "A personal card tracks individual growth.", icon: Target },
      { label: "Household view", body: "A second card shows shared assets and debts.", icon: Home },
      { label: "Auto-fed", body: "Savings, mortgage, investment and pension pages flow in.", icon: Sparkles },
    ],
  },
  loopwatch: {
    eyebrow: "LoopWatch setup",
    title: "Attach a bill, document or search and let LOOP remember why it matters",
    body: "LoopWatch works best when every item has context: who it belongs to, what it affects and when LOOP should check again.",
    icon: BookOpenCheck,
    accent: "rose",
    primaryAction: { label: "Attach an item", href: "/loopwatch#attach", tone: "dark" },
    secondaryAction: { label: "Discover deals", href: "/loopwatch?tab=discover", tone: "soft" },
    illustration: "watch",
    steps: [
      { label: "Attach", body: "Paste a URL, upload or describe the item.", icon: Plus },
      { label: "Review", body: "Accept or edit the extracted summary before saving.", icon: BookOpenCheck },
      { label: "Monitor", body: "Bills, cars and contracts can trigger periodic deal checks.", icon: Car },
    ],
  },
  nutrition: {
    eyebrow: "Health setup",
    title: "Start with a simple food log, then unlock better health prompts",
    body: "LOOP should learn from meals and drinks gradually, showing helpful nudges without turning the page into a medical dashboard.",
    icon: Salad,
    accent: "emerald",
    primaryAction: { label: "Log food or drink", href: "/nutrition?open=log", tone: "dark" },
    secondaryAction: { label: "Create a meal card", href: "/nutrition?open=recipe", tone: "soft" },
    illustration: "health",
    steps: [
      { label: "Log lightly", body: "A meal, coffee or snack is enough to start.", icon: Salad },
      { label: "Understand patterns", body: "Protein, fibre, caffeine and processing context builds over time.", icon: LineChart },
      { label: "Family-aware", body: "Allocate meals to the right person without mixing totals.", icon: HeartPulse },
    ],
  },
  lifestyle: {
    eyebrow: "Lifestyle setup",
    title: "Connect routines, bills and family planning without the clutter",
    body: "Lifestyle should surface the things that affect both wellbeing and wealth, from childcare to food routines and household renewals.",
    icon: HeartPulse,
    accent: "emerald",
    primaryAction: { label: "Add lifestyle item", href: "/lifestyle#add", tone: "dark" },
    secondaryAction: { label: "Open family planning", href: "/lifestyle/family-planning", tone: "soft" },
    illustration: "health",
    steps: [
      { label: "Family context", body: "People and routines make recommendations more relevant.", icon: HeartPulse },
      { label: "Running costs", body: "Food, childcare and recurring commitments are visible.", icon: CreditCard },
      { label: "Better choices", body: "LOOP can connect lifestyle changes to money outcomes.", icon: Sparkles },
    ],
  },
};

function toneClasses(accent: LandingConfig["accent"]) {
  if (accent === "orange") return { soft: "from-orange-50 via-white to-amber-50", pill: "bg-orange-100 text-orange-700", glow: "bg-orange-300/35", bar: "from-orange-500 via-amber-400 to-emerald-400" };
  if (accent === "blue") return { soft: "from-sky-50 via-white to-blue-50", pill: "bg-sky-100 text-sky-700", glow: "bg-sky-300/35", bar: "from-sky-500 via-blue-400 to-emerald-400" };
  if (accent === "purple") return { soft: "from-violet-50 via-white to-fuchsia-50", pill: "bg-violet-100 text-violet-700", glow: "bg-violet-300/35", bar: "from-violet-500 via-fuchsia-400 to-emerald-400" };
  if (accent === "rose") return { soft: "from-rose-50 via-white to-orange-50", pill: "bg-rose-100 text-rose-700", glow: "bg-rose-300/35", bar: "from-rose-500 via-orange-400 to-emerald-400" };
  return { soft: "from-emerald-50 via-white to-orange-50", pill: "bg-emerald-100 text-emerald-700", glow: "bg-emerald-300/35", bar: "from-emerald-500 via-teal-400 to-orange-400" };
}

function Illustration({ kind, accent }: { kind: LandingConfig["illustration"]; accent: LandingConfig["accent"] }) {
  const tones = toneClasses(accent);
  const Icon = kind === "piggy" ? PiggyBank : kind === "home" ? Home : kind === "watch" ? BookOpenCheck : kind === "health" ? HeartPulse : kind === "flow" ? WalletCards : LineChart;
  return (
    <div className="relative mx-auto h-56 max-w-sm overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl">
      <div className={`absolute -right-12 -top-12 h-36 w-36 rounded-full ${tones.glow} blur-3xl`} />
      <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-orange-200/30 blur-3xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className={`grid h-16 w-16 place-items-center rounded-3xl ${tones.pill}`}><Icon className="h-8 w-8" /></span>
          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Starts simple</span>
        </div>
        {kind === "piggy" ? (
          <div className="space-y-3">
            <div className="h-5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/5 rounded-full bg-gradient-to-r from-emerald-400 to-orange-400" /></div>
            <div className="grid grid-cols-3 gap-2">
              <span className="h-12 rounded-2xl bg-emerald-100" />
              <span className="h-12 rounded-2xl bg-orange-100" />
              <span className="h-12 rounded-2xl bg-sky-100" />
            </div>
            <p className="text-sm font-black text-slate-950">£2,400 saved · £7,600 to go</p>
          </div>
        ) : kind === "flow" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><span className="h-14 w-24 rounded-2xl bg-sky-100" /><span className="h-2 flex-1 rounded-full bg-sky-200" /><span className="h-12 w-20 rounded-2xl bg-orange-100" /></div>
            <div className="flex items-center gap-2 pl-12"><span className="h-2 flex-1 rounded-full bg-emerald-200" /><span className="h-12 w-24 rounded-2xl bg-emerald-100" /></div>
            <div className="flex items-center gap-2 pl-20"><span className="h-2 flex-1 rounded-full bg-blue-200" /><span className="h-12 w-20 rounded-2xl bg-blue-100" /></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`h-2 w-16 rounded-full bg-gradient-to-r ${tones.bar}`} />
            <div className="grid grid-cols-5 items-end gap-2">
              {[28, 46, 38, 58, 76].map((height, index) => <span key={index} className="rounded-t-2xl bg-slate-950/85" style={{ height }} />)}
            </div>
            <p className="text-sm font-black text-slate-950">More context = better prompts</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PageLandingExperience({
  kind,
  compact = false,
  className = "",
}: {
  kind: LandingExperienceKey;
  compact?: boolean;
  className?: string;
}) {
  const config = configs[kind];
  const tones = toneClasses(config.accent);
  const HeaderIcon = config.icon;
  return (
    <section className={`relative overflow-hidden rounded-[2.5rem] border border-white/80 bg-gradient-to-br ${tones.soft} p-6 shadow-[0_28px_90px_-58px_rgba(15,23,42,.75)] ${className}`}>
      <div className={`absolute -right-20 -top-24 h-72 w-72 rounded-full ${tones.glow} blur-3xl`} />
      <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-orange-200/25 blur-3xl" />
      <div className={`relative grid gap-7 ${compact ? "lg:grid-cols-[1fr_280px]" : "lg:grid-cols-[1fr_380px]"} lg:items-center`}>
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${tones.pill}`}><HeaderIcon className="h-3.5 w-3.5" />{config.eyebrow}</span>
          <h1 className={`${compact ? "mt-3 text-3xl" : "mt-4 text-4xl md:text-5xl"} font-black tracking-tight text-slate-950`}>{config.title}</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-slate-600">{config.body}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={config.primaryAction.href} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 transition hover:bg-orange-500">
              {config.primaryAction.label}<ArrowRight className="h-4 w-4" />
            </Link>
            {config.secondaryAction ? (
              <Link href={config.secondaryAction.href} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                {config.secondaryAction.label}
              </Link>
            ) : null}
          </div>
          {!compact ? (
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {config.steps.map((step) => {
                const StepIcon = step.icon;
                return (
                  <article key={step.label} className="rounded-3xl border border-white/80 bg-white/72 p-4 shadow-sm">
                    <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tones.pill}`}><StepIcon className="h-5 w-5" /></span>
                    <h3 className="mt-3 text-sm font-black text-slate-950">{step.label}</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{step.body}</p>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
        <Illustration kind={config.illustration} accent={config.accent} />
      </div>
    </section>
  );
}
