import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { IdentityPoolClient } from "google-auth-library";
import type { StoreReview } from "@/lib/reviews";

// Google Play Developer API without a key file: the Vercel deployment's OIDC token is exchanged
// (workload identity federation, pool "vercel") for a short-lived token of the Play service account.
// The pool only trusts this project's *production* deployment, so this doesn't work locally.

export function playConfigured() {
  return !!(
    process.env.GCP_PROJECT_NUMBER &&
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT &&
    process.env.GOOGLE_PLAY_PACKAGE_NAME
  );
}

/** The Play Console bulk-reports bucket (pubsite_prod_rev_…), for review history older than a week. */
export function playReportsBucket() {
  return process.env.GOOGLE_PLAY_REPORTS_BUCKET?.replace(/^gs:\/\//, "").split("/")[0] || null;
}

/** True where the keyless sign-in can work (Vercel production). */
export function playAvailableHere() {
  return process.env.VERCEL_ENV === "production";
}

function authClient() {
  return new IdentityPoolClient({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel/providers/vercel`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GOOGLE_PLAY_SERVICE_ACCOUNT}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    scopes: [
      "https://www.googleapis.com/auth/androidpublisher",
      "https://www.googleapis.com/auth/devstorage.read_only",
    ],
  });
}

type PlayComment = {
  userComment?: {
    text?: string;
    lastModified?: { seconds?: string };
    starRating?: number;
    reviewerLanguage?: string;
    appVersionName?: string;
  };
  developerComment?: { text?: string; lastModified?: { seconds?: string } };
};
type PlayReview = { reviewId: string; authorName?: string; comments?: PlayComment[] };

const toIso = (seconds?: string) => (seconds ? new Date(Number(seconds) * 1000).toISOString() : null);

/** Reviews created or edited in the last 7 days (all Google Play's API returns). */
export async function fetchPlayReviews(): Promise<StoreReview[]> {
  const headers = await authClient().getRequestHeaders();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${process.env.GOOGLE_PLAY_PACKAGE_NAME}/reviews`;

  const reviews: StoreReview[] = [];
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = `${base}?maxResults=100${token ? `&token=${encodeURIComponent(token)}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Google Play ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { reviews?: PlayReview[]; tokenPagination?: { nextPageToken?: string } };

    for (const r of data.reviews ?? []) {
      const user = r.comments?.find((c) => c.userComment)?.userComment;
      const dev = r.comments?.find((c) => c.developerComment)?.developerComment;
      if (!user?.starRating) continue;
      reviews.push({
        store: "google_play",
        review_id: r.reviewId,
        rating: user.starRating,
        title: null,
        body: user.text?.trim() || null,
        author: r.authorName ?? null,
        app_version: user.appVersionName ?? null,
        language: user.reviewerLanguage ?? null,
        territory: null,
        reviewed_at: toIso(user.lastModified?.seconds) ?? new Date().toISOString(),
        reply_body: dev?.text ?? null,
        replied_at: toIso(dev?.lastModified?.seconds),
      });
    }
    token = data.tokenPagination?.nextPageToken;
    if (!token) break;
  }
  return reviews;
}

/**
 * One review by ID, with any developer reply. The review list only covers the last 7 days and the
 * report files don't pick up replies posted later, so this is how a Play Console reply to an older
 * review reaches HQ (when Google returns it). Null when Google doesn't.
 */
export async function fetchPlayReview(reviewId: string): Promise<{ reply_body: string | null; replied_at: string | null } | null> {
  const headers = await authClient().getRequestHeaders();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${process.env.GOOGLE_PLAY_PACKAGE_NAME}/reviews/${encodeURIComponent(reviewId)}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Play ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const r = (await res.json()) as PlayReview;
  const dev = r.comments?.find((c) => c.developerComment)?.developerComment;
  return { reply_body: dev?.text?.trim() || null, replied_at: toIso(dev?.lastModified?.seconds) };
}

// ── Review history from the monthly bulk-report CSVs ─────────────────────────────

/** Minimal RFC 4180 parser: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f !== ""));
}

/** The Play reports are UTF-16 (usually LE with a BOM); fall back to UTF-8. */
export function decodeReport(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || bytes[1] === 0) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

export type ReportFileStats = { name: string; rows: number; withText: number; withReply: number };

/**
 * Reviews from the monthly report files (all history, including star-only ratings).
 * `months` limits it to the newest N files; omit for everything. `stats` collects per-file counts.
 * A review can appear in more than one file; the copy with a reply (or the newest update) wins.
 */
export async function fetchPlayReviewHistory(months?: number, stats?: ReportFileStats[]): Promise<StoreReview[]> {
  const bucket = playReportsBucket();
  if (!bucket) return [];
  const headers = await authClient().getRequestHeaders();
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME;

  const list = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(`reviews/reviews_${pkg}_`)}`,
    { headers },
  );
  if (!list.ok) throw new Error(`Play reports ${list.status}: ${(await list.text()).slice(0, 200)}`);
  const names = (((await list.json()) as { items?: { name: string }[] }).items ?? [])
    .map((o) => o.name)
    .sort()
    .reverse()
    .slice(0, months ?? Infinity);

  const reviews: StoreReview[] = [];
  for (const name of names) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, {
      headers,
    });
    if (!res.ok) throw new Error(`Play report ${name} ${res.status}`);
    const [header, ...rows] = parseCsv(decodeReport(await res.arrayBuffer()));
    const col = (label: string) => header.findIndex((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase() === label.toLowerCase());
    const c = {
      version: col("App Version Name"),
      language: col("Reviewer Language"),
      device: col("Device"),
      submitted: col("Review Submit Millis Since Epoch"),
      updated: col("Review Last Update Millis Since Epoch"),
      rating: col("Star Rating"),
      title: col("Review Title"),
      text: col("Review Text"),
      replyAt: col("Developer Reply Millis Since Epoch"),
      reply: col("Developer Reply Text"),
      link: col("Review Link"),
    };
    stats?.push({
      name: name.split("/").pop()!,
      rows: rows.length,
      withText: rows.filter((r) => r[c.text]?.trim()).length,
      withReply: c.reply < 0 ? -1 : rows.filter((r) => r[c.reply]?.trim()).length,
    });
    for (const r of rows) {
      const rating = Number(r[c.rating]);
      if (!(rating >= 1 && rating <= 5)) continue;
      const millis = Number(r[c.updated] || r[c.submitted]);
      // The link carries the same ID the API returns; star-only rows have no link.
      const fromLink = /reviewid=([^&]+)/i.exec(r[c.link] ?? "")?.[1];
      const id = fromLink ? decodeURIComponent(fromLink) : `csv:${r[c.submitted]}:${r[c.device] ?? ""}`;
      reviews.push({
        store: "google_play",
        review_id: id,
        rating,
        title: r[c.title]?.trim() || null,
        body: r[c.text]?.trim() || null,
        author: null,
        app_version: r[c.version] || null,
        language: r[c.language] || null,
        territory: null,
        reviewed_at: new Date(millis || Date.now()).toISOString(),
        reply_body: r[c.reply]?.trim() || null,
        replied_at: r[c.replyAt] ? new Date(Number(r[c.replyAt])).toISOString() : null,
      });
    }
  }
  const best = new Map<string, StoreReview>();
  for (const r of reviews) {
    const prev = best.get(r.review_id);
    if (!prev || (!prev.reply_body && r.reply_body) || (!!prev.reply_body === !!r.reply_body && r.reviewed_at > prev.reviewed_at)) best.set(r.review_id, r);
  }
  return [...best.values()];
}

// ── Replies ──────────────────────────────────────────────────────────────────────

/** Posts (or replaces) the developer reply on a Google Play review. Play caps replies at 350 characters. */
export async function replyToPlayReview(reviewId: string, text: string) {
  if (!playAvailableHere()) throw new Error("Google Play replies only work on the live HQ (keyless sign-in from Vercel production).");
  const headers = await authClient().getRequestHeaders();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${process.env.GOOGLE_PLAY_PACKAGE_NAME}/reviews/${encodeURIComponent(reviewId)}:reply`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
    body: JSON.stringify({ replyText: text }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // Old reviews can be out of the API's reach; the Console still takes the reply.
    throw new Error(`Google Play ${res.status}: ${detail}. If it persists, reply in Play Console → Ratings and reviews.`);
  }
}

// ── Installs from the monthly stats reports ──────────────────────────────────────

export type DailyInstalls = { day: string; installs: number };

/**
 * Daily installs from stats/installs/installs_<package>_<YYYYMM>_overview.csv: "Daily User Installs"
 * (people installing on their first device), falling back to device installs in older files.
 * `months` limits it to the newest N files; omit for everything.
 */
export async function fetchPlayInstalls(months?: number): Promise<DailyInstalls[]> {
  const bucket = playReportsBucket();
  if (!bucket) return [];
  const headers = await authClient().getRequestHeaders();
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME;

  const list = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(`stats/installs/installs_${pkg}_`)}`,
    { headers },
  );
  if (!list.ok) throw new Error(`Play install reports ${list.status}: ${(await list.text()).slice(0, 200)}`);
  const names = (((await list.json()) as { items?: { name: string }[] }).items ?? [])
    .map((o) => o.name)
    .filter((n) => n.endsWith("_overview.csv"))
    .sort()
    .reverse()
    .slice(0, months ?? Infinity);

  const days: DailyInstalls[] = [];
  for (const name of names) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, { headers });
    if (!res.ok) throw new Error(`Play install report ${name} ${res.status}`);
    const [header, ...rows] = parseCsv(decodeReport(await res.arrayBuffer()));
    const col = (label: string) => header.findIndex((h) => h.trim() === label);
    const date = col("Date");
    const users = col("Daily User Installs");
    const devices = col("Daily Device Installs");
    if (date < 0 || (users < 0 && devices < 0)) throw new Error(`Play install report ${name}: unexpected columns`);
    for (const r of rows) {
      const day = r[date]?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) continue;
      const value = Number(r[users >= 0 ? users : devices]);
      if (Number.isFinite(value)) days.push({ day, installs: value });
    }
  }
  return days;
}
