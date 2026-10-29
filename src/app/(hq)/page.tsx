import {
  BookOpen,
  CalendarClock,
  IndianRupee,
  MessageSquare,
  ShoppingCart,
  UserPlus,
  Users,
} from "lucide-react";
import { Suspense } from "react";
import { AttentionList, type Signal } from "@/components/attention-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice } from "@/components/notice";
import { PageHeader, Section } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeleton";
import { StatTile } from "@/components/stat-tile";
import { TrendChart } from "@/components/trend-chart";
import { getAttention, type Attention } from "@/lib/attention";
import { getOverview, SERIES_DAYS, type Overview } from "@/lib/metrics/overview";
import { formatDay, formatINR, formatTimeIST, formatTodayIST, timeAgo } from "@/lib/time";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Signups, sales and study activity, live from Supabase. Times in IST."
        actions={<AutoRefresh seconds={30} />}
      />
      <Suspense fallback={<PageSkeleton label="Loading live numbers" />}>
        <OverviewBody />
      </Suspense>
    </div>
  );
}

const n = (v: number) => v.toLocaleString("en-IN");
const change = (now: number, before: number) => (before ? now / before - 1 : null);

async function OverviewBody() {
  const [o, attention] = await Promise.all([getOverview(), getAttention()]);
  const last14 = o.series.slice(-14);
  const sum = (key: "revenue" | "purchases") => (days: number) =>
    o.series.slice(-days).reduce((s, d) => s + d[key], 0);
  const signals = buildSignals(o, attention);
  const season = o.seasonProgress;

  return (
    <>
      <p className="-mt-3 text-sm text-ink-3">{formatTodayIST()}</p>

      {!o.fullAccess && (
        <Notice tone="warning">
          Running on your login. Mock-test numbers need <code>SUPABASE_SERVICE_ROLE_KEY</code>; see Connections.
        </Notice>
      )}

      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Signups today"
          icon={UserPlus}
          value={n(o.signups.today)}
          delta={{ change: change(o.signups.last7, o.signups.prev7), label: "this week" }}
          sub={`${n(o.signups.last7)} in 7 days`}
          trend={last14.map((d) => d.signups)}
        />
        <StatTile
          label="Revenue, 30 days"
          icon={IndianRupee}
          value={formatINR(o.revenue.last30)}
          sub={`${formatINR(o.revenue.last7)} in 7 days`}
          trend={o.series.map((d) => d.revenue)}
        />
        <StatTile
          label="Mocks today"
          icon={BookOpen}
          value={o.mocks ? n(o.mocks.startedToday) : ""}
          sub={o.mocks ? `${n(o.mocks.completedToday)} completed` : undefined}
          note={o.mocks ? undefined : "Needs service key"}
          trend={o.mocks ? last14.map((d) => d.mocks ?? 0) : undefined}
        />
        <StatTile
          label="Active subscriptions"
          icon={Users}
          value={n(o.activeSubscriptions)}
          sub={`${n(o.signups.total)} students in total`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Needs your attention"
          description="Worked out from the numbers on this page"
          className="lg:order-2"
        >
          <AttentionList signals={signals} empty="Nothing needs you right now." />
        </Section>

        <Section
          title="Signups per day"
          description={`Last ${SERIES_DAYS} days · ${n(o.series.reduce((s, d) => s + d.signups, 0))} in total · today is still counting`}
          className="lg:order-1 lg:col-span-2"
        >
          <TrendChart
            title={`Signups per day, last ${SERIES_DAYS} days`}
            points={o.series.map((d) => ({ label: formatDay(d.day), value: d.signups }))}
            partialLast
          />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Sales" description="Gross, before Apple's commission · Sandbox excluded" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Figure label="Purchases today" value={n(o.purchases.today)} />
            <Figure label="Purchases, 7 days" value={n(o.purchases.last7)} />
            <Figure label="Razorpay, 30 days" value={formatINR(o.revenue.razorpayLast30)} />
            <Figure
              label="App Store, 30 days"
              value={formatINR(o.revenue.appleLast30)}
              sub={`${n(o.purchases.appleLast30)} purchases`}
            />
          </dl>
          <p className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
            <ShoppingCart size={14} aria-hidden />
            {o.lastPurchaseAt
              ? `Last plan sale ${timeAgo(o.lastPurchaseAt)} (${formatTimeIST(o.lastPurchaseAt)})`
              : "No plan sale recorded yet"}
            {sum("purchases")(30) > 0 && ` · ${n(sum("purchases")(30))} in 30 days`}
          </p>
        </Section>

        <section className="card flex flex-col gap-4 bg-[linear-gradient(135deg,var(--hull),var(--hull-2))] p-4 text-hull-ink sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">IMUCET 2027</h2>
            <CalendarClock size={18} className="text-hull-accent" aria-hidden />
          </div>
          <p>
            <span className="display-num text-5xl text-white">{o.daysToExam}</span>
            <span className="ml-2 text-sm text-hull-ink-2">days to go</span>
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-hull-accent" style={{ width: `${Math.min(100, season * 100)}%` }} />
            </div>
            <p className="flex justify-between text-[11px] text-hull-ink-2">
              <span>Season {Math.round(season * 100)}% through</span>
              <span>Expected late May (estimate)</span>
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-hull-ink-2">
            <MessageSquare size={14} aria-hidden /> {n(o.aiMessagesToday)} Marine AI messages today
          </p>
        </section>
      </div>

      <Section title="Latest activity" description="Newest signups and purchases">
        {o.activity.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing yet.</p>
        ) : (
          <ol className="relative flex flex-col">
            {o.activity.map((a, i) => (
              <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < o.activity.length - 1 && (
                  <span className="absolute top-8 bottom-0 left-[15px] w-px bg-line" aria-hidden />
                )}
                <span
                  className={`z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    a.kind === "purchase" ? "bg-good-soft text-good" : "bg-accent-soft text-accent"
                  }`}
                >
                  {a.kind === "purchase" ? <IndianRupee size={15} aria-hidden /> : <UserPlus size={15} aria-hidden />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col pt-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <p className="min-w-0 truncate text-sm">
                    <span className="font-medium text-ink">{a.who}</span>
                    <span className="text-ink-2"> · {a.detail}</span>
                  </p>
                  <time dateTime={a.at} className="shrink-0 text-xs text-ink-3" title={formatTimeIST(a.at)}>
                    {timeAgo(a.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="display-num text-2xl text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

/** Plain-language signals from the numbers already loaded. No extra queries, no AI. */
function buildSignals(o: Overview, a: Attention): Signal[] {
  const signals: Signal[] = [];
  if (a.fixesWaiting) {
    signals.push({
      tone: "warning",
      title: `${a.fixesWaiting} fix ${a.fixesWaiting === 1 ? "proposal waits" : "proposals wait"} for approval`,
      detail: "Approving opens a GitHub issue",
      href: "/fixes",
    });
  }
  if (a.reviewsUnanswered) {
    signals.push({
      tone: "warning",
      title: `${a.reviewsUnanswered} low ${a.reviewsUnanswered === 1 ? "review has" : "reviews have"} no reply`,
      detail: "1–3★ in the last 30 days. Replies lift ratings.",
      href: "/reviews?low=1",
    });
  }
  if (a.postsWaiting) {
    signals.push({
      tone: "warning",
      title: `${a.postsWaiting} blog ${a.postsWaiting === 1 ? "post waits" : "posts wait"} for approval`,
      detail: "Approve in HQ or on Telegram to publish",
      href: "/seo/posts?view=waiting",
    });
  }

  const daysSinceSale = o.lastPurchaseAt ? Math.floor((Date.now() - Date.parse(o.lastPurchaseAt)) / 86_400_000) : null;
  if (daysSinceSale === null || daysSinceSale >= 7) {
    signals.push({
      tone: daysSinceSale === null || daysSinceSale >= 30 ? "critical" : "warning",
      title: daysSinceSale === null ? "No plan sale recorded yet" : `No plan sale in ${daysSinceSale} days`,
      detail: "See where people leave on the Funnel page",
      href: "/funnel",
    });
  }

  const wow = change(o.signups.last7, o.signups.prev7);
  if (wow !== null && Math.abs(wow) >= 0.15) {
    signals.push({
      tone: wow > 0 ? "good" : "warning",
      title: `Signups ${wow > 0 ? "up" : "down"} ${Math.abs(Math.round(wow * 100))}% this week`,
      detail: `${n(o.signups.last7)} in the last 7 days against ${n(o.signups.prev7)} the week before`,
    });
  }

  const week = o.series.slice(-8, -1);
  const avg = week.reduce((s, d) => s + d.signups, 0) / (week.length || 1);
  const best = o.series.slice(0, -1).reduce((m, d) => (d.signups > m.signups ? d : m), o.series[0]);
  if (best && best.signups > avg * 2 && best.signups >= 5) {
    signals.push({
      tone: "info",
      title: `Best day this month: ${formatDay(best.day)}, ${n(best.signups)} signups`,
      detail: `About ${Math.round(best.signups / Math.max(avg, 1))}× a typical day this week. Worth checking what drove it.`,
    });
  }
  return signals;
}
