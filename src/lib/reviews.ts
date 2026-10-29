import "server-only";
import { tagReviewThemes } from "@/lib/analyst";
import { appStoreConfigured, fetchAppStoreReviews } from "@/lib/appstore";
import { fetchPlayReview, fetchPlayReviewHistory, fetchPlayReviews, playAvailableHere, playConfigured, playReportsBucket, type ReportFileStats } from "@/lib/play";
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

/** A review HQ can answer through the store API: it has text, a real store ID (not a report-only row) and no reply. */
export function replyable(r: Pick<StoreReview, "review_id" | "body" | "reply_body">) {
  return !!r.body?.trim() && !r.reply_body && !r.review_id.startsWith("csv:");
}

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
  /** Play reviews their authors deleted, removed from HQ this run */
  removed?: number;
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
        // Every monthly file, every run (they're small): a reply posted in Play Console to an old review
        // can show up in an older file, so reading only the newest months missed replies.
        const { data: imported } = await db()
          .from("hq_alerts")
          .select("id")
          .eq("kind", "play_history_import")
          .eq("key", bucket)
          .maybeSingle();
        let history: StoreReview[];
        const files: ReportFileStats[] = [];
        try {
          history = await fetchPlayReviewHistory(24, files);
        } catch (e) {
          // Bucket access can lag the Play Console grant by up to a day; keep the API reviews meanwhile.
          result.errors.google_play = `history: ${(e as Error).message.slice(0, 250)}`;
          return recent;
        }
        if (!imported) await db().from("hq_alerts").insert({ kind: "play_history_import", key: bucket, payload: { reviews: history.length } });
        const seen = new Set(recent.map((r) => r.review_id));
        const combined = [...recent, ...history.filter((r) => !seen.has(r.review_id))];

        // The report files never pick up a reply posted later in Play Console (checked 29 Oct: 0 replies in
        // every file), so ask for each unanswered review with text by ID, which may include the reply.
        const lookups = { tried: 0, found: 0, replied: 0, error: null as string | null };
        const { data: saved } = await db().from("hq_reviews").select("review_id").eq("store", "google_play").not("reply_body", "is", null);
        const answered = new Set((saved ?? []).map((r) => r.review_id));
        for (const r of combined.filter((r) => r.body && !r.reply_body && !seen.has(r.review_id) && !r.review_id.startsWith("csv:") && !answered.has(r.review_id)).slice(0, 30)) {
          lookups.tried++;
          try {
            const got = await fetchPlayReview(r.review_id);
            if (!got) continue;
            lookups.found++;
            if (got.reply_body) {
              lookups.replied++;
              r.reply_body = got.reply_body;
              r.replied_at = got.replied_at;
            }
          } catch (e) {
            lookups.error ??= (e as Error).message.slice(0, 200);
          }
        }
        // What the report files and lookups returned today, for checking from the DB.
        await db()
          .from("hq_alerts")
          .upsert({ kind: "play_reports_check", key: new Date().toISOString().slice(0, 10), payload: { files, lookups } }, { onConflict: "kind,key" });
        playComplete = true;
        return combined;
      },
    ]);
  }
  if (appStoreConfigured()) {
    sources.push(["app_store", async () => fetchAppStoreReviews((await firstRun("app_store")) ? 50 : 3)]);
  }

  // Set once Play's API list and every report file were read, so anything saved that neither returned
  // anymore was deleted by its author (e.g. deleted and posted again, which gives a new review ID).
  let playComplete = false;
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
    // Upsert without `themes`, so tags from earlier runs are kept. Rows without a reply leave out the
    // reply columns, so a reply already saved (e.g. one HQ just posted) isn't wiped by a report file
    // that hasn't caught up yet.
    const fetchedAt = new Date().toISOString();
    const withReply = all.filter((r) => r.reply_body).map((r) => ({ ...r, fetched_at: fetchedAt }));
    const withoutReply = all
      .filter((r) => !r.reply_body)
      .map((r) => {
        const row: Partial<StoreReview> & { fetched_at: string } = { ...r, fetched_at: fetchedAt };
        delete row.reply_body;
        delete row.replied_at;
        return row;
      });
    for (const rows of [withReply, withoutReply]) {
      if (!rows.length) continue;
      const { error } = await db().from("hq_reviews").upsert(rows, { onConflict: "store,review_id" });
      if (error) throw new Error(error.message);
    }
    if (playComplete) result.removed = await removeDeletedPlayReviews(fetchedAt);
  }

  result.alerted = await alertLowRatings(all);
  result.themed = await tagUntagged();
  return result;
}

/**
 * Removes saved Play reviews that this run's complete fetch didn't return (fetched_at older than this
 * run) once Google confirms they're gone: the review by ID is not found, or the same author posted the
 * same text again under a new ID. More than a few missing at once means a partial fetch, not
 * deletions, so it then removes nothing.
 */
async function removeDeletedPlayReviews(fetchedAt: string) {
  const { data: missing, error } = await db()
    .from("hq_reviews")
    .select("review_id, author, body")
    .eq("store", "google_play")
    .lt("fetched_at", fetchedAt);
  if (error || !missing?.length || missing.length > 5) return 0;

  const gone: string[] = [];
  for (const r of missing) {
    let reposted = false;
    if (r.author && r.body) {
      const { count } = await db()
        .from("hq_reviews")
        .select("review_id", { count: "exact", head: true })
        .eq("store", "google_play")
        .eq("author", r.author)
        .eq("body", r.body)
        .gte("fetched_at", fetchedAt);
      reposted = (count ?? 0) > 0;
    }
    const notFound = !reposted && !r.review_id.startsWith("csv:") && (await fetchPlayReview(r.review_id).catch(() => undefined)) === null;
    if (reposted || notFound) gone.push(r.review_id);
  }
  if (!gone.length) return 0;
  const { error: deleteError } = await db().from("hq_reviews").delete().eq("store", "google_play").in("review_id", gone);
  return deleteError ? 0 : gone.length;
}

async function alertLowRatings(reviews: StoreReview[]) {
  if (!telegramConfigured()) return 0;
  // Reviews Claude will draft a reply for get one Telegram message with the draft instead (lib/replies.ts).
  const drafts = !!process.env.ANTHROPIC_API_KEY;
  const recent = reviews.filter(
    (r) => r.rating <= 2 && Date.now() - Date.parse(r.reviewed_at) < ALERT_WINDOW_MS && !(drafts && replyable(r)),
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

/** Newest first. `days` limits it to reviews posted in that many recent days. */
export async function listReviews(filter: { store?: Store; low?: boolean; days?: number; limit?: number } = {}) {
  let q = db()
    .from("hq_reviews")
    .select("*")
    .order("reviewed_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.store) q = q.eq("store", filter.store);
  if (filter.low) q = q.lte("rating", 2);
  if (filter.days) q = q.gte("reviewed_at", new Date(Date.now() - filter.days * 86_400_000).toISOString());
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
