"use client";

import { CalendarClock, Clock, ExternalLink, Eye, ImageOff, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryLabel, postUrl } from "@/lib/seo/content";
import type { PostSummary } from "@/lib/seo/posts";
import { VIEWS, type View } from "./views";


const inView: Record<View, (p: PostSummary) => boolean> = {
  all: () => true,
  waiting: (p) => p.pipeline?.state === "awaiting_approval",
  drafts: (p) => p.status === "draft",
  scheduled: (p) => !!p.pipeline?.scheduled_for && p.status !== "published",
  published: (p) => p.status === "published",
  archived: (p) => p.status === "archived",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function PostList({ posts, initialView }: { posts: PostSummary[]; initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter(inView[view])
      .filter((p) => !q || [p.title, p.slug, p.meta_description, p.excerpt, p.category].some((v) => v?.toLowerCase().includes(q)));
  }, [posts, view, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter posts">
          {VIEWS.map((v) => {
            const n = posts.filter(inView[v.id]).length;
            const active = v.id === view;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={active}
                onClick={() => setView(v.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2 text-ink-2 hover:text-ink"
                }`}
              >
                {v.label} <span className={active ? "opacity-80" : "text-ink-3"}>{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative sm:w-64">
          <span className="sr-only">Search posts</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, slug, category" className="field w-full py-2 pl-9 text-sm" />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-2">No posts here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ post }: { post: PostSummary }) {
  if (post.pipeline?.state === "awaiting_approval") return <span className="chip bg-warning-soft text-warning">Waiting for approval</span>;
  if (post.status === "published") return <span className="chip bg-good-soft text-good">Live</span>;
  if (post.status === "archived") return <span className="chip bg-surface-2 text-ink-3">Archived</span>;
  if (post.pipeline?.scheduled_for)
    return (
      <span className="chip bg-accent-soft text-accent">
        <CalendarClock size={12} aria-hidden /> {dateFmt.format(new Date(post.pipeline.scheduled_for))}
      </span>
    );
  return <span className="chip bg-surface-2 text-ink-2">Draft</span>;
}

function PostCard({ post }: { post: PostSummary }) {
  const date = post.published_at ?? post.created_at;
  return (
    <div className="card relative flex gap-3 p-3 transition-colors hover:border-line-strong sm:gap-4 sm:p-4">
      <div className="aspect-[1200/630] w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-40">
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage URLs, many sizes; a thumbnail doesn't need next/image
          <img src={post.image_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-3">
            <ImageOff size={18} aria-hidden />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip post={post} />
          {post.pipeline?.origin === "ai" && (
            <span className="chip bg-surface-2 text-ink-3">
              <Sparkles size={12} aria-hidden /> Drafted by Claude
            </span>
          )}
          {post.category && <span className="chip bg-surface-2 text-ink-3">{categoryLabel(post.category)}</span>}
        </div>
        <h2 className="text-[15px] leading-snug font-semibold sm:text-base">
          <Link href={`/seo/posts/${post.id}`} className="after:absolute after:inset-0 hover:text-accent">
            {post.title}
          </Link>
        </h2>
        {(post.excerpt || post.meta_description) && (
          <p className="line-clamp-2 hidden text-sm text-ink-2 sm:block">{post.excerpt || post.meta_description}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{dateFmt.format(new Date(date))}</span>
          {post.reading_time_minutes && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden /> {post.reading_time_minutes} min
            </span>
          )}
          {post.status === "published" && (
            <>
              <span className="inline-flex items-center gap-1">
                <Eye size={12} aria-hidden /> {(post.view_count ?? 0).toLocaleString("en-IN")}
              </span>
              <a href={postUrl(post.slug)} target="_blank" rel="noreferrer" className="relative z-10 inline-flex items-center gap-1 hover:text-accent">
                View live <ExternalLink size={12} aria-hidden />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
