import "server-only";
import { cacheLife } from "next/cache";

export type Issue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  events: number;
  users: number;
  lastSeen: string;
  /** Not caught by app code. In Flutter this usually breaks a screen rather than closing the app. */
  unhandled: boolean;
  /** Expected failures (wrong OTP, no network, cache fallbacks) that are reported as errors. */
  noise: boolean;
};

export type Quality = {
  crashFreeSessions: number | null;
  crashFreeUsers: number | null;
  /**
   * Share of sessions/users with no error at all. Flutter Dart errors don't crash the app, so
   * crash-free stays near 100%; Sentry marks those sessions "errored" instead.
   */
  errorFreeSessions: number | null;
  errorFreeUsers: number | null;
  /** One point per day, oldest first. */
  dailyCrashFreeSessions: { day: string; rate: number | null }[];
  /** Share of each day's sessions with no error, oldest first; null on days without sessions. */
  dailyErrorFreeSessions: { day: string; rate: number | null }[];
  issues: Issue[];
};

export function sentryConfigured() {
  return !!(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN);
}

const base = () => `${process.env.SENTRY_BASE_URL || "https://sentry.io"}/api/0`;

async function sentry<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Sentry ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Errors the app reports on purpose: user typos, OTP limits, flaky networks and
// handled fallbacks. Not bugs, but they currently make up most of Sentry's volume.
const NOISE = [
  /\botp\b/i,
  /code: 70[345]\b/, // MSG91: wrong OTP, too many retries, expired request
  /network error/i,
  /failed host lookup/i,
  /handshakeexception/i,
  /socketexception/i,
  /authretryablefetchexception/i,
  /connection (closed|reset|terminated)/i,
  /ignoring stream error/i,
  /trying cache/i,
];

export function isNoise(title: string) {
  return NOISE.some((re) => re.test(title));
}

type RawIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  count: string;
  userCount: number;
  lastSeen: string;
  isUnhandled?: boolean;
};

type Sessions = {
  intervals: string[];
  groups: {
    by: Record<string, string>;
    totals: Record<string, number | null>;
    series: Record<string, (number | null)[]>;
  }[];
};

export async function getQuality(days: number): Promise<Quality> {
  "use cache";
  cacheLife("minutes");

  const org = process.env.SENTRY_ORG;
  const slug = process.env.SENTRY_PROJECT;
  const project = await sentry<{ id: string }>(`/projects/${org}/${slug}/`);

  const sessionsQuery = new URLSearchParams({
    project: project.id,
    statsPeriod: `${days}d`,
    interval: "1d",
  });
  sessionsQuery.append("field", "crash_free_rate(session)");
  sessionsQuery.append("field", "crash_free_rate(user)");
  sessionsQuery.append("field", "count_unique(user)");

  const statusQuery = new URLSearchParams({
    project: project.id,
    statsPeriod: `${days}d`,
    interval: "1d",
    groupBy: "session.status",
  });
  statusQuery.append("field", "sum(session)");
  statusQuery.append("field", "count_unique(user)");

  const issuesQuery = new URLSearchParams({
    query: "is:unresolved",
    statsPeriod: "14d",
    sort: "freq",
    limit: "25",
  });

  const [sessions, byStatus, rawIssues] = await Promise.all([
    sentry<Sessions>(`/organizations/${org}/sessions/?${sessionsQuery}`),
    sentry<Sessions>(`/organizations/${org}/sessions/?${statusQuery}`),
    sentry<RawIssue[]>(`/projects/${org}/${slug}/issues/?${issuesQuery}`),
  ]);

  const group = sessions.groups[0];
  const daily = group?.series["crash_free_rate(session)"] ?? [];

  // Statuses: healthy, errored, crashed, abnormal. A user with both an errored and an abnormal
  // session is counted twice, so error-free users errs on the low (conservative) side.
  const sumBy = (field: string, pick: (status: string) => boolean) =>
    byStatus.groups
      .filter((g) => pick(g.by["session.status"]))
      .reduce((s, g) => s + Number(g.totals[field] ?? 0), 0);
  const totalSessions = sumBy("sum(session)", () => true);
  const badSessions = sumBy("sum(session)", (st) => st !== "healthy");
  const totalUsers = Number(group?.totals["count_unique(user)"] ?? 0);
  const badUsers = sumBy("count_unique(user)", (st) => st !== "healthy");

  return {
    crashFreeSessions: group?.totals["crash_free_rate(session)"] ?? null,
    crashFreeUsers: group?.totals["crash_free_rate(user)"] ?? null,
    errorFreeSessions: totalSessions ? 1 - badSessions / totalSessions : null,
    errorFreeUsers: totalUsers ? Math.max(0, 1 - badUsers / totalUsers) : null,
    dailyCrashFreeSessions: sessions.intervals.map((day, i) => ({ day, rate: daily[i] ?? null })),
    dailyErrorFreeSessions: byStatus.intervals.map((day, i) => {
      const at = (pick: (status: string) => boolean) =>
        byStatus.groups
          .filter((g) => pick(g.by["session.status"]))
          .reduce((s, g) => s + Number(g.series["sum(session)"]?.[i] ?? 0), 0);
      const total = at(() => true);
      return { day, rate: total ? 1 - at((st) => st !== "healthy") / total : null };
    }),
    issues: rawIssues.map((i) => ({
      id: i.id,
      shortId: i.shortId,
      title: i.title,
      culprit: i.culprit,
      permalink: i.permalink,
      events: Number(i.count),
      users: i.userCount,
      lastSeen: i.lastSeen,
      unhandled: !!i.isUnhandled,
      noise: isNoise(i.title),
    })),
  };
}

export type IssueDetail = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  events: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  unhandled: boolean;
  release: string | null;
  os: string | null;
  loggerTag: string | null;
  /** The exception chain with in-app frames only, innermost last. */
  exceptions: { type: string; value: string; frames: string[] }[];
  /** The last breadcrumbs before the event. */
  breadcrumbs: string[];
};

type RawEvent = {
  release?: { version?: string } | string | null;
  tags?: { key: string; value: string }[];
  entries?: { type: string; data: { values?: unknown[] } }[];
};

type RawException = {
  type?: string;
  value?: string;
  stacktrace?: { frames?: { inApp?: boolean; filename?: string; lineNo?: number; function?: string }[] };
};

type RawBreadcrumb = { category?: string; message?: string | null };

/** One issue with its latest event: what a fix proposal needs as evidence. Not cached. */
export async function getIssueDetail(shortId: string): Promise<IssueDetail> {
  const org = process.env.SENTRY_ORG;
  const { groupId } = await sentry<{ groupId: string }>(`/organizations/${org}/shortids/${encodeURIComponent(shortId)}/`);
  const [issue, event] = await Promise.all([
    sentry<RawIssue & { firstSeen: string }>(`/organizations/${org}/issues/${groupId}/`),
    sentry<RawEvent>(`/organizations/${org}/issues/${groupId}/events/latest/`),
  ]);

  const tag = (key: string) => event.tags?.find((t) => t.key === key)?.value ?? null;
  const entry = (type: string) => event.entries?.find((e) => e.type === type)?.data.values ?? [];

  const exceptions = (entry("exception") as RawException[]).map((x) => ({
    type: x.type ?? "",
    value: (x.value ?? "").slice(0, 500),
    frames: (x.stacktrace?.frames ?? [])
      .filter((f) => f.inApp)
      .slice(-12)
      .map((f) => `${f.filename}:${f.lineNo} ${f.function ?? ""}`.trim()),
  }));
  const breadcrumbs = (entry("breadcrumbs") as RawBreadcrumb[])
    .slice(-10)
    .map((b) => `${b.category ?? "log"}: ${(b.message ?? "").slice(0, 200)}`);

  return {
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    culprit: issue.culprit,
    permalink: issue.permalink,
    events: Number(issue.count),
    users: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    unhandled: !!issue.isUnhandled,
    release: typeof event.release === "string" ? event.release : (event.release?.version ?? null),
    os: tag("os.name"),
    loggerTag: tag("logger_tag"),
    exceptions,
    breadcrumbs,
  };
}
