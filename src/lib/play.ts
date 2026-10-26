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
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
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
