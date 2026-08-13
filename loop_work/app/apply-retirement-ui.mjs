#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "loop_work/app/investments/page.tsx");
const clientPath = path.join(root, "loop_work/components/investments/PensionsInvestmentsClient.tsx");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  return fs.readFileSync(file, "utf8");
}
function write(file, value) {
  fs.writeFileSync(file, value, "utf8");
  console.log(`updated ${path.relative(root, file)}`);
}
function requireAnchor(text, anchor, label) {
  if (!text.includes(anchor)) throw new Error(`Could not find ${label}. Current repo differs from the expected LOOP main branch.`);
}
function addAfter(text, anchor, addition, label) {
  requireAnchor(text, anchor, label);
  if (text.includes(addition.trim())) return text;
  return text.replace(anchor, anchor + addition);
}

/* ---------------- app/investments/page.tsx ---------------- */
let page = read(pagePath);

if (!page.includes('RetirementPlanRecord')) {
  page = page.replace(
    'import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";',
    'import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";\nimport type { RetirementPlanRecord } from "@/lib/retirement/actions";'
  );
}

page = page.replace(
  'type Person = { id: string; name: string; relationship: string; avatar_url: string | null; linked_user_id: string | null };',
  'type Person = { id: string; name: string; relationship: string; avatar_url: string | null; linked_user_id: string | null; birth_date: string | null };'
);

page = page.replace(
  'investmentSnapshotsResult, investmentCoveragePlaceholdersResult] = await Promise.all([',
  'investmentSnapshotsResult, investmentCoveragePlaceholdersResult, retirementPlansResult] = await Promise.all(['
);

page = page.replace(
  '.select("id, name, relationship, avatar_url, linked_user_id")',
  '.select("id, name, relationship, avatar_url, linked_user_id, birth_date")'
);

const retirementQueryAnchor = '    supabase.from("investment_instrument_coverage_placeholders").select("id, investment_account_id, request_id, query, exchange_hint, status, eta_text, progress, resolved_ticker, resolved_exchange, resolved_asset_name, created_at, updated_at").eq("user_id", dataOwnerUserId).neq("status", "archived").order("created_at", { ascending: false }).limit(100).returns<InvestmentCoveragePlaceholder[]>(),';
requireAnchor(page, retirementQueryAnchor, "investment coverage query");

if (!page.includes('supabase.from("retirement_plans")')) {
  page = page.replace(
    retirementQueryAnchor,
    retirementQueryAnchor + '\n    supabase.from("retirement_plans").select("id, user_id, person_id, household_id, scope, retirement_age, target_annual_income, target_legacy_pot, annual_growth_rate_percent, annual_inflation_percent, sustainable_withdrawal_rate_percent, guaranteed_annual_income, created_at, updated_at").eq("user_id", dataOwnerUserId).order("updated_at", { ascending: false }).returns<RetirementPlanRecord[]>(),'
  );
}

const pagePropsAnchor = '        snapTradeConnection={{';
requireAnchor(page, pagePropsAnchor, "client props");
if (!page.includes('retirementPlans={retirementPlansResult.data ?? []}')) {
  page = page.replace(
    pagePropsAnchor,
    '        retirementPlans={retirementPlansResult.data ?? []}\n' + pagePropsAnchor
  );
}
write(pagePath, page);

/* ---------------- PensionsInvestmentsClient.tsx ---------------- */
let client = read(clientPath);

const valuationImport = 'import {\n  pensionAccountValue,\n  pensionFundValue,\n  totalPensionValue,\n} from "@/lib/investments/pension-valuation";';
requireAnchor(client, valuationImport, "pension valuation import");
if (!client.includes('WealthLandingSummary')) {
  client = client.replace(
    valuationImport,
    valuationImport + '\nimport { WealthLandingSummary } from "@/components/investments/WealthLandingSummary";\nimport { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";\nimport {\n  ageFromBirthDate,\n  investmentSourceLines,\n  pensionSourceLines,\n  retirementAssetsFromCurrentWealth,\n  retirementContributionsFromPensions,\n} from "@/lib/retirement/adapter";\nimport { calculateRetirementPlan, type RetirementPlanProjection } from "@/lib/calculations/retirement";\nimport type { RetirementPlanRecord } from "@/lib/retirement/actions";'
  );
}

client = client.replace(
  '  linked_user_id?: string | null;\n};',
  '  linked_user_id?: string | null;\n  birth_date?: string | null;\n};'
);

const propsEndAnchor = '  snapTradeConnection?: SnapTradeConnectionSummary;\n};';
requireAnchor(client, propsEndAnchor, "Props end");
if (!client.includes('retirementPlans?: RetirementPlanRecord[];')) {
  client = client.replace(
    propsEndAnchor,
    '  snapTradeConnection?: SnapTradeConnectionSummary;\n  retirementPlans?: RetirementPlanRecord[];\n};'
  );
}

/* Add retirementPlans to the component destructuring without depending on formatting. */
if (!/retirementPlans\s*=\s*\[\]/.test(client)) {
  const componentMatch = client.match(/export function PensionsInvestmentsClient\s*\(\s*\{([\s\S]*?)\}\s*:\s*Props\s*\)/);
  if (!componentMatch) throw new Error("Could not find PensionsInvestmentsClient component declaration.");
  const original = componentMatch[0];
  const body = componentMatch[1];
  const injectedBody = body.replace(/\s*$/, '') + '\n  retirementPlans = [],\n';
  client = client.replace(original, original.replace(body, injectedBody));
}

/* Add local saved-plan / planner state after router creation. */
const routerAnchor = '  const router = useRouter();';
requireAnchor(client, routerAnchor, "router");
if (!client.includes('const [retirementPlanRows')) {
  client = client.replace(
    routerAnchor,
    routerAnchor + '\n  const [retirementPlanRows, setRetirementPlanRows] = useState<RetirementPlanRecord[]>(retirementPlans);\n  const [showRetirementPlanner, setShowRetirementPlanner] = useState(false);'
  );
}

/* Add the derived retirement model once existing totals are available. */
const ownerCardsAnchor = '  const ownerCards = [';
requireAnchor(client, ownerCardsAnchor, "owner cards");
if (!client.includes('const primaryRetirementPerson =')) {
  const retirementDerivations = `  const primaryRetirementPerson =
    people.find((person) =>
      ["self", "me", "owner", "primary"].includes(
        String(person.relationship || "").toLowerCase(),
      ),
    ) ?? people[0] ?? null;
  const primaryRetirementAgeNow = ageFromBirthDate(primaryRetirementPerson?.birth_date);
  const primarySavedRetirementPlan =
    retirementPlanRows.find(
      (plan) =>
        plan.scope === "person" &&
        plan.person_id === primaryRetirementPerson?.id,
    ) ?? null;
  const retirementPensionSources = pensionSourceLines(pensionAccounts, pensionFunds);
  const retirementInvestmentSources = investmentSourceLines(
    investmentAccounts,
    investmentHoldings,
  );
  const retirementAssets = retirementAssetsFromCurrentWealth({
    pensionAccounts,
    pensionFunds,
    investmentAccounts,
    investmentHoldings,
  });
  const retirementContributions = retirementContributionsFromPensions(pensionAccounts);
  let retirementProjection: RetirementPlanProjection | null = null;
  if (
    primaryRetirementPerson &&
    primaryRetirementAgeNow != null &&
    primarySavedRetirementPlan &&
    Number(primarySavedRetirementPlan.retirement_age) >= primaryRetirementAgeNow
  ) {
    retirementProjection = calculateRetirementPlan({
      currentAge: primaryRetirementAgeNow,
      retirementAge: Number(primarySavedRetirementPlan.retirement_age),
      targetAnnualIncome: Number(primarySavedRetirementPlan.target_annual_income),
      assets: retirementAssets,
      contributions: retirementContributions,
      targetLegacyPot: Number(primarySavedRetirementPlan.target_legacy_pot || 0),
      guaranteedAnnualIncome: Number(primarySavedRetirementPlan.guaranteed_annual_income || 0),
      annualGrowthRatePercent: Number(primarySavedRetirementPlan.annual_growth_rate_percent || 5),
      annualInflationPercent: Number(primarySavedRetirementPlan.annual_inflation_percent || 2.5),
      sustainableWithdrawalRatePercent: Number(
        primarySavedRetirementPlan.sustainable_withdrawal_rate_percent || 3.5,
      ),
    });
  }

`;
  client = client.replace(ownerCardsAnchor, retirementDerivations + ownerCardsAnchor);
}

/* Replace the old, duplicated overview with the intended three-card landing. */
const overviewStart = client.indexOf('{experience === "overview" ? (');
const investmentStart = client.indexOf('{experience === "investment-command" ? (', overviewStart);
if (overviewStart < 0 || investmentStart < 0) {
  throw new Error("Could not find the current overview / investment-command boundary.");
}

const newOverview = `{experience === "overview" && !showRetirementPlanner ? (
        <WealthLandingSummary
          pensionTotal={pensionTotal}
          pensionSources={retirementPensionSources}
          investmentTotal={investmentTotal}
          investmentSources={retirementInvestmentSources}
          retirementProjection={retirementProjection}
          retirementAge={
            primarySavedRetirementPlan
              ? Number(primarySavedRetirementPlan.retirement_age)
              : null
          }
          targetAnnualIncome={
            primarySavedRetirementPlan
              ? Number(primarySavedRetirementPlan.target_annual_income)
              : null
          }
          onOpenPensions={() => openPensionCommand()}
          onOpenInvestments={() => openInvestmentCommand()}
          onOpenRetirement={() => setShowRetirementPlanner(true)}
        />
      ) : null}

      {showRetirementPlanner ? (
        primaryRetirementPerson && primaryRetirementAgeNow != null ? (
          <RetirementPlannerPanel
            personId={primaryRetirementPerson.id}
            assets={retirementAssets}
            contributions={retirementContributions}
            initialPlan={primarySavedRetirementPlan}
            initialCurrentAge={primaryRetirementAgeNow}
            onBack={() => setShowRetirementPlanner(false)}
            onSaved={(savedPlan) => {
              setRetirementPlanRows((current) => [
                savedPlan,
                ...current.filter((plan) => plan.id !== savedPlan.id),
              ]);
            }}
          />
        ) : (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
            <p className="text-sm font-black text-amber-900">
              Add a date of birth to use Retirement Planning
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-800">
              LOOP needs the person&apos;s age to calculate the years to retirement.
              Add their date of birth in their profile and return here.
            </p>
            <button
              type="button"
              onClick={() => setShowRetirementPlanner(false)}
              className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              Back to overview
            </button>
          </section>
        )
      ) : null}

      `;

client = client.slice(0, overviewStart) + newOverview + client.slice(investmentStart);

write(clientPath, client);

console.log("\\nRetirement UI wiring complete.");
console.log("Next run:");
console.log("  cd loop_work");
console.log("  npm run build");
console.log("\\nThen commit/deploy the changed files.");
