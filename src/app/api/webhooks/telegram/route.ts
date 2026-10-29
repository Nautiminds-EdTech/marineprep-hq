import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { decideProposal, draftProposal, proposeFromSentry } from "@/lib/fixes";
import { discardReply, sendReply } from "@/lib/replies";
import { createServiceClient } from "@/lib/supabase/server";
import { answerCallback, isTelegramAdmin } from "@/lib/telegram";

// Proposing from an alert fetches Sentry, then Claude drafts in the background.
export const maxDuration = 120;

type TelegramUser = { id: number; is_bot?: boolean; username?: string; first_name?: string };

type CallbackQuery = {
  id: string;
  data?: string;
  from: { id: number; username?: string; first_name?: string };
};

function authorized(req: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Telegram calls this for every update to the bot; we only act on our own buttons. */
export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });

  const update = (await req.json()) as { callback_query?: CallbackQuery; message?: { from?: TelegramUser } };

  // Remember who has messaged the bot (e.g. "/start"), so their ID can be added to TELEGRAM_ADMIN_IDS.
  const sender = update.message?.from;
  if (sender && !sender.is_bot) {
    await createServiceClient()
      ?.from("hq_alerts")
      .upsert(
        { kind: "telegram_user", key: String(sender.id), payload: { username: sender.username, first_name: sender.first_name } },
        { onConflict: "kind,key", ignoreDuplicates: true },
      );
    return Response.json({ ok: true });
  }

  const cb = update.callback_query;
  if (!cb?.data) return Response.json({ ok: true });

  if (!isTelegramAdmin(cb.from.id)) {
    await answerCallback(cb.id, "Only the CTO and CEO can do this.");
    return Response.json({ ok: true });
  }

  const by = cb.from.username ?? cb.from.first_name ?? String(cb.from.id);
  const [kind, action, ref] = cb.data.split(":");

  try {
    if (kind === "fix" && (action === "a" || action === "r")) {
      const decided = await decideProposal(ref, action === "a" ? "approved" : "rejected", by, "telegram");
      await answerCallback(cb.id, decided ? (action === "a" ? "Approved" : "Rejected") : "Already decided");
    } else if (kind === "fix" && action === "p") {
      const { id, created } = await proposeFromSentry(ref);
      await answerCallback(cb.id, created ? "Drafting a fix proposal…" : "Already in the fix queue");
      if (created) {
        after(() => draftProposal(id).catch((e) => console.error("[telegram] draft failed:", (e as Error).message)));
      }
    } else if (kind === "rr" && (action === "s" || action === "d")) {
      // Review replies: send the current draft to the store, or discard it.
      const id = Number(ref);
      if (action === "s") {
        await answerCallback(cb.id, "Sending the reply…");
        await sendReply(id, by, "telegram").catch((e) => console.error("[telegram] reply send failed:", (e as Error).message));
      } else {
        const done = await discardReply(id, by, "telegram");
        await answerCallback(cb.id, done ? "Discarded" : "Already decided");
      }
    } else {
      await answerCallback(cb.id);
    }
  } catch (e) {
    console.error("[telegram] callback failed:", (e as Error).message);
    await answerCallback(cb.id, "Something went wrong. Try again from HQ.");
  }

  return Response.json({ ok: true });
}
