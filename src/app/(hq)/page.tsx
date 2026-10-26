import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatTile } from "@/components/stat-tile";
import { getOverview } from "@/lib/metrics/overview";
import { formatINR, formatTimeIST } from "@/lib/time";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-ink-2">Live from Supabase · times in IST</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Loading live numbers…</p>}>
        <OverviewBody />
      </Suspense>
    </div>
  );
}

async function OverviewBody() {
  const o = await getOverview();
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      {!o.fullAccess && (
        <p className="card border-warning/40 p-3 text-sm text-ink-2">
          Running on your login. Mock-test numbers need <code>SUPABASE_SERVICE_ROLE_KEY</code>; see
          Connections.
        </p>
      )}

      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Signups today" value={n(o.signups.today)} sub={`${n(o.signups.last7)} in 7 days · ${n(o.signups.total)} total`} />
        <StatTile label="Purchases today" value={n(o.purchases.today)} sub={`${n(o.purchases.last7)} in 7 days`} />
        <StatTile
          label="Mocks today"
          value={o.mocks ? n(o.mocks.startedToday) : ""}
          sub={o.mocks ? `${n(o.mocks.completedToday)} completed` : undefined}
          note={o.mocks ? undefined : "Needs service key"}
        />
        <StatTile label="IMUCET 2027" value={`${o.daysToExam} days`} sub="Expected late May (estimate)" />
      </section>

      <section aria-label="Revenue and usage" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue, 7 days" value={formatINR(o.revenue.last7)} sub="Gross, Razorpay + App Store" />
        <StatTile
          label="Revenue, 30 days"
          value={formatINR(o.revenue.last30)}
          sub={`${formatINR(o.revenue.razorpayLast30)} Razorpay · ${formatINR(o.revenue.appleLast30)} App Store`}
        />
        <StatTile
          label="App Store purchases, 30 days"
          value={n(o.purchases.appleLast30)}
          sub="Before Apple's commission · Sandbox excluded"
        />
        <StatTile label="Active subscriptions" value={n(o.activeSubscriptions)} sub={`${n(o.aiMessagesToday)} AI messages today`} />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-medium">Latest activity</h2>
        {o.activity.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {o.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span
                    className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      a.kind === "purchase" ? "bg-good/15 text-good" : "bg-accent/15 text-accent"
                    }`}
                  >
                    {a.kind === "purchase" ? "Purchase" : "Signup"}
                  </span>
                  <span className="text-ink">{a.who}</span>
                  <span className="text-ink-2"> · {a.detail}</span>
                </span>
                <time dateTime={a.at} className="shrink-0 text-xs text-ink-3 tabular-nums">
                  {formatTimeIST(a.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
