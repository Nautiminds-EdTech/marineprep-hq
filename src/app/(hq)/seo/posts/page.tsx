import { Plus } from "lucide-react";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { listPosts } from "@/lib/seo/posts";
import { createServiceClient } from "@/lib/supabase/server";
import { newPostAction } from "../actions";
import { PostList } from "./post-list";
import { VIEWS, type View } from "./views";

export const metadata = { title: "Posts · MarinePrep HQ" };

export default function PostsPage({ searchParams }: PageProps<"/seo/posts">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="Every post on marineprep.app/blogs, drafts included."
        actions={
          <form action={newPostAction}>
            <SubmitButton className="btn-primary" pending="Creating…">
              <Plus size={16} aria-hidden /> New post
            </SubmitButton>
          </form>
        }
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="skeleton h-10" />
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
          </div>
        }
      >
        <Posts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Posts({ searchParams }: Pick<PageProps<"/seo/posts">, "searchParams">) {
  await requireAdmin();
  if (!createServiceClient()) return <Notice tone="warning">The blog needs SUPABASE_SERVICE_ROLE_KEY.</Notice>;
  const [{ view }, posts] = await Promise.all([searchParams, listPosts()]);
  const initial = (VIEWS.some((v) => v.id === view) ? view : "all") as View;
  return <PostList posts={posts} initialView={initial} />;
}
