import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { replyToAppStoreReview } from "@/lib/appstore";
import { replyToPlayReview } from "@/lib/play";
import { replyable, STORE_LABEL, type SavedReview, type Store } from "@/lib/reviews";
import { claude, claudeErrorMessage, costUsd } from "@/lib/seo/claude";
import { createServiceClient } from "@/lib/supabase/server";
import { editMessage, esc, sendMessage, telegramConfigured, type Button } from "@/lib/telegram";

// Replies to store reviews: Claude drafts in the voice of the support team, an admin edits in HQ or
// approves on Telegram, and HQ posts the reply to the store. Rules the prompt asks for are also
// checked in code (length, when the support email appears, banned phrasing).

export const REPLY_LIMIT = 350; // Google Play's cap; used for both stores
export const SUPPORT_EMAIL = "support@nautiminds.com";
/** Only new reviews get a draft automatically; older ones get one from the Reviews page. */
const AUTO_DRAFT_WINDOW_MS = 7 * 86_400_000;

export type ReplyStatus = "draft" | "sending" | "sent" | "failed" | "discarded";
export type Reply = {
  id: number;
  store: Store;
  review_id: string;
  draft: string;
  needs_followup: boolean;
  status: ReplyStatus;
  error: string | null;
  edited_by: string | null;
  decided_by: string | null;
  decided_via: "hq" | "telegram" | null;
  sent_at: string | null;
  telegram_message_id: number | null;
  created_at: string;
  updated_at: string;
};
export type ReplyWithReview = Reply & { review: SavedReview };

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client;
}

export const repliesConfigured = () => !!process.env.ANTHROPIC_API_KEY;


// ── Drafting ─────────────────────────────────────────────────────────────────

const Draft = z.object({
  reply: z.string().describe(`The reply, plain text, at most ${REPLY_LIMIT} characters including the sign-off`),
  needs_followup: z
    .boolean()
    .describe(`True only when we need more details from them or the issue needs investigating; then the reply asks them to write to ${SUPPORT_EMAIL}`),
});

const SYSTEM = `You are on the support team of Marine Prep, writing a public reply to one app store review.

Marine Prep is an app by Nautiminds Edtech that helps Class 12 students in India prepare for IMU CET, the Indian
Maritime University entrance exam. It has full-length mock tests, a question bank, chapter notes, previous year
papers, Marine AI for doubts, and one-to-one counselling calls with mentors. Paid plans unlock the full content. It's
on Android and iOS. Support email: ${SUPPORT_EMAIL}.

Write the way a real person on a small, caring support team writes after actually reading this review:
- Respond to what they said: name the feature, problem or praise they mentioned. A reply that could fit any review
  is a bad reply.
- Short and plain. Usually 1-3 sentences. Hard limit: ${REPLY_LIMIT} characters including the sign-off. Aim for
  under 300.
- End with "Team Marine Prep" on its own (no dash before it).
- If the reviewer's name is clearly a first name ("Arjun_07" is Arjun, "Priya S" is Priya), you may start with
  "Hi <name>,". If it isn't clearly a name, don't use one.
- Reply in English, unless the review is in Hindi (Devanagari or Latin script); then reply in simple Hindi in the
  same script.

needs_followup:
- true when we can't help from the review alone and need them to write to us: crashes, bugs, login or OTP
  problems, payment or refund issues, wrong content or answers, account problems, or a complaint with no detail
  ("not working", "bekar app"). Then ask them to email ${SUPPORT_EMAIL} and say exactly what to include (for
  example the phone model and what they were doing, or the payment date). You may say the team will look into it.
- false otherwise (praise, a suggestion, a general opinion). Then don't mention any email address or "contact us".

Never:
- Stock phrases: "We appreciate your feedback", "Thank you for taking the time", "We're sorry to hear",
  "We value your", "Rest assured", "We strive", "your satisfaction", "inconvenience caused", "Dear user",
  "Hope this helps", "Feel free to".
- Promises: no dates, no "fixed in the next update", no refunds, no new features, no discounts. Don't claim
  something is fixed.
- Asking them to change their rating, emojis, hashtags, more than one exclamation mark, em dashes, Markdown.

Examples of the tone (don't copy them):
- 5★ "Very good": "Glad it's working for you. If you haven't tried the full-length mocks yet, they're the closest
  thing to the real IMU CET timing. All the best for the exam. Team Marine Prep"
- 1★ "app not working" by Arjun_07: "Hi Arjun, that shouldn't happen. Could you email ${SUPPORT_EMAIL} with your phone model
  and the screen where it stops? We'll look into it and get back to you. Team Marine Prep"
- 4★ "good but need more physics questions": "Noted on physics. We're adding questions chapter by chapter, and your
  review helps us decide where to start. Meanwhile the question bank filters by chapter if you want to focus on one.
  Team Marine Prep"`;

const BANNED = [
  /appreciate your (feedback|review)/i, /thank you for taking the time/i, /sorry to hear/i, /we value your/i, /rest assured/i,
  /we strive/i, /your satisfaction/i, /inconvenience caused/i, /dear user/i, /hope this helps/i, /feel free to/i, /—/,
];

/** What's wrong with a draft, or null when it passes. */
export function draftProblems(text: string, needsFollowup: boolean) {
  const problems: string[] = [];
  if (text.length > REPLY_LIMIT) problems.push(`it is ${text.length} characters; the limit is ${REPLY_LIMIT}`);
  const hasEmail = text.includes(SUPPORT_EMAIL);
  if (needsFollowup && !hasEmail) problems.push(`needs_followup is true but it doesn't ask them to write to ${SUPPORT_EMAIL}`);
  if (!needsFollowup && /@|contact us|email us|write to us/i.test(text)) problems.push("needs_followup is false, so it mustn't mention email or contacting us");
  const banned = BANNED.filter((re) => re.test(text)).map((re) => re.source.replace(/\\/g, ""));
  if (banned.length) problems.push(`it uses phrasing we avoid: ${banned.join(", ")}`);
  return problems.length ? problems.join("; ") : null;
}

function reviewForPrompt(r: SavedReview, instruction?: string) {
  return [
    `Store: ${STORE_LABEL[r.store]}`,
    `Rating: ${r.rating} of 5`,
    r.author ? `Reviewer name: ${r.author}` : "Reviewer name: (none)",
    r.app_version ? `App version: ${r.app_version}` : "",
    r.themes.length ? `Topics: ${r.themes.join(", ")}` : "",
    r.title ? `Title: ${r.title}` : "",
    `Review: ${r.body}`,
    instruction ? `\nThe admin asks for this in the reply: ${instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Asks Claude for a reply; retries up to twice when the draft breaks a rule. */
async function writeDraft(review: SavedReview, instruction?: string) {
  const client = claude();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: reviewForPrompt(review, instruction) }];
  let cost = 0;
  let model = "claude-opus-5-5";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Draft) },
      system: SYSTEM,
      messages,
    });
    model = response.model;
    cost += costUsd(response.model, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Claude didn't draft a reply for this review.");
    const draft = { ...response.parsed_output, reply: response.parsed_output.reply.trim() };
    const problems = draftProblems(draft.reply, draft.needs_followup);
    if (!problems) return { ...draft, cost, model };
    messages.push({ role: "assistant", content: response.content }, { role: "user", content: `Rewrite it: ${problems}.` });
  }
  throw new Error("Claude's drafts kept breaking the reply rules. Write this one in HQ.");
}

async function loadReview(store: Store, reviewId: string) {
  const { data, error } = await db().from("hq_reviews").select("*").eq("store", store).eq("review_id", reviewId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Review not found");
  return data as SavedReview;
}

/** Drafts (or redrafts) the reply to one review and posts/updates its Telegram approval message. */
export async function draftReply(store: Store, reviewId: string, opts: { instruction?: string; by?: string } = {}) {
  const review = await loadReview(store, reviewId);
  if (!replyable(review)) throw new Error(review.reply_body ? "This review already has a reply." : "This review can't be answered from HQ (no text, or a report-only rating).");
  let draft;
  try {
    draft = await writeDraft(review, opts.instruction);
  } catch (e) {
    throw new Error(e instanceof Anthropic.APIError ? claudeErrorMessage(e) : (e as Error).message);
  }
  const { data, error } = await db()
    .from("hq_review_replies")
    .upsert(
      {
        store,
        review_id: reviewId,
        draft: draft.reply,
        needs_followup: draft.needs_followup,
        status: "draft",
        error: null,
        model: draft.model,
        cost_usd: Number(draft.cost.toFixed(4)),
        edited_by: opts.by ?? null,
      },
      { onConflict: "store,review_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const reply = { ...(data as Reply), review };
  await syncTelegram(reply);
  return reply;
}

/** Drafts replies for new answerable reviews that don't have one yet (cron and "Refresh now"). */
export async function draftPending(limit = 3) {
  if (!repliesConfigured()) return { drafted: 0, errors: [] as string[] };
  const { data: reviews } = await db()
    .from("hq_reviews")
    .select("store, review_id, body, reply_body")
    .is("reply_body", null)
    .not("body", "is", null)
    .not("review_id", "like", "csv:%")
    .gte("reviewed_at", new Date(Date.now() - AUTO_DRAFT_WINDOW_MS).toISOString())
    .order("reviewed_at", { ascending: false })
    .limit(20);
  const { data: existing } = await db().from("hq_review_replies").select("store, review_id");
  const have = new Set((existing ?? []).map((r) => `${r.store}:${r.review_id}`));
  const todo = (reviews ?? []).filter((r) => replyable(r) && !have.has(`${r.store}:${r.review_id}`)).slice(0, limit);

  let drafted = 0;
  const errors: string[] = [];
  for (const r of todo) {
    try {
      await draftReply(r.store as Store, r.review_id);
      drafted++;
    } catch (e) {
      errors.push(`${r.store}:${r.review_id}: ${(e as Error).message}`);
    }
  }
  return { drafted, errors };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function getReply(id: number): Promise<ReplyWithReview | null> {
  const { data, error } = await db().from("hq_review_replies").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...(data as Reply), review: await loadReview(data.store, data.review_id) };
}

/** Reply rows for these reviews, keyed "store:review_id" (for the Reviews page). */
export async function repliesFor(reviews: Pick<SavedReview, "store" | "review_id">[]) {
  if (!reviews.length) return new Map<string, Reply>();
  const { data } = await db()
    .from("hq_review_replies")
    .select("*")
    .in("review_id", reviews.map((r) => r.review_id));
  return new Map((data ?? []).map((r) => [`${r.store}:${r.review_id}`, r as Reply]));
}

/** Drafts waiting for a decision (for the Reviews page header). */
export async function countDrafts() {
  const { count } = await db().from("hq_review_replies").select("id", { count: "exact", head: true }).in("status", ["draft", "failed"]);
  return count ?? 0;
}

// ── Editing and deciding ─────────────────────────────────────────────────────

export async function saveDraft(id: number, text: string, needsFollowup: boolean, by: string) {
  const draft = text.trim();
  if (!draft) throw new Error("The reply is empty.");
  if (draft.length > REPLY_LIMIT) throw new Error(`The reply is ${draft.length} characters; the limit is ${REPLY_LIMIT}.`);
  const { data, error } = await db()
    .from("hq_review_replies")
    .update({ draft, needs_followup: needsFollowup, edited_by: by, error: null, status: "draft" })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This reply was already sent or discarded.");
  const reply = { ...(data as Reply), review: await loadReview(data.store, data.review_id) };
  await syncTelegram(reply);
  return reply;
}

/** Posts the current draft to the store. Returns false when someone else already decided. */
export async function sendReply(id: number, by: string, via: "hq" | "telegram") {
  // Claim it first, so a double tap (or HQ and Telegram at once) sends only once.
  const { data: claimed } = await db()
    .from("hq_review_replies")
    .update({ status: "sending", decided_by: by, decided_via: via, error: null })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("*")
    .maybeSingle();
  if (!claimed) return false;
  const reply = claimed as Reply;

  try {
    if (reply.store === "google_play") await replyToPlayReview(reply.review_id, reply.draft);
    else await replyToAppStoreReview(reply.review_id, reply.draft);
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    await db().from("hq_review_replies").update({ status: "failed", error: message }).eq("id", id);
    const failed = await getReply(id);
    if (failed) await syncTelegram(failed);
    throw new Error(message);
  }

  const now = new Date().toISOString();
  await db().from("hq_review_replies").update({ status: "sent", sent_at: now }).eq("id", id);
  await db().from("hq_reviews").update({ reply_body: reply.draft, replied_at: now }).eq("store", reply.store).eq("review_id", reply.review_id);
  const sent = await getReply(id);
  if (sent) await syncTelegram(sent);
  return true;
}

export async function discardReply(id: number, by: string, via: "hq" | "telegram") {
  const { data } = await db()
    .from("hq_review_replies")
    .update({ status: "discarded", decided_by: by, decided_via: via })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (!data) return false;
  const reply = await getReply(id);
  if (reply) await syncTelegram(reply);
  return true;
}

// ── Telegram ─────────────────────────────────────────────────────────────────

const replyUrl = (id: number) => {
  const hq = process.env.HQ_URL;
  return hq?.startsWith("https://") ? `${hq}/reviews/reply/${id}` : null;
};

function telegramText(r: ReplyWithReview) {
  const v = r.review;
  const head =
    v.rating <= 2
      ? `${"⭐".repeat(v.rating)} <b>New ${v.rating}★ review on ${STORE_LABEL[v.store]}</b>`
      : `${"⭐".repeat(v.rating)} <b>Reply draft for a ${v.rating}★ review on ${STORE_LABEL[v.store]}</b>`;
  const status: Record<ReplyStatus, string> = {
    draft: "Waiting for approval",
    sending: "Sending…",
    sent: `✅ Sent by ${esc(r.decided_by ?? "?")}${r.decided_via === "telegram" ? " (Telegram)" : " (HQ)"}`,
    failed: `⚠️ Couldn't send: ${esc((r.error ?? "").slice(0, 300))}`,
    discarded: `🗑 Discarded by ${esc(r.decided_by ?? "?")}`,
  };
  return [
    head,
    v.title ? `<b>${esc(v.title)}</b>` : "",
    esc((v.body ?? "").slice(0, 900)),
    [v.author && esc(v.author), v.app_version && `v${esc(v.app_version)}`, v.territory].filter(Boolean).join(" · "),
    "",
    `<b>Reply</b> (${r.draft.length}/${REPLY_LIMIT}${r.edited_by ? `, edited by ${esc(r.edited_by)}` : ""})`,
    `<blockquote>${esc(r.draft)}</blockquote>`,
    r.needs_followup ? `📧 Asks them to write to ${SUPPORT_EMAIL}` : "",
    status[r.status],
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function telegramButtons(r: Reply): Button[][] {
  const open = r.status === "draft" || r.status === "failed";
  const url = replyUrl(r.id);
  const rows: Button[][] = [];
  if (open) rows.push([{ text: r.status === "failed" ? "Try again" : "Approve & send", callback_data: `rr:s:${r.id}` }, { text: "Discard", callback_data: `rr:d:${r.id}` }]);
  if (open && url) rows.push([{ text: "Edit in HQ", url }]);
  return rows;
}

/** Sends the approval message once, then keeps it in step with the reply. Never throws. */
async function syncTelegram(r: ReplyWithReview) {
  if (!telegramConfigured()) return;
  try {
    if (!r.telegram_message_id) {
      if (r.status !== "draft") return;
      const messageId = await sendMessage(telegramText(r), telegramButtons(r));
      await db().from("hq_review_replies").update({ telegram_message_id: messageId }).eq("id", r.id);
    } else {
      await editMessage(r.telegram_message_id, telegramText(r), telegramButtons(r));
    }
  } catch (e) {
    // "message is not modified" and deleted messages land here; the reply itself is fine.
    console.error("[replies] telegram:", (e as Error).message);
  }
}
