import Link from "next/link";
import { Suspense } from "react";
import { NotConnected } from "@/components/not-connected";
import { StatTile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth";
import { proposalsForSentry, type Status } from "@/lib/fixes";
import { getQuality, sentryConfigured, type Issue } from "@/lib/sentry";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTimeIST } from "@/lib/time";
import { proposeFix } from "../fixes/actions";

export const metadata = { title: "Quality · MarinePrep HQ" };
// "Propose fix" fetches the Sentry event before returning.
export const maxDuration = 60;

type Queued = Map<string, { id: string; status: Status }>;

const DAYS = 7;

export default function QualityPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Quality</h1>
        <p className="text-sm text-ink-2">Sentry · session health for {DAYS} days, open issues for 14 days</p>
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Loading from Sentry…</p>}>
        <QualityBody />
      </Suspense>
    </div>
  );
}

async function QualityBody() {
  await requireAdmin();
  if (!sentryConfigured()) return <NotConnected service="Sentry" />;

  let q;
  try {
    q = await getQuality(DAYS);
  } catch (e) {
    return <p className="card p-4 text-sm text-critical">Couldn&apos;t load Sentry: {(e as Error).message}</p>;
  }

  const rate = (r: number | null) => (r === null ? "–" : `${(r * 100).toFixed(2)}%`);
  const n = (v: number) => v.toLocaleString("en-IN");

  const unhandled = q.issues.filter((i) => i.unhandled && !i.noise);
  const errors = q.issues.filter((i) => !i.unhandled && !i.noise);
  const noise = q.issues.filter((i) => i.noise);
  const events = (list: Issue[]) => list.reduce((s, i) => s + i.events, 0);
  // null hides the "Propose fix" buttons when the Fix queue isn't available.
  const queued: Queued | null = createServiceClient()
    ? await proposalsForSentry([...unhandled, ...errors].map((i) => i.shortId))
    : null;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Error-free sessions"
          value={rate(q.errorFreeSessions)}
          sub={`Users ${rate(q.errorFreeUsers)} · crash-free ${rate(q.crashFreeSessions)} (Dart errors aren't crashes)`}
        />
        <StatTile label="Unhandled errors" value={n(unhandled.length)} sub={`${n(events(unhandled))} events · usually a broken screen`} />
        <StatTile label="Errors to review" value={n(errors.length)} sub={`${n(events(errors))} events`} />
        <StatTile label="Expected noise" value={n(noise.length)} sub={`${n(events(noise))} events (OTP, network, fallbacks)`} />
      </section>

      <IssueList title="Unhandled errors" empty="No unhandled errors in 14 days." issues={unhandled} queued={queued} />
      <IssueList title="Errors worth a look" empty="Nothing besides expected errors." issues={errors} queued={queued} />

      {noise.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-medium">
            Expected errors <span className="text-sm font-normal text-ink-3">({noise.length})</span>
          </summary>
          <p className="mt-2 text-xs text-ink-3">
            Wrong OTPs, OTP limits, network drops and cache fallbacks the app reports as errors. Worth downgrading to
            breadcrumbs in the app so real problems stand out.
          </p>
          <IssueRows issues={noise} />
        </details>
      )}
    </>
  );
}

function IssueList({
  title,
  empty,
  issues,
  queued,
}: {
  title: string;
  empty: string;
  issues: Issue[];
  queued: Queued | null;
}) {
  return (
    <section className="card p-4">
      <h2 className="font-medium">{title}</h2>
      {issues.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{empty}</p>
      ) : (
        <IssueRows issues={issues} queued={queued} />
      )}
    </section>
  );
}

function IssueRows({ issues, queued = null }: { issues: Issue[]; queued?: Queued | null }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {issues.map((i) => (
        <li key={i.id} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <a href={i.permalink} target="_blank" rel="noreferrer" className="min-w-0 hover:underline">
            <span className="mr-2 font-mono text-xs text-ink-3">{i.shortId}</span>
            <span className="text-ink">{i.title}</span>
            {i.culprit && <span className="block truncate text-xs text-ink-3">{i.culprit}</span>}
          </a>
          <span className="flex shrink-0 items-center gap-3 text-xs text-ink-3 tabular-nums">
            {i.users.toLocaleString("en-IN")} users · {i.events.toLocaleString("en-IN")} events · {formatTimeIST(i.lastSeen)}
            {queued && <QueueAction shortId={i.shortId} queued={queued.get(i.shortId)} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function QueueAction({ shortId, queued }: { shortId: string; queued?: { id: string; status: Status } }) {
  if (queued) {
    return (
      <Link href={`/fixes#${queued.id}`} className="text-accent hover:underline">
        In fix queue ({queued.status})
      </Link>
    );
  }
  return (
    <form action={proposeFix}>
      <input type="hidden" name="shortId" value={shortId} />
      <button className="rounded border border-line px-2 py-1 text-ink-2 hover:text-ink">Propose fix</button>
    </form>
  );
}
