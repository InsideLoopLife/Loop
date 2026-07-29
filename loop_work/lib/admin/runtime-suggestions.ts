export type AdminModelSettings = {
  runtimeIssueModel: string;
  helpModel: string;
  researchModel: string;
  visionModel: string;
  productImportModel: string;
  hasOpenAiKey: boolean;
};

export function getAdminModelSettings(env: NodeJS.ProcessEnv): AdminModelSettings {
  return {
    runtimeIssueModel: env.LOOP_RUNTIME_ISSUE_AI_MODEL || env.OPENAI_HELP_MODEL || env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
    helpModel: env.OPENAI_HELP_MODEL || env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
    researchModel: env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
    visionModel: env.OPENAI_VISION_MODEL || env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
    productImportModel: env.LOOP_PRODUCT_IMPORT_AI_MODEL || env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
    hasOpenAiKey: Boolean(env.OPENAI_API_KEY || env.OPENAI_TOKEN || env.LOOP_OPENAI_API_KEY),
  };
}

export function suggestionForRuntimeIssue(issue: { title?: string | null; summary?: string | null; detail?: string | null; area?: string | null; severity?: string | null }) {
  const text = `${issue.area || ""} ${issue.title || ""} ${issue.summary || ""} ${issue.detail || ""}`.toLowerCase();

  if (/supabase|database|rpc|column|relation|schema|migration/.test(text)) {
    return "Check the latest SQL catch-up migration first, then confirm the relevant RPC/table exists in Supabase. If this is a missing-column issue, make the page column-safe rather than blocking the whole admin view.";
  }
  if (/auth|oauth|provider|google|apple|login|reset password|supabase_secret/.test(text)) {
    return "Check Supabase Auth provider settings, redirect URLs and server-only auth environment variables. Password reset and branded auth flows need the service secret available server-side.";
  }
  if (/email|resend|digest|template|notification/.test(text)) {
    return "Check Resend/API email config, template variables and the latest app_email_runs error. Keep preview generation working even when live sending is disabled.";
  }
  if (/cron|schedule|uptime|timeout|latency|worker/.test(text)) {
    return "Check the cron endpoint secret, Render/Vercel schedule, target URL and last latency. Runtime checks should create admin alerts but not fail user-facing pages.";
  }
  if (/nutrition|food|product|barcode|import|label|image/.test(text)) {
    return "Check product import status, source URL evidence and nutrition-card enrichment. Prefer queueing corrections over overwriting verified labels.";
  }
  if (/investment|snaptrade|market|quote|price/.test(text)) {
    return "Check provider credentials, user tier entitlement and whether delayed market data is acceptable for this customer before enabling realtime checks.";
  }

  return "Start with the failing route or alert area, then check environment variables, recent migrations and whether this should be a visible admin alert or a silent fallback.";
}
