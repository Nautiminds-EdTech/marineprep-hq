import { timingSafeEqual } from "node:crypto";
import { briefText, saveSnapshot, yesterdayNumbers } from "@/lib/brief";
import { createServiceClient } from "@/lib/supabase/server";
import { sendMessage, telegramConfigured } from "@/lib/telegram";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Vercel Cron, every morning: save yesterday's numbers and post the brief to Telegram. */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const db = createServiceClient();
  if (!db) return new Response("SUPABASE_SERVICE_ROLE_KEY is not set", { status: 500 });

  const numbers = await yesterdayNumbers(db);
  await saveSnapshot(db, numbers);

  // The day before, for the (+/-) deltas in the brief.
  const before = new Date(Date.parse(`${numbers.day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const { data: prev } = await db.from("hq_daily_snapshots").select("metric, value").eq("day", before);
  const previous = Object.fromEntries((prev ?? []).map((r) => [r.metric, Number(r.value)]));

  // One brief per day, even if Vercel retries the cron.
  const { error } = await db.from("hq_alerts").insert({ kind: "daily_brief", key: numbers.day, payload: numbers });
  if (!error && telegramConfigured()) {
    const messageId = await sendMessage(briefText(numbers, previous));
    await db.from("hq_alerts").update({ telegram_message_id: messageId }).eq("kind", "daily_brief").eq("key", numbers.day);
  }

  return Response.json({ ok: true, numbers, briefSent: !error });
}
