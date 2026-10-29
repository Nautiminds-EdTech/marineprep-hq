import "server-only";

// Asks the landing site to rebuild after a post is published, updated or unpublished
// (../marineprep-landing-page/SEO-BLOG-HQ-CONTRACT.md, section 4.1). Until the landing revamp ships
// its GitHub Action, GITHUB_LANDING_DISPATCH_TOKEN stays unset and this does nothing: the current
// site reads posts from Supabase in the browser, so they show up right away anyway.

const REPO = process.env.GITHUB_LANDING_REPO ?? "marineprep/marineprep-landing-page";

export type BlogChange = "published" | "updated" | "unpublished";

export async function dispatchBlogChange(slugs: string[], reason: BlogChange) {
  const token = process.env.GITHUB_LANDING_DISPATCH_TOKEN;
  if (!token) return { sent: false as const };
  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ event_type: "blog-changed", client_payload: { slugs, reason } }),
  });
  // The post is already saved; a failed rebuild request is logged, not thrown.
  if (!res.ok) console.error(`[seo] dispatch failed: ${res.status} ${await res.text()}`);
  return { sent: res.ok };
}
