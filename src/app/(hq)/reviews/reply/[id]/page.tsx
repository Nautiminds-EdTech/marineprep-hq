import { ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { requireAdmin } from "@/lib/auth";
import { getReply, REPLY_LIMIT, SUPPORT_EMAIL } from "@/lib/replies";
import { STORE_LABEL } from "@/lib/reviews";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTimeIST, timeAgo } from "@/lib/time";
import { ReplyEditor } from "./reply-editor";

export const metadata = { title: "Reply to a review · MarinePrep HQ" };
// Sending posts to the store; redrafting asks Claude.
export const maxDuration = 120;

export default function ReplyPage({ params }: PageProps<"/reviews/reply/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Link href="/reviews" className="btn btn-sm self-start">
        <ArrowLeft size={15} aria-hidden /> Reviews
      </Link>
      <Suspense fallback={<div className="skeleton h-96" aria-hidden />}>
        <Load params={params} />
      </Suspense>
    </div>
  );
}

async function Load({ params }: Pick<PageProps<"/reviews/reply/[id]">, "params">) {
  await requireAdmin();
  if (!createServiceClient()) return <Notice tone="warning">Replies need SUPABASE_SERVICE_ROLE_KEY.</Notice>;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const reply = await getReply(id);
  if (!reply) notFound();
  const r = reply.review;

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Reply to a {r.rating}★ review</h1>
        <p className="mt-1 text-sm text-ink-2">
          Posted publicly on {STORE_LABEL[r.store]} under the review. At most {REPLY_LIMIT} characters. Mention {SUPPORT_EMAIL} only
          when they need to send us details.
        </p>
      </header>

      <article className="card flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${r.rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={15} strokeWidth={0} className={i <= r.rating ? "fill-star" : "fill-line-strong"} aria-hidden />
            ))}
          </span>
          <span className="chip bg-surface-2 text-ink-2">{STORE_LABEL[r.store]}</span>
        </div>
        <p className="flex flex-wrap gap-x-2 text-xs text-ink-3">
          {r.author && <span className="font-medium text-ink-2">{r.author}</span>}
          {r.app_version && <span>v{r.app_version}</span>}
          {r.territory && <span>{r.territory}</span>}
          <time dateTime={r.reviewed_at} title={formatTimeIST(r.reviewed_at)}>
            {timeAgo(r.reviewed_at)}
          </time>
        </p>
        {r.title && <p className="font-display font-semibold break-words">{r.title}</p>}
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{r.body}</p>
      </article>

      <ReplyEditor
        key={reply.updated_at}
        id={reply.id}
        initial={reply.draft}
        initialFollowup={reply.needs_followup}
        status={reply.status}
        error={reply.error}
        decided={reply.decided_by ? `${reply.decided_by} (${reply.decided_via === "telegram" ? "Telegram" : "HQ"})` : null}
        editedBy={reply.edited_by}
        store={STORE_LABEL[r.store]}
        limit={REPLY_LIMIT}
        email={SUPPORT_EMAIL}
      />
    </>
  );
}
