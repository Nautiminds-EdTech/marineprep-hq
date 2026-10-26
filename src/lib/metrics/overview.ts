import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { istDay, istDayStart, lastIstDays } from "@/lib/time";

// IMUCET 2027 is expected late May; update when IMU announces the date.
export const EXAM_DATE = "2027-05-23";
// The day after the previous IMUCET, where the season the countdown measures begins.
const SEASON_START = "2026-05-24";

export type Activity = { id: string; kind: "signup" | "purchase"; who: string; detail: string; at: string };

/** One IST day of activity. `mocks` is null without the service key. */
export type DayPoint = { day: string; signups: number; purchases: number; revenue: number; mocks: number | null };

export const SERIES_DAYS = 30;

export type Overview = {
  /** False while running on the admin's session: tables without admin RLS policies are hidden. */
  fullAccess: boolean;
  /** prev7 is the 7 days before last7, for the week-over-week change. */
  signups: { today: number; last7: number; prev7: number; total: number };
  purchases: { today: number; last7: number; appleLast30: number };
  /** Rupees, gross (before Apple's commission and Razorpay fees). */
  revenue: { last7: number; last30: number; razorpayLast30: number; appleLast30: number };
  activeSubscriptions: number;
  mocks: { startedToday: number; completedToday: number } | null;
  aiMessagesToday: number;
  daysToExam: number;
  /** 0–1, how far today is from SEASON_START to the exam. */
  seasonProgress: number;
  /** Latest real (non-Sandbox) captured payment, any provider. */
  lastPurchaseAt: string | null;
  /** The last SERIES_DAYS IST days, oldest first, ending today. */
  series: DayPoint[];
  activity: Activity[];
};

type Row = Record<string, unknown>;

type Filter = ["eq" | "gt" | "gte", string, string | boolean] | ["or", string];

// App Review and TestFlight purchases land in payments as apple_environment = 'Sandbox'.
// Plain neq would also drop Razorpay rows, whose apple_environment is NULL.
const NOT_SANDBOX = "apple_environment.is.null,apple_environment.neq.Sandbox";

async function count(db: SupabaseClient, table: string, since?: string, filters: Filter[] = []) {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (since) q = q.gte("created_at", since);
  for (const f of filters) {
    if (f[0] === "or") {
      q = q.or(f[1]);
      continue;
    }
    const [op, column, value] = f;
    q = op === "eq" ? q.eq(column, value) : op === "gt" ? q.gt(column, value) : q.gte(column, value);
  }
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** Every row's created_at since `since`, a page at a time (PostgREST caps a response at 1,000 rows). */
async function createdSince(db: SupabaseClient, table: string, since: string) {
  const rows: string[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select("created_at")
      .gte("created_at", since)
      .order("created_at")
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data.map((r) => r.created_at as string));
    if (data.length < 1000) break;
  }
  return rows;
}

function displayName(u: Row | undefined) {
  const name = (u?.name ?? u?.full_name) as string | undefined;
  return name?.trim() || "Student";
}

export async function getOverview(): Promise<Overview> {
  await requireAdmin();
  const service = createServiceClient();
  const db = service ?? (await createSessionClient());

  const today = istDayStart(0);
  const week = istDayStart(6);
  const month = istDayStart(29);
  const fortnight = istDayStart(13);
  const captured: Filter[] = [
    ["eq", "status", "captured"],
    ["or", NOT_SANDBOX],
  ];

  const [
    signupsToday,
    signups7,
    signups14,
    signupsTotal,
    purchasesToday,
    purchases7,
    payments30,
    activeSubs,
    aiToday,
    recentUsers,
    recentPayments,
    mocks,
    signupDays,
    mockDays,
  ] = await Promise.all([
    count(db, "users", today),
    count(db, "users", week),
    count(db, "users", fortnight),
    count(db, "users"),
    count(db, "payments", today, captured),
    count(db, "payments", week, captured),
    db
      .from("payments")
      .select("amount, currency, provider, created_at")
      .eq("status", "captured")
      .or(NOT_SANDBOX)
      .gte("created_at", month),
    count(db, "subscriptions", undefined, [
      ["eq", "status", "active"],
      ["gt", "expiry_date", new Date().toISOString()],
    ]),
    count(db, "marine_messages", today),
    db.from("users").select("id, name, full_name, created_at").order("created_at", { ascending: false }).limit(10),
    db
      .from("payments")
      .select("id, user_id, amount, currency, provider, created_at")
      .eq("status", "captured")
      .or(NOT_SANDBOX)
      .order("created_at", { ascending: false })
      .limit(10),
    // practice_test_sessions has no admin RLS policy, so this needs the service key.
    service
      ? Promise.all([
          count(service, "practice_test_sessions", today),
          count(service, "practice_test_sessions", undefined, [
            ["eq", "is_completed", true],
            ["gte", "completed_at", today],
          ]),
        ])
      : Promise.resolve(null),
    createdSince(db, "users", month),
    service ? createdSince(service, "practice_test_sessions", month) : Promise.resolve(null),
  ]);

  const rows30 = (payments30.data ?? []) as Row[];
  // amount is in paise. Only INR rows are summed; Apple can charge other currencies.
  const sumINR = (since: string, provider?: "apple" | "razorpay") =>
    rows30
      .filter(
        (p) =>
          (p.currency ?? "INR") === "INR" &&
          (p.created_at as string) >= since &&
          (!provider || (p.provider === "apple") === (provider === "apple")),
      )
      .reduce((s, p) => s + Number(p.amount ?? 0) / 100, 0);
  const amount = (p: Row) =>
    (p.currency ?? "INR") === "INR"
      ? `₹${(Number(p.amount ?? 0) / 100).toLocaleString("en-IN")}`
      : `${Number(p.amount ?? 0) / 100} ${p.currency}`;

  const payers = (recentPayments.data ?? []) as Row[];
  const payerIds = payers.map((p) => p.user_id).filter(Boolean) as string[];
  const { data: payerRows } = payerIds.length
    ? await db.from("users").select("id, name, full_name").in("id", payerIds)
    : { data: [] as Row[] };
  const byId = new Map((payerRows ?? []).map((u: Row) => [u.id as string, u]));

  const tally = (stamps: string[]) => {
    const m = new Map<string, number>();
    for (const at of stamps) m.set(istDay(at), (m.get(istDay(at)) ?? 0) + 1);
    return m;
  };
  const signupsByDay = tally(signupDays);
  const mocksByDay = mockDays ? tally(mockDays) : null;
  const inr = rows30.filter((p) => (p.currency ?? "INR") === "INR");
  const series: DayPoint[] = lastIstDays(SERIES_DAYS).map((day) => {
    const paid = inr.filter((p) => istDay(p.created_at as string) === day);
    return {
      day,
      signups: signupsByDay.get(day) ?? 0,
      purchases: paid.length,
      revenue: paid.reduce((s, p) => s + Number(p.amount ?? 0) / 100, 0),
      mocks: mocksByDay ? (mocksByDay.get(day) ?? 0) : null,
    };
  });

  const activity: Activity[] = [
    ...((recentUsers.data ?? []) as Row[]).map((u) => ({
      id: `u-${u.id}`,
      kind: "signup" as const,
      who: displayName(u),
      detail: "Signed up",
      at: u.created_at as string,
    })),
    ...payers.map((p) => ({
      id: `p-${p.id}`,
      kind: "purchase" as const,
      who: displayName(byId.get(p.user_id as string)),
      detail:
        p.provider === "apple" ? `Paid ${amount(p)} (App Store)` : `Paid ${amount(p)} (Razorpay)`,
      at: p.created_at as string,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  return {
    fullAccess: !!service,
    signups: { today: signupsToday, last7: signups7, prev7: signups14 - signups7, total: signupsTotal },
    purchases: {
      today: purchasesToday,
      last7: purchases7,
      appleLast30: rows30.filter((p) => p.provider === "apple").length,
    },
    revenue: {
      last7: sumINR(week),
      last30: sumINR(month),
      razorpayLast30: sumINR(month, "razorpay"),
      appleLast30: sumINR(month, "apple"),
    },
    activeSubscriptions: activeSubs,
    mocks: mocks ? { startedToday: mocks[0], completedToday: mocks[1] } : null,
    aiMessagesToday: aiToday,
    daysToExam: Math.ceil((Date.parse(`${EXAM_DATE}T00:00:00+05:30`) - Date.now()) / 86_400_000),
    seasonProgress:
      (Date.now() - Date.parse(`${SEASON_START}T00:00:00+05:30`)) /
      (Date.parse(`${EXAM_DATE}T00:00:00+05:30`) - Date.parse(`${SEASON_START}T00:00:00+05:30`)),
    lastPurchaseAt: (payers[0]?.created_at as string | undefined) ?? null,
    series,
    activity,
  };
}
