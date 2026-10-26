import "server-only";

export type Connection = {
  name: string;
  purpose: string;
  env: string[];
  /** Only needed for extra features (e.g. webhooks); the integration works without them. */
  optional?: string[];
};

export const connections: Connection[] = [
  { name: "Supabase (service key)", purpose: "Cross-user counts: mocks, funnel steps", env: ["SUPABASE_SERVICE_ROLE_KEY"] },
  { name: "PostHog", purpose: "Funnels, retention, paywall by source", env: ["POSTHOG_REGION", "POSTHOG_PROJECT_ID", "POSTHOG_PERSONAL_API_KEY"] },
  { name: "Sentry", purpose: "Crash-free rate, top issues, live alerts", env: ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"], optional: ["SENTRY_WEBHOOK_SECRET"] },
  { name: "Google Play", purpose: "Reviews, vitals, installs", env: ["GOOGLE_PLAY_SERVICE_ACCOUNT_B64", "GOOGLE_PLAY_REPORTS_BUCKET"] },
  { name: "App Store Connect", purpose: "Reviews, downloads, IAP sales", env: ["APP_STORE_ISSUER_ID", "APP_STORE_KEY_ID", "APP_STORE_PRIVATE_KEY_B64", "APP_STORE_VENDOR_NUMBER"] },
  {
    name: "Telegram",
    purpose: "Alerts, daily brief and approve/reject buttons",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_IDS"],
    optional: ["TELEGRAM_WEBHOOK_SECRET"],
  },
  { name: "GitHub", purpose: "Approved fixes become issues in the app repo", env: ["GITHUB_TOKEN", "GITHUB_REPO"] },
  { name: "Claude", purpose: "Root cause and fix drafts, review themes", env: ["ANTHROPIC_API_KEY"] },
  { name: "Deployment", purpose: "Daily cron and links back to HQ", env: ["CRON_SECRET", "HQ_URL"] },
];

/** Which variables are set. Never returns the values. */
export function connectionStatus() {
  return connections.map((c) => {
    const missing = c.env.filter((k) => !process.env[k]);
    const missingOptional = (c.optional ?? []).filter((k) => !process.env[k]);
    return { ...c, missing, missingOptional, ready: missing.length === 0 };
  });
}
