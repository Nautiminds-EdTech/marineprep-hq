import { timingSafeEqual } from "node:crypto";
import { briefText, saveSnapshot, snapshotMetrics, yesterdayNumbers } from "@/lib/brief";
import { findDrops, formatDrop, MIN_HISTORY_DAYS } from "@/lib/drops";
import { collectReviews } from "@/lib/reviews";
import { publishDue } from "@/lib/seo/posts";
import { createServiceClient } from "@/lib/supabase/server";
import { esc, sendMessage, telegramConfigured, type Button } from "@/lib/telegram";

// Reviews (both stores + Claude themes) run before the brief.
export const maxDuration = 120;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const DAY_MS = 86_400_000;
const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Vercel Cron, every morning: collect store reviews, save yesterday's numbers, post the brief
 * to Telegram, then alert on anything that fell well below its 7-day average.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const db = createServiceClient();
  if (!db) return new Response("SUPABASE_SERVICE_ROLE_KEY is not set", { status: 500 });

  // Reviews first, so new 1–2★ alerts arrive before the brief. A store outage mustn't block the brief.
  const reviews = await collectReviews().catch((e) => ({ error: (e as Error).message }));

  // Blog posts scheduled for today or earlier go live now (09:00 IST).
  const scheduled = await publishDue().catch((e) => ({ done: [] as string[], failed: [{ id: "*", error: (e as Error).message }] }));
  if ((scheduled.done.length || scheduled.failed.length) && telegramConfigured()) {
    const { data: posts } = await db.from("blogs").select("id,title").in("id", [...scheduled.done, ...scheduled.failed.map((f) => f.id)]);
    const title = (id: string) => esc(posts?.find((p) => p.id === id)?.title ?? id);
    await sendMessage(
      [
        ...scheduled.done.map((id) => `📰 Published as scheduled: <b>${title(id)}</b>`),
        ...scheduled.failed.map((f) => `⚠️ Scheduled post not published: <b>${title(f.id)}</b>
${esc(f.error)}`),
      ].join("\n"),
    ).catch(() => undefined);
  }

  const numbers = await yesterdayNumbers(db);
  await saveSnapshot(db, numbers);

  // The 7 days before yesterday: the day before gives the brief's (+/-), all 7 the drop baseline.
  const { data: past } = await db
    .from("hq_daily_snapshots")
    .select("day, metric, value")
    .gte("day", shiftDay(numbers.day, -MIN_HISTORY_DAYS))
    .lt("day", numbers.day);
  const before = shiftDay(numbers.day, -1);
  const previous = Object.fromEntries(
    (past ?? []).filter((r) => r.day === before).map((r) => [r.metric, Number(r.value)]),
  );
  const history: Record<string, number[]> = {};
  for (const r of past ?? []) (history[r.metric] ??= []).push(Number(r.value));

  // One brief per day, even if Vercel retries the cron.
  const { error } = await db.from("hq_alerts").insert({ kind: "daily_brief", key: numbers.day, payload: numbers });
  if (!error && telegramConfigured()) {
    const messageId = await sendMessage(briefText(numbers, previous));
    await db.from("hq_alerts").update({ telegram_message_id: messageId }).eq("kind", "daily_brief").eq("key", numbers.day);
  }

  const yesterday = Object.fromEntries(
    Object.entries(snapshotMetrics(numbers)).filter((e): e is [string, number] => e[1] !== null),
  );
  const drops = findDrops(yesterday, history);
  let dropAlertSent = false;
  if (drops.length && telegramConfigured()) {
    const claim = await db
      .from("hq_alerts")
      .insert({ kind: "drop_alert", key: numbers.day, payload: { drops } });
    if (!claim.error) {
      const hq = process.env.HQ_URL;
      const buttons: Button[][] = hq?.startsWith("https://") ? [[{ text: "Open HQ", url: hq }]] : [];
      const messageId = await sendMessage(
        [
          `⚠️ <b>Drop alert for ${esc(numbers.day)}</b>`,
          ...drops.map((d) => `• ${esc(formatDrop(d))}`),
          "",
          "Check Quality (new errors?) and Funnel (where people stop) in HQ.",
        ].join("\n"),
        buttons,
      );
      await db.from("hq_alerts").update({ telegram_message_id: messageId }).eq("kind", "drop_alert").eq("key", numbers.day);
      dropAlertSent = true;
    }
  }

  return Response.json({
    ok: true,
    numbers,
    briefSent: !error,
    historyDays: Math.max(0, ...Object.values(history).map((v) => v.length)),
    drops,
    dropAlertSent,
    reviews,
    scheduled,
  });
}
