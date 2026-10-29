import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { requireAdmin } from "@/lib/auth";
import { getPost, listVersions, toFields } from "@/lib/seo/posts";
import { createServiceClient } from "@/lib/supabase/server";
import { Editor } from "./editor";

export const metadata = { title: "Edit post · MarinePrep HQ" };
// Publishing can also request a site rebuild; Claude actions take up to a minute.
export const maxDuration = 120;

export default function EditPostPage({ params }: PageProps<"/seo/posts/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
          <div className="skeleton h-[70vh]" />
          <div className="skeleton hidden h-[70vh] lg:block" />
        </div>
      }
    >
      <Load params={params} />
    </Suspense>
  );
}

async function Load({ params }: Pick<PageProps<"/seo/posts/[id]">, "params">) {
  await requireAdmin();
  if (!createServiceClient()) return <Notice tone="warning">The editor needs SUPABASE_SERVICE_ROLE_KEY.</Notice>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [post, versions] = await Promise.all([getPost(id), listVersions(id)]);
  if (!post) notFound();
  // Key by the last save so a refresh after saving resets the editor to the saved state.
  return <Editor key={post.content_updated_at ?? post.created_at} post={post} saved={toFields(post)} versions={versions} />;
}
