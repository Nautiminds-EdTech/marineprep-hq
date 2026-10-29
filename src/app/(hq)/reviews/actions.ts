"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncInstalls } from "@/lib/installs";
import { discardReply, draftPending, draftReply, getReply, saveDraft, sendReply } from "@/lib/replies";
import { collectReviews, markAnswered } from "@/lib/reviews";
import { saveAppFacts } from "@/lib/settings";

export async function refreshReviews() {
  await requireAdmin();
  await collectReviews();
  // Drafting replies and reading install reports take a while; the page doesn't wait for them.
  after(async () => {
    await draftPending().catch((e) => console.error("[reviews] drafting failed:", (e as Error).message));
    await syncInstalls().catch((e) => console.error("[installs] sync failed:", (e as Error).message));
    revalidatePath("/reviews");
  });
  revalidatePath("/reviews");
}

// ── Replies ──────────────────────────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };
const who = (email: string) => email.split("@")[0];
const done = (id: number) => {
  revalidatePath("/reviews");
  revalidatePath(`/reviews/reply/${id}`);
};

/** "Draft a reply" on a review card: Claude drafts it, then the reply page opens. */
export async function draftForReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const store = formData.get("store") === "app_store" ? "app_store" : "google_play";
  const reviewId = String(formData.get("review_id") ?? "");
  const reply = await draftReply(store, reviewId, { by: who(admin.email) });
  done(reply.id);
  redirect(`/reviews/reply/${reply.id}`);
}

export async function saveReplyAction(id: number, text: string): Promise<Result> {
  const admin = await requireAdmin();
  try {
    await saveDraft(id, text, who(admin.email));
    done(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Saves the text as shown, then posts it to the store. */
export async function sendReplyAction(id: number, text: string): Promise<Result> {
  const admin = await requireAdmin();
  try {
    await saveDraft(id, text, who(admin.email));
    const sent = await sendReply(id, who(admin.email), "hq");
    done(id);
    return sent ? { ok: true } : { ok: false, error: "Someone already sent or discarded this reply." };
  } catch (e) {
    done(id);
    return { ok: false, error: (e as Error).message };
  }
}

export async function discardReplyAction(id: number): Promise<Result> {
  const admin = await requireAdmin();
  const ok = await discardReply(id, who(admin.email), "hq");
  done(id);
  return ok ? { ok: true } : { ok: false, error: "Already sent or discarded." };
}

export async function redraftReplyAction(id: number, instruction: string): Promise<Result> {
  const admin = await requireAdmin();
  try {
    const reply = await getReply(id);
    if (!reply) throw new Error("Reply not found");
    await draftReply(reply.store, reply.review_id, { instruction: instruction.trim().slice(0, 500) || undefined, by: who(admin.email) });
    done(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** For replies posted in the store console that the store doesn't report back to HQ. */
export async function markAnsweredAction(formData: FormData) {
  await requireAdmin();
  const store = formData.get("store") === "app_store" ? "app_store" : "google_play";
  await markAnswered(store, String(formData.get("review_id") ?? ""));
  revalidatePath("/reviews");
}

export async function saveAppFactsAction(text: string): Promise<Result> {
  const admin = await requireAdmin();
  try {
    await saveAppFacts(text, who(admin.email));
    revalidatePath("/reviews/app-facts");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
