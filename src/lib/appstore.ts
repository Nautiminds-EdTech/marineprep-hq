import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import type { StoreReview } from "@/lib/reviews";

// App Store Connect API with a Team key (Customer Support role is enough for reviews).

export function appStoreConfigured() {
  return !!(
    process.env.APP_STORE_ISSUER_ID &&
    process.env.APP_STORE_KEY_ID &&
    process.env.APP_STORE_PRIVATE_KEY_B64 &&
    process.env.APP_STORE_APP_ID
  );
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Short-lived ES256 token for the App Store Connect API (max 20 minutes). */
function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APP_STORE_KEY_ID, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: process.env.APP_STORE_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }),
  );
  const key = createPrivateKey(Buffer.from(process.env.APP_STORE_PRIVATE_KEY_B64!, "base64").toString("utf8"));
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
