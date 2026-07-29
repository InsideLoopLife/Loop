export type ReadinessStatus = "pass" | "warn" | "fail";

export type ReadinessItem = {
  key: string;
  title: string;
  status: ReadinessStatus;
  detail: string;
  action?: string;
};

export function buildRuntimeReadiness(env: NodeJS.ProcessEnv): ReadinessItem[] {
  const hasSupabaseUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasEncryption = Boolean(env.APP_ENCRYPTION_KEY);
  const hasAdmin = Boolean(env.SUPABASE_SECRET_KEY);
  const hasCron = Boolean(env.CRON_SECRET);
  const signupMode = env.APP_SIGNUP_MODE || env.NEXT_PUBLIC_APP_SIGNUP_MODE || "not set";
  const hasBaseUrl = Boolean(env.APP_BASE_URL);
  const hasAdminEmails = Boolean(env.APP_ADMIN_EMAILS || env.LOOP_ADMIN_EMAILS || "help@gamingnectar.com");
  const hasResend = Boolean(env.RESEND_API_KEY);

  return [
    {
      key: "supabase-public-env",
      title: "Supabase public client configured",
      status: hasSupabaseUrl && hasAnon ? "pass" : "fail",
      detail: hasSupabaseUrl && hasAnon
        ? "Project URL and publishable key are present."
        : "Missing Supabase URL or publishable key.",
      action: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    },
    {
      key: "secret-encryption",
      title: "Integration-token encryption key",
      status: hasEncryption ? "pass" : "fail",
      detail: hasEncryption
        ? "APP_ENCRYPTION_KEY is present for encrypting API tokens at rest."
        : "APP_ENCRYPTION_KEY is missing, so integration tokens cannot be saved securely.",
      action: "Generate with: openssl rand -base64 32",
    },
    {
      key: "server-admin-key",
      title: "Server-only Supabase key",
      status: hasAdmin ? "pass" : "warn",
      detail: hasAdmin
        ? "SUPABASE_SECRET_KEY is present for server-only jobs."
        : "No server admin key set. This is fine locally, but scheduled jobs/export workers may need it later.",
      action: "Keep this server-only and never put it in a NEXT_PUBLIC variable.",
    },
    {
      key: "cron-secret",
      title: "Cron route shared secret",
      status: hasCron ? "pass" : "warn",
      detail: hasCron
        ? "CRON_SECRET is present for deployed scheduled routes."
        : "CRON_SECRET is not set; deployed cron routes should not be left unauthenticated.",
      action: "Set a long random CRON_SECRET before hosting scheduled routes.",
    },

    {
      key: "app-base-url",
      title: "Canonical app URL",
      status: hasBaseUrl ? "pass" : "warn",
      detail: hasBaseUrl
        ? "APP_BASE_URL is set for password-reset/email links."
        : "APP_BASE_URL is missing; email redirects may fall back to localhost.",
      action: "Set APP_BASE_URL to your deployed URL before production.",
    },
    {
      key: "admin-email-allow-list",
      title: "Admin email allow-list declared",
      status: hasAdminEmails ? "pass" : "fail",
      detail: (env.APP_ADMIN_EMAILS || env.LOOP_ADMIN_EMAILS)
        ? "Admin access is restricted by APP_ADMIN_EMAILS / LOOP_ADMIN_EMAILS."
        : "Admin access falls back to help@gamingnectar.com only.",
      action: "Set APP_ADMIN_EMAILS=help@gamingnectar.com before production if you want the allow-list explicit.",
    },
    {
      key: "email-provider",
      title: "Digest email provider",
      status: hasResend ? "pass" : "warn",
      detail: hasResend
        ? "RESEND_API_KEY is present for digest/test emails."
        : "No email provider key set. In-app notifications still work; emails will be preview-only.",
      action: "Set RESEND_API_KEY and EMAIL_FROM after domain authentication.",
    },
    {
      key: "signup-mode",
      title: "Sign-up mode declared",
      status: signupMode === "closed" || signupMode === "invite" ? "pass" : "warn",
      detail: `Current mode: ${signupMode}. For private production, use closed or invite-only sign-up and disable public registration in Supabase Auth.`,
      action: "Set APP_SIGNUP_MODE=invite or APP_SIGNUP_MODE=closed and configure Supabase Auth accordingly.",
    },
  ];
}

export const platformModelItems = [
  {
    title: "Household tenancy",
    detail: "A household layer now sits above person, finance, investment and lifestyle data so the app can safely support shared access later.",
  },
  {
    title: "Privacy-preserving audit logs",
    detail: "Sensitive table changes are logged by table, record, changed columns and hashes rather than storing raw financial values in the audit log.",
  },
  {
    title: "Export jobs",
    detail: "A first-class export-job table exists so data export/download flows can be added without mixing them into page actions.",
  },
  {
    title: "Formal migration path",
    detail: "The V21/V22 schemas are duplicated into supabase/migrations so we can move to Supabase CLI-style migrations cleanly.",
  },
];
