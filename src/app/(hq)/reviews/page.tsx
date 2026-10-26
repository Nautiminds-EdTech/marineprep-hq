import Link from "next/link";
import { Suspense } from "react";
import { NotConnected } from "@/components/not-connected";
import { StatTile } from "@/components/stat-tile";
import { appStoreConfigured } from "@/lib/appstore";
import { requireAdmin } from "@/lib/auth";
import { playAvailableHere, playConfigured } from "@/lib/play";
import { listReviews, reviewStats, STORE_LABEL, type SavedReview, type Store } from "@/lib/reviews";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTimeIST } from "@/lib/time";
import { refreshReviews } from "./actions";

export const metadata = { title: "Reviews · MarinePrep HQ" };
// Refreshing fetches both stores and may ask Claude for themes.
export const maxDuration = 120;

const DAYS = 30;

export default function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Reviews</h1>
          <p className="text-sm text-ink-2">
            Google Play and App Store · collected every morning · 1–2★ reviews alert Telegram
          </p>
        </div>
        <form action={refreshReviews}>
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
            Refresh now
          </button>
        </form>
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Loading reviews…</p>}>
        <ReviewsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewsBody({ searchParams }: { searchParams: PageProps<"/reviews">["searchParams"] }) {
  await requireAdmin();
  if (!createServiceClient()) return <p className="card p-4 text-sm text-ink-2">Reviews need SUPABASE_SERVICE_ROLE_KEY.</p>;
  if (!playConfigured() && !appStoreConfigured()) return <NotConnected service="Google Play / App Store Connect" />;

  const params = await searchParams;
  const store = params.store === "google_play" || params.store === "app_store" ? (params.store as Store) : undefined;
  const low = params.low === "1";

  const [stats, reviews] = await Promise.all([reviewStats(DAYS), listReviews({ store, low })]);
  const avg = (a: number | null) => (a === null ? "–" : `${a.toFixed(2)}★`);
  const maxTheme = stats.themes[0]?.[1].count || 1;

  return (
    <>
      {playConfigured() && !playAvailableHere() && (
        <p className="card p-3 text-xs text-ink-3">
          Google Play reviews load only on the live HQ (keyless sign-in from Vercel production). Showing what&apos;s
          saved.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Google Play, ${DAYS} days`} value={avg(stats.play.average)} sub={`${stats.play.count} reviews`} />
        <StatTile label={`App Store, ${DAYS} days`} value={avg(stats.appStore.average)} sub={`${stats.appStore.count} reviews`} />
        <StatTile label="1–2★ reviews" value={String(stats.low)} sub={`of ${stats.total} in ${DAYS} days`} />
        <StatTile label="Unanswered ≤3★" value={String(stats.unanswered)} sub="Replying lifts ratings" />
      </section>

      {stats.themes.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 font-medium">What reviews talk about, {DAYS} days</h2>
          <ul className="flex flex-col gap-2">
            {stats.themes.map(([theme, { count, low: lowCount }]) => (
              <li
                key={theme}
                className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr]"
                title={`${count} reviews · ${lowCount} of them 1–2★`}
              >
                <span className="text-ink-2">{theme.replace(/_/g, " ")}</span>
                <span className="flex items-center gap-2">
                  <span className="h-4 rounded-r bg-accent" style={{ width: `${(count / maxTheme) * 100}%` }} />
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                    {count}
                    {lowCount ? ` · ${lowCount} low` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            { label: "All", href: "/reviews" },
            { label: "Google Play", href: "/reviews?store=google_play" },
            { label: "App Store", href: "/reviews?store=app_store" },
            { label: "1–2★ only", href: `/reviews?low=1${store ? `&store=${store}` : ""}` },
          ].map((f) => {
            const active =
              (f.label === "All" && !store && !low) ||
              (f.label === "1–2★ only" && low) ||
              (!low && store && f.href.endsWith(store));
            return (
              <Link
                key={f.label}
                href={f.href}
                className={`rounded-lg border px-3 py-1 ${active ? "border-accent text-ink" : "border-line text-ink-2 hover:text-ink"}`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        {reviews.length === 0 ? (
          <p className="card p-4 text-sm text-ink-3">No reviews saved yet. Use “Refresh now” or wait for the morning run.</p>
        ) : (
          <ul className="flex flex-col gap-3">
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
  return (
    <li className="card flex flex-col gap-2 p-4 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span
          className={`font-medium ${r.rating <= 2 ? "text-critical" : r.rating === 3 ? "text-warning" : "text-good"}`}
          aria-label={`${r.rating} out of 5 stars`}
        >
          {"★".repeat(r.rating)}
          <span className="text-line">{"★".repeat(5 - r.rating)}</span>
        </span>
        <span>{STORE_LABEL[r.store]}</span>
        {r.app_version && <span>v{r.app_version}</span>}
        {r.territory && <span>{r.territory}</span>}
        <span>{formatTimeIST(r.reviewed_at)}</span>
        {r.author && <span>· {r.author}</span>}
      </p>
      {r.title && <p className="font-medium">{r.title}</p>}
      {r.body ? <p className="whitespace-pre-wrap text-ink">{r.body}</p> : <p className="text-ink-3">(rating only)</p>}
      {r.themes.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {r.themes.map((t) => (
            <span key={t} className="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </p>
      )}
      {r.reply_body ? (
        <p className="border-l-2 border-line pl-3 text-xs text-ink-2">
          <span className="font-medium">Your reply:</span> {r.reply_body}
        </p>
      ) : (
        r.rating <= 3 && <p className="text-xs text-warning">Not answered yet</p>
      )}
    </li>
  );
}
