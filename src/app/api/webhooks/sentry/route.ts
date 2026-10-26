import { createHmac, timingSafeEqual } from "node:crypto";
import { isNoise } from "@/lib/sentry";
import { createServiceClient } from "@/lib/supabase/server";
import { esc, sendMessage, telegramConfigured } from "@/lib/telegram";

type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit?: string;
  permalink?: string | null;
  web_url?: string;
  level?: string;
  isUnhandled?: boolean;
};

function verified(body: string, signature: string | null) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** Sentry internal integration webhook: alerts Telegram about new, non-noise issues. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verified(body, req.headers.get("sentry-hook-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const resource = req.headers.get("sentry-hook-resource");
  const payload = JSON.parse(body) as { action?: string; data?: { issue?: SentryIssue } };
  const issue = payload.data?.issue;
  if (resource !== "issue" || payload.action !== "created" || !issue) return Response.json({ ok: true });
  if (isNoise(issue.title)) return Response.json({ ok: true, skipped: "noise" });

  const db = createServiceClient();
  if (!db || !telegramConfigured()) return Response.json({ ok: true, skipped: "not configured" });

  // Claim the alert first, so Sentry retries never alert twice.
  const { error } = await db.from("hq_alerts").insert({ kind: "sentry_issue", key: issue.id, payload: issue });
  if (error?.code === "23505") return Response.json({ ok: true, skipped: "duplicate" });
  if (error) throw new Error(error.message);

  const link = issue.permalink ?? issue.web_url;
  const messageId = await sendMessage(
    [
      `🔴 <b>New ${issue.isUnhandled ? "unhandled " : ""}error in the app</b>`,
      `<b>${esc(issue.title)}</b>`,
      issue.culprit ? esc(issue.culprit) : "",
      link ? `<a href="${link}">${esc(issue.shortId)} in Sentry</a>` : esc(issue.shortId),
    ]
      .filter(Boolean)
      .join("\n"),
    [[{ text: "🛠 Propose fix", callback_data: `fix:p:${issue.shortId}` }]],
  );
  await db.from("hq_alerts").update({ telegram_message_id: messageId }).eq("kind", "sentry_issue").eq("key", issue.id);

  return Response.json({ ok: true });
}
