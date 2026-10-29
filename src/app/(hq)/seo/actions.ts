"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { assist } from "@/lib/seo/assist";
import { ASSIST_LABELS, type AssistKind } from "@/lib/seo/assist-kinds";
import { CATEGORIES, categoryLabel, type PostFields } from "@/lib/seo/content";
import { DOODLES, uploadHeaderImage, type Doodle } from "@/lib/seo/header-image";
import {
  autosave,
  createPost,
  discardAutosave,
  deletePost,
  getVersion,
  publishPost,
  savePost,
  schedulePost,
  setStatus,
  uniqueSlug,
  uploadEditorImage,
} from "@/lib/seo/posts";

const who = (email: string) => email.split("@")[0];
export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Only the fields the editor may set, with their types enforced. */
function fieldsFrom(input: PostFields): PostFields {
  const s = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  return {
    title: s(input.title, 300),
    slug: s(input.slug, 120),
    seo_title: s(input.seo_title, 120),
    meta_description: s(input.meta_description, 400),
    excerpt: s(input.excerpt, 600),
    content_html: s(input.content_html, 500_000),
    image_url: s(input.image_url, 1000),
    image_alt: s(input.image_alt, 300),
    category: (CATEGORIES as readonly string[]).includes(input.category) ? input.category : "",
    keywords: (Array.isArray(input.keywords) ? input.keywords : []).map((k) => s(k, 80).trim()).filter(Boolean).slice(0, 12),
  };
}

const refresh = (id?: string) => {
  revalidatePath("/seo");
  revalidatePath("/seo/posts");
  if (id) revalidatePath(`/seo/posts/${id}`);
};

export async function newPostAction() {
  const admin = await requireAdmin();
  const id = await createPost("Untitled post", who(admin.email));
  refresh();
  redirect(`/seo/posts/${id}`);
}

export async function autosaveAction(id: string, fields: PostFields) {
  await requireAdmin();
  return run(() => autosave(id, fieldsFrom(fields)));
}

export async function discardAutosaveAction(id: string) {
  await requireAdmin();
  return run(() => discardAutosave(id));
}

export async function saveAction(id: string, fields: PostFields) {
  const admin = await requireAdmin();
  const r = await run(() => savePost(id, fieldsFrom(fields), who(admin.email)));
  refresh(id);
  return r;
}

export async function publishAction(id: string, fields: PostFields) {
  const admin = await requireAdmin();
  const r = await run(async () => {
    await savePost(id, fieldsFrom(fields), who(admin.email));
    await publishPost(id, who(admin.email));
  });
  refresh(id);
  return r;
}

export async function statusAction(id: string, status: "draft" | "archived") {
  const admin = await requireAdmin();
  const r = await run(() => setStatus(id, status, who(admin.email)));
  refresh(id);
  return r;
}

export async function scheduleAction(id: string, fields: PostFields, at: string | null) {
  const admin = await requireAdmin();
  const r = await run(async () => {
    await savePost(id, fieldsFrom(fields), who(admin.email));
    await schedulePost(id, at ? new Date(at).toISOString() : null);
  });
  refresh(id);
  return r;
}

export async function deleteAction(id: string) {
  await requireAdmin();
  await deletePost(id);
  refresh();
  redirect("/seo/posts");
}

export async function suggestSlugAction(id: string, title: string) {
  await requireAdmin();
  return run(() => uniqueSlug(title, id));
}

export async function uploadImageAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  const folder = formData.get("folder") === "header-images" ? "header-images" : "editor-images";
  if (!(file instanceof File)) return { ok: false, error: "No file" } as Result<{ url: string; path: string }>;
  return run(() => uploadEditorImage(file, folder));
}

export async function headerImageAction(input: { slug: string; headline: string; mark: string; category: string; doodle: string }) {
  await requireAdmin();
  return run(async () => {
    if (!input.headline.trim()) throw new Error("Write a short headline for the image first.");
    if (!input.slug) throw new Error("The post needs a slug first.");
    const doodle = (DOODLES as readonly string[]).includes(input.doodle) ? (input.doodle as Doodle) : "compass";
    return uploadHeaderImage({
      slug: input.slug,
      headline: input.headline.trim().slice(0, 70),
      mark: input.mark.trim() || undefined,
      category: categoryLabel(input.category || "notes").slice(0, 24),
      doodle,
    });
  });
}

export async function versionAction(id: string, versionId: number) {
  await requireAdmin();
  return run(async () => {
    const snap = await getVersion(id, versionId);
    if (!snap) throw new Error("Version not found");
    return snap;
  });
}

export async function assistAction(id: string, kind: AssistKind, ctx: { title: string; keyword: string; selection: string; postHtml: string }) {
  await requireAdmin();
  if (!(kind in ASSIST_LABELS)) return { ok: false, error: "Unknown action" } as Result<string>;
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not set" } as Result<string>;
  return run(() => assist({ blogId: id, kind, title: ctx.title, keyword: ctx.keyword, selection: ctx.selection.slice(0, 20_000), postHtml: ctx.postHtml }));
}
