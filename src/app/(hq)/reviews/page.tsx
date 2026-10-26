import { MessageSquareReply, MessageSquareWarning, RefreshCw, Star, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NotConnected } from "@/components/not-connected";
import { Notice } from "@/components/notice";
import { PageHeader, Section } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeleton";
import { StatTile } from "@/components/stat-tile";
import { SubmitButton } from "@/components/submit-button";
import { appStoreConfigured } from "@/lib/appstore";
import { requireAdmin } from "@/lib/auth";
import { playAvailableHere, playConfigured } from "@/lib/play";
import { listReviews, reviewStats, STORE_LABEL, type SavedReview, type Store } from "@/lib/reviews";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTimeIST, timeAgo } from "@/lib/time";
import { refreshReviews } from "./actions";

export const metadata = { title: "Reviews · MarinePrep HQ" };
// Refreshing fetches both stores and may ask Claude for themes.
export const maxDuration = 120;

const DAYS = 30;

export default function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reviews"
        description="Google Play and App Store, collected every morning. New 1–2★ reviews alert Telegram."
        actions={
          <form action={refreshReviews}>
            <SubmitButton
              pending={
                <>
                  <RefreshCw size={15} className="animate-spin" aria-hidden /> Refreshing…
                </>
              }
            >
              <RefreshCw size={15} aria-hidden /> Refresh now
            </SubmitButton>
          </form>
        }
      />
      <Suspense fallback={<PageSkeleton label="Loading reviews" />}>
        <ReviewsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={0}
          className={i <= Math.round(rating) ? "fill-star" : "fill-line-strong"}
          aria-hidden
        />
      ))}
    </span>
  );
}

async function ReviewsBody({ searchParams }: { searchParams: PageProps<"/reviews">["searchParams"] }) {
  await requireAdmin();
  if (!createServiceClient()) return <Notice tone="warning">Reviews need SUPABASE_SERVICE_ROLE_KEY.</Notice>;
  if (!playConfigured() && !appStoreConfigured()) return <NotConnected service="Google Play / App Store Connect" />;

  const params = await searchParams;
  const store = params.store === "google_play" || params.store === "app_store" ? (params.store as Store) : undefined;
  const low = params.low === "1";

  const [stats, reviews] = await Promise.all([reviewStats(DAYS), listReviews({ store, low })]);
  const maxTheme = stats.themes[0]?.[1].count || 1;
  const maxStars = Math.max(...stats.distribution.map((d) => d.count), 1);

  const filters = [
    { label: "All", href: "/reviews", active: !store && !low },
    { label: "Google Play", href: "/reviews?store=google_play", active: !low && store === "google_play" },
    { label: "App Store", href: "/reviews?store=app_store", active: !low && store === "app_store" },
    { label: "1–2★ only", href: `/reviews?low=1${store ? `&store=${store}` : ""}`, active: low },
  ];

  return (
    <>
      {playConfigured() && !playAvailableHere() && (
        <Notice>
          Google Play reviews load only on the live HQ (keyless sign-in from Vercel production). Showing what&apos;s
          saved.
        </Notice>
      )}

      <section aria-label={`Last ${DAYS} days`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Google Play", stats.play],
            ["App Store", stats.appStore],
          ] as const
        ).map(([label, s]) => (
          <div key={label} className="card flex flex-col p-4">
            <p className="text-[13px] font-medium text-ink-2">{label}</p>
            <p className="display-num mt-2 text-[1.75rem] leading-none sm:text-3xl">
              {s.average === null ? "–" : s.average.toFixed(1)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
              {s.average !== null && <Stars rating={s.average} size={13} />}
              <span>
                {s.count} {s.count === 1 ? "review" : "reviews"}, {DAYS} days
              </span>
            </div>
          </div>
        ))}
        <StatTile
          label="1–2★ reviews"
          icon={ThumbsDown}
          value={String(stats.low)}
          sub={`of ${stats.total} in ${DAYS} days`}
          tone={stats.low ? "warning" : "default"}
        />
        <StatTile
          label="Unanswered ≤3★"
          icon={MessageSquareWarning}
          value={String(stats.unanswered)}
          sub="Replying lifts ratings"
          tone={stats.unanswered ? "critical" : "good"}
          href={stats.unanswered ? "/reviews?low=1" : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Ratings" description={`Both stores, last ${DAYS} days`}>
          {stats.total === 0 ? (
            <p className="text-sm text-ink-3">No reviews in the last {DAYS} days.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.distribution.map(({ stars, count }) => (
                <li key={stars} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-ink-2">
                    {stars}
                    <Star size={12} strokeWidth={0} className="fill-star" aria-hidden />
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className={`block h-full rounded-full ${stars <= 2 ? "bg-critical" : stars === 3 ? "bg-warning" : "bg-accent"}`}
                      style={{ width: `${(count / maxStars) * 100}%` }}
                    />
                  </span>
                  <span className="text-right text-xs text-ink-3 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="What reviews talk about"
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              Themes tagged by Claude
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-critical" aria-hidden /> 1–2★
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-accent" aria-hidden /> 3–5★
              </span>
            </span>
          }
        >
          {stats.themes.length === 0 ? (
            <p className="text-sm text-ink-3">No tagged reviews in the last {DAYS} days.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {stats.themes.map(([theme, { count, low: lowCount }]) => (
                <li key={theme} className="flex flex-col gap-1" title={`${count} reviews · ${lowCount} of them 1–2★`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-2 first-letter:uppercase">{theme.replace(/_/g, " ")}</span>
                    <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                      {count}
                      {lowCount ? ` · ${lowCount} low` : ""}
                    </span>
                  </div>
                  <span className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                    {/* Low ratings first, in critical, so the share of complaints reads at a glance. */}
                    <span className="h-full bg-critical" style={{ width: `${(lowCount / maxTheme) * 100}%` }} />
                    <span
                      className="h-full rounded-r-full bg-accent"
                      style={{ width: `${((count - lowCount) / maxTheme) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            Reviews <span className="text-sm font-normal text-ink-3">({reviews.length})</span>
          </h2>
          <nav
            aria-label="Filter reviews"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0"
          >
            {filters.map((f) => (
              <Link
                key={f.label}
                href={f.href}
                aria-current={f.active ? "true" : undefined}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  f.active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        {reviews.length === 0 ? (
          <p className="card p-4 text-sm text-ink-3">
            No reviews saved yet. Use “Refresh now” or wait for the morning run.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {reviews.map((r) => (
              <ReviewCard key={`${r.store}:${r.review_id}`} r={r} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ReviewCard({ r }: { r: SavedReview }) {
  const unanswered = !r.reply_body && r.rating <= 3;
  return (
    <li className="card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Stars rating={r.rating} />
          <p className="flex flex-wrap gap-x-2 text-xs text-ink-3">
            {r.author && <span className="font-medium text-ink-2">{r.author}</span>}
            {r.app_version && <span>v{r.app_version}</span>}
            {r.territory && <span>{r.territory}</span>}
            <time dateTime={r.reviewed_at} title={formatTimeIST(r.reviewed_at)}>
              {timeAgo(r.reviewed_at)}
            </time>
          </p>
        </div>
        <span className="chip shrink-0 bg-surface-2 text-ink-2">{STORE_LABEL[r.store]}</span>
      </div>
      {r.title && <p className="font-display font-semibold break-words">{r.title}</p>}
      {r.body ? (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{r.body}</p>
      ) : (
        <p className="text-sm text-ink-3 italic">Rating only, no text</p>
      )}
      {r.themes.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {r.themes.map((t) => (
            <span key={t} className="chip bg-accent-soft text-accent">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </p>
      )}
      {r.reply_body ? (
        <div className="mt-auto rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
            <MessageSquareReply size={13} aria-hidden /> Your reply
            {r.replied_at && <span className="font-normal text-ink-3">· {timeAgo(r.replied_at)}</span>}
          </p>
          <p className="break-words whitespace-pre-wrap">{r.reply_body}</p>
        </div>
      ) : (
        unanswered && (
          <p className="mt-auto flex items-center gap-1.5 text-xs font-medium text-warning">
            <MessageSquareWarning size={14} aria-hidden /> Not answered yet
          </p>
        )
      )}
    </li>
  );
}
