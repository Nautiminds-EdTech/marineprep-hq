import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuality, sentryConfigured } from "@/lib/sentry";
import { esc } from "@/lib/telegram";
import { formatINR, istDayStart } from "@/lib/time";

export type DayNumbers = {
  day: string; // YYYY-MM-DD (IST)
  signups: number;
  payers: number;
  revenueInr: number;
  activeSubscriptions: number;
  mocksStarted: number;
  aiMessages: number;
  errorFreeUsers7d: number | null;
  fixesWaiting: number;
};

const NOT_SANDBOX = "apple_environment.is.null,apple_environment.neq.Sandbox";

async function count(db: SupabaseClient, table: string, from: string, to: string) {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** Yesterday's numbers (IST day). Uses the service client; no admin session needed. */
export async function yesterdayNumbers(db: SupabaseClient): Promise<DayNumbers> {
  const from = istDayStart(1);
  const to = istDayStart(0);

  const [signups, payments, activeSubs, mocksStarted, aiMessages, fixesWaiting, quality] = await Promise.all([
    count(db, "users", from, to),
    db
      .from("payments")
      .select("user_id, amount, currency")
      .eq("status", "captured")
      .or(NOT_SANDBOX)
      .gte("created_at", from)
      .lt("created_at", to),
    db
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expiry_date", new Date().toISOString()),
    count(db, "practice_test_sessions", from, to),
    count(db, "marine_messages", from, to),
    db.from("hq_fix_proposals").select("*", { count: "exact", head: true }).eq("status", "proposed"),
    sentryConfigured() ? getQuality(7).catch(() => null) : Promise.resolve(null),
  ]);

  const rows = payments.data ?? [];
  return {
    day: from.slice(0, 10),
    signups,
    payers: new Set(rows.map((p) => p.user_id)).size,
    revenueInr: rows
      .filter((p) => (p.currency ?? "INR") === "INR")
      .reduce((s, p) => s + Number(p.amount ?? 0) / 100, 0),
    activeSubscriptions: activeSubs.count ?? 0,
    mocksStarted,
    aiMessages,
    errorFreeUsers7d: quality?.errorFreeUsers ?? null,
    fixesWaiting: fixesWaiting.count ?? 0,
  };
}

export async function saveSnapshot(db: SupabaseClient, d: DayNumbers) {
  const metrics: Record<string, number | null> = {
    signups: d.signups,
    payers: d.payers,
    revenue_inr: d.revenueInr,
    active_subscriptions: d.activeSubscriptions,
    mocks_started: d.mocksStarted,
    ai_messages: d.aiMessages,
    error_free_users_7d: d.errorFreeUsers7d,
  };
  const rows = Object.entries(metrics)
    .filter(([, v]) => v !== null)
    .map(([metric, value]) => ({ day: d.day, metric, value }));
  const { error } = await db.from("hq_daily_snapshots").upsert(rows, { onConflict: "day,metric" });
  if (error) throw new Error(error.message);
}

export function briefText(d: DayNumbers, previous?: Partial<Record<string, number>>) {
  const delta = (now: number, key: string) => {
    const before = previous?.[key];
    if (before === undefined) return "";
    const diff = now - before;
    return diff === 0 ? " (=)" : ` (${diff > 0 ? "+" : ""}${diff.toLocaleString("en-IN")})`;
  };
  const date = new Date(`${d.day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return [
    `☀️ <b>MarinePrep, ${esc(date)}</b>`,
    `Signups: <b>${d.signups}</b>${delta(d.signups, "signups")}`,
    `Paid: <b>${d.payers}</b> · ${formatINR(d.revenueInr)}`,
    `Mocks started: ${d.mocksStarted}${delta(d.mocksStarted, "mocks_started")} · AI messages: ${d.aiMessages}`,
    `Active subscriptions: ${d.activeSubscriptions}`,
    d.errorFreeUsers7d !== null ? `Error-free users (7d): ${(d.errorFreeUsers7d * 100).toFixed(1)}%` : "",
    d.fixesWaiting ? `🛠 ${d.fixesWaiting} fix proposal${d.fixesWaiting > 1 ? "s" : ""} waiting for approval` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
