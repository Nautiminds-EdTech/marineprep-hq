import "server-only";
import { cacheLife } from "next/cache";

// The rating each store shows on MarinePrep's public listing, read the way a visitor sees it (no
// credentials): Play's listing page carries it as schema.org data, and Apple's public lookup API
// returns it per storefront. Both are for India, where nearly all students are.

export type StoreRating = {
  /** null when the store shows no rating yet */
  average: number | null;
  count: number;
  url: string;
  /** Downloads band (Play) or live version (App Store) */
  extra: string | null;
};

export async function playListingRating(): Promise<StoreRating> {
  "use cache";
  cacheLife("hours");

  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!pkg) throw new Error("GOOGLE_PLAY_PACKAGE_NAME is not set");
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en_IN&gl=IN`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-IN,en;q=0.9" } });
  if (!res.ok) throw new Error(`Google Play listing ${res.status}`);
  const html = await res.text();

  const value = html.match(/"ratingValue":"?([\d.]+)/)?.[1];
  const count = html.match(/"ratingCount":"?(\d+)/)?.[1];
  const downloads = html.match(/>([\d.,]+[KMB]?\+)<\/div><div[^>]*>Downloads/)?.[1];
  return {
    average: value ? Number(value) : null,
    count: count ? Number(count) : 0,
    url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`,
    extra: downloads ? `${downloads} downloads` : null,
  };
}

export async function appStoreListingRating(): Promise<StoreRating> {
  "use cache";
  cacheLife("hours");

  const id = process.env.APP_STORE_APP_ID;
  if (!id) throw new Error("APP_STORE_APP_ID is not set");
  const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=in`);
  if (!res.ok) throw new Error(`App Store lookup ${res.status}`);
  const data = (await res.json()) as {
    results?: { averageUserRating?: number; userRatingCount?: number; version?: string; trackViewUrl?: string }[];
  };
  const app = data.results?.[0];
  if (!app) throw new Error("App Store lookup found no app for APP_STORE_APP_ID");
  return {
    average: app.userRatingCount ? (app.averageUserRating ?? null) : null,
    count: app.userRatingCount ?? 0,
    url: app.trackViewUrl?.split("?")[0] ?? `https://apps.apple.com/in/app/id${id}`,
    extra: app.version ? `Version ${app.version}` : null,
  };
}
