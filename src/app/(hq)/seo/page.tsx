import { CalendarClock, FilePen, Hourglass, Newspaper, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { PageHeader, Section } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeleton";
import { StatTile } from "@/components/stat-tile";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { listPosts, monthSpend, publishedHealth } from "@/lib/seo/posts";
import { createServiceClient } from "@/lib/supabase/server";
import { newPostAction } from "./actions";

export const metadata = { title: "Blog & SEO · MarinePrep HQ" };

export default function SeoPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blog & SEO"
        description="Posts on marineprep.app/blogs. New drafts come from the topic plan or start here; nothing goes live without an approval."
        actions={
          <>
            <Link href="/seo/posts" className="btn">
              <Newspaper size={16} aria-hidden /> All posts
            </Link>
            <form action={newPostAction}>
              <SubmitButton className="btn-primary" pending="Creating…">
                <Plus size={16} aria-hidden /> New post
              </SubmitButton>
            </form>
          </>
        }
      />
      <Suspense fallback={<PageSkeleton label="Loading the blog" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  await requireAdmin();
  if (!createServiceClient()) return <Notice tone="warning">The blog needs SUPABASE_SERVICE_ROLE_KEY.</Notice>;

  const [posts, health, spend] = await Promise.all([listPosts(), publishedHealth(), monthSpend().catch(() => 0)]);
  const count = (f: (p: (typeof posts)[number]) => boolean) => posts.filter(f).length;
  const published = count((p) => p.status === "published");
  const drafts = count((p) => p.status === "draft");
  const waiting = count((p) => p.pipeline?.state === "awaiting_approval");
  const scheduled = count((p) => !!p.pipeline?.scheduled_for && p.status !== "published");
  const needsWork = health.filter((h) => h.failing.length > 0);
  const views = posts.reduce((n, p) => n + (p.view_count ?? 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Live posts" value={String(published)} sub={`${views.toLocaleString("en-IN")} views in all`} icon={Newspaper} href="/seo/posts?view=published" />
        <StatTile label="Waiting for approval" value={String(waiting)} icon={Hourglass} tone={waiting ? "warning" : "default"} href="/seo/posts?view=waiting" />
        <StatTile label="Drafts" value={String(drafts)} icon={FilePen} href="/seo/posts?view=drafts" />
        <StatTile label="Scheduled" value={String(scheduled)} sub="Publishes at 09:00 IST" icon={CalendarClock} href="/seo/posts?view=scheduled" />
      </div>

      <Section
        title="Live posts that need work"
        description="Checked against the publishing checklist. Fix them in the editor; each update goes live when you save."
        action={<span className="text-xs text-ink-3">Claude spend this month: ${spend.toFixed(2)}</span>}
      >
        {needsWork.length === 0 ? (
          <p className="text-sm text-ink-2">Every live post passes the checklist.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {needsWork.map((h) => (
              <li key={h.id}>
                <Link href={`/seo/posts/${h.id}`} className="flex flex-col gap-1.5 py-3 hover:text-accent sm:flex-row sm:items-start sm:gap-4">
                  <span className="min-w-0 flex-1 text-sm font-medium">{h.title}</span>
                  <span className="flex flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
                    {h.failing.slice(0, 4).map((c) => (
                      <span key={c.id} className={`chip ${c.blocker ? "bg-critical-soft text-critical" : "bg-warning-soft text-warning"}`}>
                        {c.blocker && <TriangleAlert size={12} aria-hidden />}
                        {c.label}
                      </span>
                    ))}
                    {h.failing.length > 4 && <span className="chip bg-surface-2 text-ink-3">+{h.failing.length - 4} more</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
