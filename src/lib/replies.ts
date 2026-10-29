import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { replyToAppStoreReview } from "@/lib/appstore";
import { replyToPlayReview } from "@/lib/play";
import { replyable, STORE_LABEL, type SavedReview, type Store } from "@/lib/reviews";
import { claude, claudeErrorMessage, costUsd } from "@/lib/seo/claude";
import { getAppFacts } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { editMessage, esc, sendMessage, telegramConfigured, type Button } from "@/lib/telegram";

// Replies to store reviews: Claude drafts in the voice of the support team, an admin edits in HQ or
// approves on Telegram, and HQ posts the reply to the store. Rules the prompt asks for are also
// checked in code (length, when the support email appears, banned phrasing).

export const REPLY_LIMIT = 350; // Google Play's cap; used for both stores
export const SUPPORT_EMAIL = "support@nautiminds.com";
/** Only new reviews get a draft automatically; older ones get one from the Reviews page. */
const AUTO_DRAFT_WINDOW_MS = 7 * 86_400_000;
/** Automatic drafts (and their Telegram approval message) only for 1–3★; 4–5★ are drafted on request in HQ. */
const AUTO_DRAFT_MAX_RATING = 3;

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

const SYSTEM = `You are a member of Marine Prep's customer support team, writing the public developer reply to one
app store review. It appears under the review on the store, so other students and parents will read it too.

Marine Prep is an app by Nautiminds Edtech that helps Class 12 students in India prepare for IMU CET, the Indian
Maritime University entrance exam. It has mock tests, a question bank, chapter notes, previous year papers, Marine AI
for doubts, and one-to-one counselling calls with mentors. Paid plans unlock the full content. It's on Android and
iOS. Support email: ${SUPPORT_EMAIL}.

Tone: professional, courteous and calm, like an experienced support team at an established education company.
- Full, well-formed sentences in standard English. No slang or casual phrases ("fair point", "get a feel for it",
  "pair well", "all the best", "glad it's working", "no worries", "awesome", "super").
- Respond to what this reviewer actually said (the feature, problem or praise they mention), so the reply could
  only belong to this review.
- A brief, sincere thank-you is fine. Acknowledge a complaint plainly without being defensive or arguing.
- 1-3 sentences, usually under 280 characters. Hard limit: ${REPLY_LIMIT} characters.
- No sign-off or signature at the end (no "Team Marine Prep", "Regards", "Thanks, the team"). The store already shows
  the reply is from the developer.
- If the reviewer's name is clearly a first name ("Arjun_07" is Arjun, "Priya S" is Priya), you may open with
  "Hi <name>,". Otherwise no name.
- English, unless the review is in Hindi (Devanagari or Latin script); then polite, simple Hindi in the same script.

Facts: say only what the review, the description above or the <app_facts> in the message support. Don't invent
what is free or paid beyond what <app_facts> says. No promises: no dates, no "fixed in the next update", no refunds, no
discounts, no new features. Don't claim anything is fixed.

needs_followup is your decision. Read the review and decide whether we can only help if they write to us:
- true for: a crash, bug, freeze or error; login or OTP trouble; a payment, subscription or refund problem; wrong
  questions, answers or content; an account problem; or a complaint too vague to act on ("not working", "bekar app",
  "waste"). Then ask them to email ${SUPPORT_EMAIL} and say exactly what to include (for example their phone model
  and what they were doing when it happened, or the payment date and registered phone number), and say the team will
  look into it.
- false for: praise, a general opinion (including "too much is paid"), a feature suggestion, or anything the reply
  itself fully answers. Then don't mention any email address or "contact us".

Never: emojis, exclamation marks, hashtags, em dashes, Markdown, asking them to change their rating, "Rest assured",
"Dear user", "Hope this helps", "inconvenience caused", "your satisfaction", "we strive".

Examples of the register (don't copy the wording):
- 1★ "it's nothing inside, only paid user can access (but it's awesome if pay)": "Thank you for your review. Most of
  the preparation material is part of our paid plans, and we're pleased the full content has been useful to you. We
  are working to make the free experience more helpful for students who are exploring the app."
  -> needs_followup false. (Saying we are "working to" improve something general is fine; no dates or specifics.)
- 1★ "app not working" by Arjun_07: "Hi Arjun, we're sorry the app isn't working for you. Please email
  ${SUPPORT_EMAIL} with your phone model and the screen where the problem occurs, and our team will look into it."
  -> needs_followup true.
- 5★ "Really helpful app, notes and mocks are good": "Thank you for the kind review. We're pleased the notes and mock
  tests are helping with your IMU CET preparation. The previous year papers are also worth using alongside the mocks."
  -> needs_followup false.`;

const BANNED = [
  /rest assured/i, /dear user/i, /hope this helps/i, /inconvenience caused/i, /your satisfaction/i, /we strive/i,
  /fair point/i, /get a feel/i, /all the best/i, /no worries/i, /awesome/i, /pair(s)? well/i, /—/, /!/,
  /(team marine prep|regards|cheers|thanks,?\s*(the )?team)\.?\s*$/i,
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

const longDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function reviewForPrompt(r: SavedReview, facts: string, instruction?: string) {
  return [
    "<app_facts>",
    "What the app offers today, kept up to date by the team. Where it differs from the description in your",
    "instructions, these facts win. If the review complains about something these facts show has changed since the",
    "review date, say so plainly (for example what free users can now do), without overselling.",
    facts,
    "</app_facts>",
    "",
    `Today: ${longDate(new Date().toISOString())}`,
    `Review date: ${longDate(r.reviewed_at)}`,
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
  const facts = (await getAppFacts()).text;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: reviewForPrompt(review, facts, instruction) }];
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

/**
 * Drafts (or redrafts) the reply to one review. `notify` posts a Telegram approval message (automatic
 * drafts); a draft that already has one keeps it up to date either way.
 */
export async function draftReply(store: Store, reviewId: string, opts: { instruction?: string; by?: string; notify?: boolean } = {}) {
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
  if (opts.notify || reply.telegram_message_id) await syncTelegram(reply);
  return reply;
}

/** Drafts replies for new answerable 1–3★ reviews that don't have one yet (cron and "Refresh now"). */
export async function draftPending(limit = 3) {
  if (!repliesConfigured()) return { drafted: 0, errors: [] as string[] };
  const { data: reviews } = await db()
    .from("hq_reviews")
    .select("store, review_id, body, reply_body")
    .is("reply_body", null)
    .not("body", "is", null)
    .not("review_id", "like", "csv:%")
    .lte("rating", AUTO_DRAFT_MAX_RATING)
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
      await draftReply(r.store as Store, r.review_id, { notify: true });
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

/** Saves an admin's edit. Whether it asks them to write to support follows from the text itself. */
export async function saveDraft(id: number, text: string, by: string) {
  const draft = text.trim();
  if (!draft) throw new Error("The reply is empty.");
  if (draft.length > REPLY_LIMIT) throw new Error(`The reply is ${draft.length} characters; the limit is ${REPLY_LIMIT}.`);
  const { data, error } = await db()
    .from("hq_review_replies")
    .update({ draft, needs_followup: draft.includes(SUPPORT_EMAIL), edited_by: by, error: null, status: "draft" })
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
    r.needs_followup ? `📧 Asks them to write to ${SUPPORT_EMAIL} (needs details or investigation)` : "No support email needed",
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
