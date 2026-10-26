import "server-only";
import { cacheLife } from "next/cache";

// Funnel steps, in order. Names must match what the Flutter app sends.
// "Application Installed" is left out: it's recorded under an anonymous ID that the app
// never merges into the logged-in person, so almost no installer links to a later step.
export const FUNNEL_STEPS = [
  { event: "otp_requested", label: "Requested OTP" },
  { event: "user_logged_in", label: "Logged in" },
  { event: "onboarding_completed", label: "Finished onboarding" },
  { event: "upgrade_page_viewed", label: "Saw the paywall" },
  { event: "billing_page_opened", label: "Opened billing" },
] as const;

// Features whose weekly reach the Funnel page shows.
export const FEATURE_EVENTS = [
  { event: "mock_test_started", label: "Started a mock" },
  { event: "mock_test_submitted", label: "Submitted a mock" },
  { event: "question_bank_opened", label: "Opened question bank" },
  { event: "notes_opened", label: "Opened notes" },
  { event: "ai_query_sent", label: "Asked Marine AI" },
  { event: "search_performed", label: "Searched" },
] as const;

export type FunnelStep = { label: string; count: number };
export type Funnel = {
  total: FunnelStep[];
  byPlatform: { platform: string; steps: FunnelStep[] }[];
  /** Install events in the same window, by OS (not linkable to the funnel). */
  installs: { platform: string; count: number }[];
};
export type FeatureReach = { label: string; users: number };

export function posthogConfigured() {
  return !!(process.env.POSTHOG_PROJECT_ID && process.env.POSTHOG_PERSONAL_API_KEY);
}

async function query<T>(body: Record<string, unknown>): Promise<T> {
  const region = process.env.POSTHOG_REGION || "us";
  const res = await fetch(
    `https://${region}.posthog.com/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: body }),
    },
  );
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

type RawStep = { name: string; order: number; count: number; breakdown_value?: string | string[] };

/** Ordered funnel over the last `days`, with a 14-day conversion window, split by OS. */
export async function getFunnel(days: number): Promise<Funnel> {
  "use cache";
  cacheLife("minutes");

  const series = FUNNEL_STEPS.map((s) => ({ kind: "EventsNode", event: s.event }));
  const base = {
    kind: "FunnelsQuery",
    series,
    dateRange: { date_from: `-${days}d` },
    funnelsFilter: { funnelWindowInterval: 14, funnelWindowIntervalUnit: "day" },
    filterTestAccounts: true,
  };

  const [total, split, installs] = await Promise.all([
    query<{ results: RawStep[] }>(base),
    query<{ results: RawStep[][] }>({
      ...base,
      breakdownFilter: { breakdown: "$os", breakdown_type: "event" },
    }),
    query<{ results: [string | null, number][] }>({
      kind: "HogQLQuery",
      query: `SELECT properties.$os, count() FROM events
              WHERE event = 'Application Installed' AND timestamp > now() - INTERVAL ${days} DAY
              GROUP BY properties.$os ORDER BY count() DESC`,
      filters: { filterTestAccounts: true },
    }),
  ]);

  const toSteps = (raw: RawStep[]) =>
    [...raw]
      .sort((a, b) => a.order - b.order)
      .map((r, i) => ({ label: FUNNEL_STEPS[i]?.label ?? r.name, count: r.count }));

  return {
    total: toSteps(total.results),
    byPlatform: split.results
      .map((steps) => {
        const v = steps[0]?.breakdown_value;
        return { platform: (Array.isArray(v) ? v[0] : v) || "Unknown", steps: toSteps(steps) };
      })
      .sort((a, b) => b.steps[0].count - a.steps[0].count),
    installs: installs.results.map(([platform, count]) => ({ platform: platform || "Unknown", count: Number(count) })),
  };
}

/** Distinct users who did each feature event in the last 7 days. */
export async function getFeatureReach(): Promise<FeatureReach[]> {
  "use cache";
  cacheLife("minutes");

  const names = FEATURE_EVENTS.map((f) => `'${f.event}'`).join(", ");
  const res = await query<{ results: [string, number][] }>({
    kind: "HogQLQuery",
    query: `SELECT event, count(DISTINCT person_id) FROM events
            WHERE event IN (${names}) AND timestamp > now() - INTERVAL 7 DAY
            GROUP BY event`,
    filters: { filterTestAccounts: true },
  });
  const byEvent = new Map(res.results.map(([e, n]) => [e, Number(n)]));
  return FEATURE_EVENTS.map((f) => ({ label: f.label, users: byEvent.get(f.event) ?? 0 }));
}
