import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { StoreReview } from "@/lib/reviews";

// App Store Connect API with Team keys: the Customer Support key reads and answers reviews; a second
// key with the Sales role reads Sales and Trends reports (downloads).

export function appStoreConfigured() {
  return !!(
    process.env.APP_STORE_ISSUER_ID &&
    process.env.APP_STORE_KEY_ID &&
    process.env.APP_STORE_PRIVATE_KEY_B64 &&
    process.env.APP_STORE_APP_ID
  );
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function appStoreSalesConfigured() {
  return !!(
    process.env.APP_STORE_ISSUER_ID &&
    process.env.APP_STORE_SALES_KEY_ID &&
    process.env.APP_STORE_SALES_PRIVATE_KEY_B64 &&
    process.env.APP_STORE_VENDOR_NUMBER &&
    process.env.APP_STORE_APP_ID
  );
}

/** Short-lived ES256 token for the App Store Connect API (max 20 minutes). */
function token(keyId = process.env.APP_STORE_KEY_ID, keyB64 = process.env.APP_STORE_PRIVATE_KEY_B64) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: process.env.APP_STORE_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }),
  );
  const key = createPrivateKey(Buffer.from(keyB64!, "base64").toString("utf8"));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

type Resource<A> = { id: string; type: string; attributes: A; relationships?: Record<string, { data?: { id: string } | null }> };
type ReviewAttrs = {
  rating: number;
  title?: string;
  body?: string;
  reviewerNickname?: string;
  createdDate: string;
  territory?: string;
};
type ResponseAttrs = { responseBody?: string; lastModifiedDate?: string; state?: string };

/** Newest reviews first; `pages` × 200 at most. */
export async function fetchAppStoreReviews(pages = 3): Promise<StoreReview[]> {
  const auth = { Authorization: `Bearer ${token()}` };
  let url: string | undefined =
    `https://api.appstoreconnect.apple.com/v1/apps/${process.env.APP_STORE_APP_ID}/customerReviews` +
    `?sort=-createdDate&limit=200&include=response`;

  const reviews: StoreReview[] = [];
  for (let page = 0; url && page < pages; page++) {
    const res: Response = await fetch(url, { headers: auth });
    if (!res.ok) throw new Error(`App Store Connect ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      data: Resource<ReviewAttrs>[];
      included?: Resource<ResponseAttrs>[];
      links?: { next?: string };
    };
    const responses = new Map((data.included ?? []).map((r) => [r.id, r.attributes]));

    for (const r of data.data) {
      const reply = responses.get(r.relationships?.response?.data?.id ?? "");
      reviews.push({
        store: "app_store",
        review_id: r.id,
        rating: r.attributes.rating,
        title: r.attributes.title?.trim() || null,
        body: r.attributes.body?.trim() || null,
        author: r.attributes.reviewerNickname ?? null,
        app_version: null,
        language: null,
        territory: r.attributes.territory ?? null,
        reviewed_at: r.attributes.createdDate,
        reply_body: reply?.responseBody ?? null,
        replied_at: reply?.lastModifiedDate ?? null,
      });
    }
    url = data.links?.next;
  }
  return reviews;
}

/** Publishes a developer response to an App Store review (shows after Apple's review, usually within a day). */
export async function replyToAppStoreReview(reviewId: string, text: string) {
  const res = await fetch("https://api.appstoreconnect.apple.com/v1/customerReviewResponses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody: text },
        relationships: { review: { data: { type: "customerReviews", id: reviewId } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`App Store Connect ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// First-time downloads in Sales and Trends (iPhone, universal, iPad, Mac). Updates (7) and
// re-downloads (3) are left out, so this matches "installs" on the Play side.
const FIRST_DOWNLOADS = new Set(["1", "1F", "1T", "F1"]);

/**
 * First-time downloads of this app on one day (YYYY-MM-DD, Pacific time, as Apple reports it).
 * Daily reports appear about a day later and are kept for a year. Null when Apple has no report yet.
 */
export async function fetchAppStoreDownloads(day: string): Promise<number | null> {
  const q = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": process.env.APP_STORE_VENDOR_NUMBER!,
    "filter[reportDate]": day,
  });
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, {
    headers: { Authorization: `Bearer ${token(process.env.APP_STORE_SALES_KEY_ID, process.env.APP_STORE_SALES_PRIVATE_KEY_B64)}`, Accept: "application/a-gzip" },
  });
  if (res.status === 404) {
    const body = await res.text();
    // "There were no sales for the date specified" means a real zero; otherwise the report isn't out yet.
    return /no sales/i.test(body) ? 0 : null;
  }
  if (!res.ok) throw new Error(`App Store sales report ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const [header, ...rows] = gunzipSync(Buffer.from(await res.arrayBuffer()))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));
  const col = (label: string) => header.findIndex((h) => h.trim() === label);
  const [type, units, appleId] = [col("Product Type Identifier"), col("Units"), col("Apple Identifier")];
  if (type < 0 || units < 0) throw new Error("App Store sales report: unexpected columns");
  return rows
    .filter((r) => FIRST_DOWNLOADS.has(r[type]?.trim()) && (appleId < 0 || r[appleId]?.trim() === process.env.APP_STORE_APP_ID))
    .reduce((sum, r) => sum + (Number(r[units]) || 0), 0);
}
