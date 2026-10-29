import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { blockers, checks, cleanHtml, readingMinutes, slugify, type Check, type PostFields } from "@/lib/seo/content";
import { dispatchBlogChange } from "@/lib/seo/deploy";

// Blog posts for HQ's SEO section. Callers run requireAdmin() first; this uses the service role.
// blogs.status stays draft | published | archived (the site only reads 'published'); HQ's own state
// (approval, schedule, autosave) lives in blog_pipeline.

export type PostStatus = "draft" | "published" | "archived";
export type PipelineState = "drafting" | "awaiting_approval" | "needs_changes" | "approved" | "discarded";

export type PostSummary = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  excerpt: string | null;
  meta_description: string | null;
  image_url: string | null;
  category: string | null;
  reading_time_minutes: number | null;
  view_count: number | null;
  created_at: string;
  published_at: string | null;
  content_updated_at: string | null;
  pipeline: { state: PipelineState; origin: "ai" | "manual"; scheduled_for: string | null; autosaved_at: string | null } | null;
};

export type Post = PostSummary & {
  seo_title: string | null;
  content_html: string;
  image_path: string | null;
  image_alt: string | null;
  keywords: string[] | null;
  related_slugs: string[];
  pipeline: (NonNullable<PostSummary["pipeline"]> & { review: Record<string, unknown>; autosave: Partial<PostFields> | null; feedback: string | null }) | null;
};

const SUMMARY = "id,title,slug,status,excerpt,meta_description,image_url,category,reading_time_minutes,view_count,created_at,published_at,content_updated_at";
const PIPE = "state,origin,scheduled_for,autosaved_at";

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client;
}

// PostgREST returns a one-to-one embed as an object (or an array on older versions).
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function listPosts(): Promise<PostSummary[]> {
  const { data, error } = await db()
    .from("blogs")
    .select(`${SUMMARY}, blog_pipeline(${PIPE})`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ blog_pipeline, ...p }) => ({ ...p, pipeline: one(blog_pipeline) }) as PostSummary);
}

/** Checklist results for every published post (the SEO overview's "needs work" list). */
export async function publishedHealth(): Promise<{ id: string; title: string; slug: string; failing: Check[] }[]> {
  const { data, error } = await db()
    .from("blogs")
    .select("id,title,slug,seo_title,meta_description,excerpt,content_html,image_url,image_alt,category,keywords")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    failing: checks(toFields({ ...p, related_slugs: [] } as unknown as Post)).filter((c) => !c.ok),
  }));
}

/** Claude spend this calendar month (IST), from seo_runs. */
export async function monthSpend() {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3_600_000).toISOString();
  const { data } = await db().from("seo_runs").select("cost_usd").gte("started_at", start);
  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
}

export async function getPost(id: string): Promise<Post | null> {
  const { data, error } = await db()
    .from("blogs")
    .select(`${SUMMARY},seo_title,content_html,image_path,image_alt,keywords,related_slugs, blog_pipeline(${PIPE},review,autosave,feedback)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { blog_pipeline, ...p } = data;
  return { ...p, pipeline: one(blog_pipeline) } as Post;
}

/** A slug no other post uses: "x", then "x-2", "x-3"… */
export async function uniqueSlug(base: string, exceptId?: string) {
  const root = slugify(base) || "post";
  const { data } = await db().from("blogs").select("id,slug").like("slug", `${root}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

export async function createPost(title: string, by: string) {
  const slug = await uniqueSlug(title);
  const { data, error } = await db()
    .from("blogs")
    .insert({ title, slug, status: "draft", content_html: "<p></p>", seo_title: null, keywords: [] })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db().from("blog_pipeline").insert({ blog_id: data.id, origin: "manual", state: "drafting" });
  await snapshot(data.id, "saved", by, "Created");
  return data.id as string;
}

/** Columns written from the editor's fields. content_markdown is cleared: HTML is the source now. */
function columns(f: PostFields) {
  const html = cleanHtml(f.content_html);
  return {
    title: f.title.trim(),
    slug: f.slug,
    seo_title: f.seo_title.trim() || null,
    meta_description: f.meta_description.trim() || null,
    excerpt: f.excerpt.trim() || null,
    content_html: html,
    content_markdown: null,
    image_url: f.image_url || null,
    image_alt: f.image_alt.trim() || null,
    category: f.category || null,
    keywords: f.keywords.length ? f.keywords : null,
    seo_keywords: f.keywords.join(", ") || null,
    reading_time_minutes: readingMinutes(html),
  };
}

async function snapshot(id: string, kind: "saved" | "published" | "ai" | "restored", by: string, note?: string) {
  const { data } = await db().from("blogs").select("title,slug,seo_title,meta_description,excerpt,content_html,image_url,image_alt,category,keywords").eq("id", id).single();
  if (data) await db().from("blog_versions").insert({ blog_id: id, kind, snapshot: data, saved_by: by, note: note ?? null });
}

/** Keeps unsaved editor state without touching the live row. */
export async function autosave(id: string, fields: PostFields) {
  const { error } = await db()
    .from("blog_pipeline")
    .upsert({ blog_id: id, autosave: fields, autosaved_at: new Date().toISOString() }, { onConflict: "blog_id" });
  if (error) throw new Error(error.message);
}

const clearAutosave = (id: string) => db().from("blog_pipeline").update({ autosave: null, autosaved_at: null }).eq("blog_id", id);

export async function discardAutosave(id: string) {
  const { error } = await clearAutosave(id);
  if (error) throw new Error(error.message);
}

async function assertSlugFree(id: string, slug: string) {
  const { data } = await db().from("blogs").select("id").eq("slug", slug).neq("id", id).maybeSingle();
  if (data) throw new Error(`Another post already uses the slug "${slug}".`);
}

/**
 * Saves the editor's fields. For a published post this updates the live content (so the editor
 * only calls it from "Update live post"), sets content_updated_at and asks the site to rebuild.
 */
export async function savePost(id: string, fields: PostFields, by: string) {
  const current = await getPost(id);
  if (!current) throw new Error("Post not found");
  await assertSlugFree(id, fields.slug);
  const live = current.status === "published";
  if (live) {
    const blocking = blockers(fields);
    if (blocking.length) throw new Error(`Can't update the live post: ${blocking.map((b) => b.label).join(", ")}.`);
  }
  const cols = columns(fields);
  const changed = cols.content_html !== current.content_html || cols.title !== current.title;
  const { error } = await db()
    .from("blogs")
    .update({ ...cols, ...(live && changed ? { content_updated_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await clearAutosave(id);
  await snapshot(id, live ? "published" : "saved", by);
  if (live) await dispatchBlogChange([fields.slug], "updated");
}

export async function publishPost(id: string, by: string, via: "hq" | "telegram" = "hq") {
  const post = await getPost(id);
  if (!post) throw new Error("Post not found");
  const fields = toFields(post);
  const blocking = blockers(fields);
  if (blocking.length) throw new Error(`Can't publish yet: ${blocking.map((b) => b.label).join(", ")}.`);
  const now = new Date().toISOString();
  const { error } = await db()
    .from("blogs")
    // A post that was live before keeps its dates; a first publish starts both at now.
    .update({ status: "published", published_at: post.published_at ?? now, content_updated_at: post.published_at ? (post.content_updated_at ?? now) : now })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await db()
    .from("blog_pipeline")
    .upsert({ blog_id: id, state: "approved", decided_by: by, decided_via: via, decided_at: now, scheduled_for: null }, { onConflict: "blog_id" });
  await snapshot(id, "published", by, "Published");
  await dispatchBlogChange([post.slug], "published");
}

export async function setStatus(id: string, status: "draft" | "archived", by: string) {
  const post = await getPost(id);
  if (!post) throw new Error("Post not found");
  const { error } = await db().from("blogs").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await db().from("blog_pipeline").upsert({ blog_id: id, scheduled_for: null }, { onConflict: "blog_id" });
  await snapshot(id, "saved", by, status === "archived" ? "Archived" : "Unpublished");
  if (post.status === "published") await dispatchBlogChange([post.slug], "unpublished");
}

/** Publishes at the next daily run (09:00 IST) on or after this time. null clears the schedule. */
export async function schedulePost(id: string, at: string | null) {
  if (at) {
    const post = await getPost(id);
    if (!post) throw new Error("Post not found");
    const blocking = blockers(toFields(post));
    if (blocking.length) throw new Error(`Fix these before scheduling: ${blocking.map((b) => b.label).join(", ")}.`);
  }
  const { error } = await db().from("blog_pipeline").upsert({ blog_id: id, scheduled_for: at }, { onConflict: "blog_id" });
  if (error) throw new Error(error.message);
}

/** Called by the daily cron: publishes every post whose scheduled time has passed. */
export async function publishDue(now = new Date()) {
  const { data } = await db().from("blog_pipeline").select("blog_id").lte("scheduled_for", now.toISOString());
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const { blog_id } of data ?? []) {
    try {
      await publishPost(blog_id, "schedule");
      done.push(blog_id);
    } catch (e) {
      failed.push({ id: blog_id, error: (e as Error).message });
    }
  }
  return { done, failed };
}

export async function listVersions(id: string) {
  const { data } = await db().from("blog_versions").select("id,kind,saved_by,note,created_at").eq("blog_id", id).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function getVersion(blogId: string, versionId: number) {
  const { data } = await db().from("blog_versions").select("snapshot").eq("blog_id", blogId).eq("id", versionId).maybeSingle();
  return (data?.snapshot ?? null) as Partial<PostFields> | null;
}

// ---- delete, including Storage files no other post uses ----

const STORAGE_PREFIX = "/storage/v1/object/public/blog-images/";
function storagePath(url: string) {
  const at = url.indexOf(STORAGE_PREFIX);
  return at < 0 ? null : decodeURIComponent(url.slice(at + STORAGE_PREFIX.length).split("?")[0]);
}
function imagePaths(post: { image_url: string | null; image_path: string | null; content_html: string }) {
  const paths = new Set<string>();
  if (post.image_path) paths.add(post.image_path);
  for (const url of [post.image_url ?? "", ...[...post.content_html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])]) {
    const p = storagePath(url);
    if (p) paths.add(p);
  }
  return paths;
}

export async function deletePost(id: string) {
  const post = await getPost(id);
  if (!post) return;
  const mine = imagePaths(post);
  // Keep files another post still points at.
  const { data: others } = await db().from("blogs").select("image_url,image_path,content_html").neq("id", id);
  for (const o of others ?? []) for (const p of imagePaths(o)) mine.delete(p);

  const { error } = await db().from("blogs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (mine.size) await db().storage.from("blog-images").remove([...mine]);
  if (post.status === "published") await dispatchBlogChange([post.slug], "unpublished");
}

export function toFields(p: Post): PostFields {
  return {
    title: p.title,
    slug: p.slug,
    seo_title: p.seo_title ?? "",
    meta_description: p.meta_description ?? "",
    excerpt: p.excerpt ?? "",
    content_html: p.content_html ?? "",
    image_url: p.image_url ?? "",
    image_alt: p.image_alt ?? "",
    category: p.category ?? "",
    keywords: p.keywords ?? [],
  };
}

/** Uploads an editor image (already WebP-compressed in the browser) and returns its public URL. */
export async function uploadEditorImage(file: File, folder: "editor-images" | "header-images") {
  if (!file.type.startsWith("image/")) throw new Error("Only images can be uploaded.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be under 5 MB.");
  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const storage = db().storage.from("blog-images");
  const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { path, url: storage.getPublicUrl(path).data.publicUrl };
}
