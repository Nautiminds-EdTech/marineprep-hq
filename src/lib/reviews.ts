import "server-only";
import { tagReviewThemes } from "@/lib/analyst";
import { appStoreConfigured, fetchAppStoreReviews } from "@/lib/appstore";
import { fetchPlayReviewHistory, fetchPlayReviews, playAvailableHere, playConfigured, playReportsBucket } from "@/lib/play";
import { createServiceClient } from "@/lib/supabase/server";
import { esc, sendMessage, telegramConfigured, type Button } from "@/lib/telegram";

export type Store = "google_play" | "app_store";

export type StoreReview = {
  store: Store;
  review_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  app_version: string | null;
  language: string | null;
  territory: string | null;
  reviewed_at: string;
  reply_body: string | null;
  replied_at: string | null;
};

export type SavedReview = StoreReview & { themes: string[] };

export const STORE_LABEL: Record<Store, string> = { google_play: "Google Play", app_store: "App Store" };

// Only alert on low ratings this recent, so the first App Store backfill doesn't flood Telegram.
const ALERT_WINDOW_MS = 3 * 86_400_000;

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client;
}

export type CollectResult = {
  fetched: Partial<Record<Store, number>>;
  errors: Partial<Record<Store, string>>;
  alerted: number;
  themed: number;
};

/** Pulls reviews from both stores, saves them, alerts on new 1–2★ ones and tags themes. */
export async function collectReviews(): Promise<CollectResult> {
  const result: CollectResult = { fetched: {}, errors: {}, alerted: 0, themed: 0 };
  // The App Store's first run pulls the full history; after that only the newest pages.
  const firstRun = async (store: Store) => {
    const { count } = await db().from("hq_reviews").select("*", { count: "exact", head: true }).eq("store", store);
    return !count;
  };
  const sources: [Store, () => Promise<StoreReview[]>][] = [];
  if (playConfigured() && playAvailableHere()) {
    sources.push([
      "google_play",
      async () => {
        // Last 7 days from the API; older history (and star-only ratings) from the monthly reports.
        const recent = await fetchPlayReviews();
        const bucket = playReportsBucket();
        if (!bucket) return recent;
        // Full history once per bucket (marked in hq_alerts), then the two newest monthly files.
        const { data: imported } = await db()
          .from("hq_alerts")
          .select("id")
          .eq("kind", "play_history_import")
          .eq("key", bucket)
          .maybeSingle();
        let history: StoreReview[];
        try {
          history = await fetchPlayReviewHistory(imported ? 2 : undefined);
        } catch (e) {
          // Bucket access can lag the Play Console grant by up to a day; keep the API reviews meanwhile.
          result.errors.google_play = `history: ${(e as Error).message.slice(0, 250)}`;
          return recent;
        }
        if (!imported) await db().from("hq_alerts").insert({ kind: "play_history_import", key: bucket, payload: { reviews: history.length } });
        const seen = new Set(recent.map((r) => r.review_id));
        return [...recent, ...history.filter((r) => !seen.has(r.review_id))];
      },
    ]);
  }
  if (appStoreConfigured()) {
    sources.push(["app_store", async () => fetchAppStoreReviews((await firstRun("app_store")) ? 50 : 3)]);
  }

  const all: StoreReview[] = [];
  await Promise.all(
    sources.map(async ([store, fetchStore]) => {
      try {
        const reviews = await fetchStore();
        result.fetched[store] = reviews.length;
        all.push(...reviews);
      } catch (e) {
        result.errors[store] = (e as Error).message.slice(0, 300);
      }
    }),
  );

  if (all.length) {
    // Upsert without `themes`, so tags from earlier runs are kept.
    const { error } = await db()
      .from("hq_reviews")
      .upsert(
        all.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
        { onConflict: "store,review_id" },
      );
    if (error) throw new Error(error.message);
  }

  result.alerted = await alertLowRatings(all);
  result.themed = await tagUntagged();
  return result;
}

async function alertLowRatings(reviews: StoreReview[]) {
  if (!telegramConfigured()) return 0;
  const recent = reviews.filter(
    (r) => r.rating <= 2 && Date.now() - Date.parse(r.reviewed_at) < ALERT_WINDOW_MS,
  );
  let sent = 0;
  for (const r of recent) {
    // Claim first: each review alerts once, even across retries.
    const { error } = await db()
      .from("hq_alerts")
      .insert({ kind: "review", key: `${r.store}:${r.review_id}`, payload: { rating: r.rating } });
    if (error) continue;

    const hq = process.env.HQ_URL;
    const buttons: Button[][] = hq?.startsWith("https://") ? [[{ text: "Open Reviews", url: `${hq}/reviews` }]] : [];
    const messageId = await sendMessage(
      [
        `${"⭐".repeat(r.rating)} <b>New ${r.rating}★ review on ${STORE_LABEL[r.store]}</b>`,
        r.title ? `<b>${esc(r.title)}</b>` : "",
        r.body ? esc(r.body.slice(0, 1200)) : "<i>(no text)</i>",
        [r.author && `— ${esc(r.author)}`, r.app_version && `v${esc(r.app_version)}`, r.territory]
          .filter(Boolean)
          .join(" · "),
      ]
        .filter(Boolean)
        .join("\n"),
      buttons,
    );
    await db()
      .from("hq_alerts")
      .update({ telegram_message_id: messageId })
      .eq("kind", "review")
      .eq("key", `${r.store}:${r.review_id}`);
    sent++;
  }
  return sent;
}

/** Tags up to 60 reviews that have text but no themes yet. */
async function tagUntagged() {
  const { data } = await db()
    .from("hq_reviews")
    .select("store, review_id, rating, title, body")
    .eq("themes", "{}")
    .not("body", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(60);
  if (!data?.length) return 0;

  const tags = await tagReviewThemes(
    data.map((r) => ({ id: `${r.store}:${r.review_id}`, rating: r.rating, text: [r.title, r.body].filter(Boolean).join(" — ") })),
  ).catch((e) => {
    console.error("[reviews] theme tagging failed:", (e as Error).message);
    return null;
  });
  if (!tags) return 0;

  let tagged = 0;
  for (const r of data) {
    const themes = tags.get(`${r.store}:${r.review_id}`);
    if (!themes?.length) continue;
    const { error } = await db()
      .from("hq_reviews")
      .update({ themes })
      .eq("store", r.store)
      .eq("review_id", r.review_id);
    if (!error) tagged++;
  }
  return tagged;
}

/** Low ratings (≤3★) from the last 30 days without a reply, for the nav badge and Overview. */
export async function countUnansweredLow() {
  const { count, error } = await db()
    .from("hq_reviews")
    .select("*", { count: "exact", head: true })
    .lte("rating", 3)
    .is("reply_body", null)
    .gte("reviewed_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listReviews(filter: { store?: Store; low?: boolean; limit?: number } = {}) {
  let q = db()
    .from("hq_reviews")
    .select("*")
    .order("reviewed_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.store) q = q.eq("store", filter.store);
  if (filter.low) q = q.lte("rating", 2);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as SavedReview[];
}

/** Ratings and themes over the last `days`, for the summary tiles. */
export async function reviewStats(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("hq_reviews")
    .select("store, rating, themes, reply_body")
    .gte("reviewed_at", since);
  if (error) throw new Error(error.message);

  const byStore = (store: Store) => {
    const rows = data.filter((r) => r.store === store);
    const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;
    return { count: rows.length, average: avg };
  };
  const themes = new Map<string, { count: number; low: number }>();
  for (const r of data) {
    for (const t of (r.themes as string[]) ?? []) {
      const entry = themes.get(t) ?? { count: 0, low: 0 };
      entry.count++;
      if (r.rating <= 2) entry.low++;
      themes.set(t, entry);
    }
  }
  return {
    total: data.length,
    low: data.filter((r) => r.rating <= 2).length,
    unanswered: data.filter((r) => r.rating <= 3 && !r.reply_body).length,
    play: byStore("google_play"),
    appStore: byStore("app_store"),
    themes: [...themes.entries()].sort((a, b) => b[1].count - a[1].count),
    /** Reviews per star rating, 5★ first. */
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: data.filter((r) => r.rating === stars).length })),
  };
}
