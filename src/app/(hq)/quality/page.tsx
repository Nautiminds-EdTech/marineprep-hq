import { Bug, CircleAlert, ExternalLink, ShieldCheck, Sparkles, TriangleAlert, Users, VolumeX, Zap } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Meter } from "@/components/meter";
import { NotConnected } from "@/components/not-connected";
import { Notice } from "@/components/notice";
import { PageHeader, Section } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeleton";
import { StatTile } from "@/components/stat-tile";
import { TrendChart } from "@/components/trend-chart";
import { requireAdmin } from "@/lib/auth";
import { proposalsForSentry, type Status } from "@/lib/fixes";
import { getQuality, sentryConfigured, type Issue } from "@/lib/sentry";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDay, formatTimeIST, timeAgo } from "@/lib/time";
import { proposeFix } from "../fixes/actions";

export const metadata = { title: "Quality · MarinePrep HQ" };
// "Propose fix" fetches the Sentry event before returning.
export const maxDuration = 60;

type Queued = Map<string, { id: string; status: Status }>;

const DAYS = 7;

export default function QualityPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quality"
        description={`Sentry. Session health for ${DAYS} days, open issues for 14 days.`}
      />
      <Suspense fallback={<PageSkeleton label="Loading from Sentry" />}>
        <QualityBody />
      </Suspense>
    </div>
  );
}

const TONE_TEXT = { accent: "text-ink-2", good: "text-good", warning: "text-warning", critical: "text-critical" };
const rate = (r: number | null) => (r === null ? "–" : `${(r * 100).toFixed(2)}%`);
const n = (v: number) => v.toLocaleString("en-IN");

async function QualityBody() {
  await requireAdmin();
  if (!sentryConfigured()) return <NotConnected service="Sentry" />;

  let q;
  try {
    q = await getQuality(DAYS);
  } catch (e) {
    return <Notice tone="critical">Couldn&apos;t load Sentry: {(e as Error).message}</Notice>;
  }

  const unhandled = q.issues.filter((i) => i.unhandled && !i.noise);
  const errors = q.issues.filter((i) => !i.unhandled && !i.noise);
  const noise = q.issues.filter((i) => i.noise);
  const events = (list: Issue[]) => list.reduce((s, i) => s + i.events, 0);
  // null hides the "Propose fix" buttons when the Fix queue isn't available.
  const queued: Queued | null = createServiceClient()
    ? await proposalsForSentry([...unhandled, ...errors].map((i) => i.shortId))
    : null;

  const health = q.errorFreeSessions;
  const tone = health === null ? "accent" : health >= 0.995 ? "good" : health >= 0.98 ? "warning" : "critical";
  const verdict =
    health === null
      ? "No sessions reported yet"
      : tone === "good"
        ? "Healthy"
        : tone === "warning"
          ? "Some sessions hit errors"
          : "Many sessions hit errors";
  const noiseShare = events(q.issues) ? events(noise) / events(q.issues) : 0;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Error-free sessions"
          description="Sessions with no error at all. Dart errors don't crash the app, so this is the number to watch."
          className="lg:col-span-2"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8">
            <div className="flex min-w-0 flex-col gap-2 sm:w-56 sm:shrink-0">
              <p className="display-num text-5xl text-ink">{rate(health)}</p>
              <p className={`flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[tone]}`}>
                {tone === "good" ? <ShieldCheck size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />}
                {verdict}
              </p>
              {health !== null && <Meter value={health} tone={tone} label="Error-free sessions" />}
              <dl className="mt-1 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-ink-3">Error-free users</dt>
                  <dd className="display-num text-base text-ink">{rate(q.errorFreeUsers)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Crash-free sessions</dt>
                  <dd className="display-num text-base text-ink">{rate(q.crashFreeSessions)}</dd>
                </div>
              </dl>
            </div>
            <div className="min-w-0 flex-1">
              <TrendChart
                kind="line"
                format="percent"
                title={`Error-free sessions per day, last ${DAYS} days`}
                height={150}
                points={q.dailyErrorFreeSessions.map((d) => ({ label: formatDay(d.day.slice(0, 10)), value: d.rate }))}
              />
            </div>
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <StatTile
            label="Unhandled errors"
            icon={Zap}
            value={n(unhandled.length)}
            sub={`${n(events(unhandled))} events · usually a broken screen`}
            tone={unhandled.length ? "critical" : "good"}
          />
          <StatTile label="Errors to review" icon={Bug} value={n(errors.length)} sub={`${n(events(errors))} events`} />
          <div className="col-span-2 lg:col-span-1">
            <StatTile
              label="Expected noise"
              icon={VolumeX}
              value={`${Math.round(noiseShare * 100)}%`}
              sub={`of all events · ${n(noise.length)} issues (OTP, network, fallbacks)`}
            />
          </div>
        </div>
      </div>

      <IssueList
        title="Unhandled errors"
        description="Not caught by app code. Fix these first."
        empty="No unhandled errors in 14 days."
        issues={unhandled}
        queued={queued}
        severity="critical"
      />
      <IssueList
        title="Errors worth a look"
        description="Caught and reported by the app"
        empty="Nothing besides expected errors."
        issues={errors}
        queued={queued}
        severity="warning"
      />

      {noise.length > 0 && (
        <details className="card group p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-display text-base font-semibold">Expected errors</span>{" "}
              <span className="text-sm text-ink-3">({noise.length})</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                Wrong OTPs, OTP limits, network drops and cache fallbacks the app reports as errors
              </span>
            </span>
            <span className="btn btn-sm shrink-0">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <p className="mt-3 text-xs text-ink-3">
            Worth downgrading to breadcrumbs in the app so real problems stand out.
          </p>
          <IssueRows issues={noise} severity="muted" />
        </details>
      )}
    </>
  );
}

function IssueList({
  title,
  description,
  empty,
  issues,
  queued,
  severity,
}: {
  title: string;
  description: string;
  empty: string;
  issues: Issue[];
  queued: Queued | null;
  severity: "critical" | "warning";
}) {
  return (
    <Section title={`${title} (${issues.length})`} description={description}>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <ShieldCheck size={16} className="text-good" aria-hidden /> {empty}
        </p>
      ) : (
        <IssueRows issues={issues} queued={queued} severity={severity} />
      )}
    </Section>
  );
}

function IssueRows({
  issues,
  queued = null,
  severity,
}: {
  issues: Issue[];
  queued?: Queued | null;
  severity: "critical" | "warning" | "muted";
}) {
  const icon = {
    critical: <CircleAlert size={16} className="text-critical" aria-label="Unhandled" />,
    warning: <TriangleAlert size={16} className="text-warning" aria-label="Error" />,
    muted: <VolumeX size={16} className="text-ink-3" aria-label="Expected" />,
  }[severity];
  return (
    <ul className="-mx-1 flex flex-col divide-y divide-line">
      {issues.map((i) => (
        <li key={i.id} className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-1 gap-3">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div className="min-w-0">
              <a
                href={i.permalink}
                target="_blank"
                rel="noreferrer"
                className="group/link line-clamp-2 text-sm font-medium break-words text-ink hover:text-accent"
              >
                {i.title}
                <ExternalLink size={12} className="ml-1 inline align-baseline opacity-0 group-hover/link:opacity-60" aria-hidden />
              </a>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="font-mono">{i.shortId}</span>
                <span className="inline-flex items-center gap-1">
                  <Users size={12} aria-hidden /> {n(i.users)}
                </span>
                <span>{n(i.events)} events</span>
                <time dateTime={i.lastSeen} title={formatTimeIST(i.lastSeen)}>
                  {timeAgo(i.lastSeen)}
                </time>
              </p>
              {i.culprit && <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{i.culprit}</p>}
            </div>
          </div>
          {queued && (
            <div className="pl-7 sm:pl-0">
              <QueueAction shortId={i.shortId} queued={queued.get(i.shortId)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function QueueAction({ shortId, queued }: { shortId: string; queued?: { id: string; status: Status } }) {
  if (queued) {
    return (
      <Link href={`/fixes#${queued.id}`} className="chip bg-accent-soft py-1 text-accent hover:underline">
        In fix queue · {queued.status}
      </Link>
    );
  }
  return (
    <form action={proposeFix}>
      <input type="hidden" name="shortId" value={shortId} />
      <button className="btn btn-sm">
        <Sparkles size={13} aria-hidden /> Propose fix
      </button>
    </form>
  );
}
