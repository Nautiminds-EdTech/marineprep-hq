import "server-only";
import { appStoreSalesConfigured, fetchAppStoreDownloads } from "@/lib/appstore";
import { fetchPlayInstalls, playAvailableHere, playConfigured, playReportsBucket } from "@/lib/play";
import { createServiceClient } from "@/lib/supabase/server";

// Store installs, from the stores' own reports (PostHog's "Application Installed" can't be trusted:
// it sits on an anonymous ID and misses many installs). Saved per day in hq_daily_snapshots as
// installs_android (Play "Daily User Installs") and installs_ios (App Store first-time downloads).

export const INSTALL_METRICS = { android: "installs_android", ios: "installs_ios" } as const;

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return client;
}

const dayString = (d: Date) => d.toISOString().slice(0, 10);

async function save(metric: string, rows: { day: string; value: number }[]) {
  if (!rows.length) return;
  const { error } = await db()
    .from("hq_daily_snapshots")
    .upsert(rows.map((r) => ({ day: r.day, metric, value: r.value })), { onConflict: "day,metric" });
  if (error) throw new Error(error.message);
}

/** True once, then false: the first sync of a source pulls its whole history. */
async function firstImport(kind: string, key: string) {
  const { data } = await db().from("hq_alerts").select("id").eq("kind", kind).eq("key", key).maybeSingle();
  return !data;
}
const markImported = (kind: string, key: string, payload: object) => db().from("hq_alerts").insert({ kind, key, payload });

export type InstallSync = { android?: number; ios?: number; errors: Partial<Record<"android" | "ios", string>> };

/** Pulls new install numbers from both stores. Safe to run often; each day's value is overwritten. */
export async function syncInstalls(): Promise<InstallSync> {
  const result: InstallSync = { errors: {} };

  const bucket = playReportsBucket();
  if (playConfigured() && playAvailableHere() && bucket) {
    try {
      const first = await firstImport("play_installs_import", bucket);
      // Everything once, then the newest two monthly files (the current month changes daily).
      const days = await fetchPlayInstalls(first ? undefined : 2);
      await save(INSTALL_METRICS.android, days.map((d) => ({ day: d.day, value: d.installs })));
      if (first) await markImported("play_installs_import", bucket, { days: days.length });
      result.android = days.length;
    } catch (e) {
      result.errors.android = (e as Error).message.slice(0, 300);
    }
  }

  if (appStoreSalesConfigured()) {
    try {
      const key = process.env.APP_STORE_VENDOR_NUMBER!;
      const first = await firstImport("appstore_installs_import", key);
      // Apple keeps daily reports for a year; later runs re-read the last week (late corrections).
      const span = first ? 365 : 7;
      const days = Array.from({ length: span }, (_, i) => dayString(new Date(Date.now() - (i + 1) * 86_400_000)));
      const rows: { day: string; value: number }[] = [];
      for (let i = 0; i < days.length; i += 8) {
        const batch = days.slice(i, i + 8);
        const values = await Promise.all(batch.map((d) => fetchAppStoreDownloads(d)));
        batch.forEach((day, j) => values[j] !== null && rows.push({ day, value: values[j]! }));
      }
      await save(INSTALL_METRICS.ios, rows);
      if (first) await markImported("appstore_installs_import", key, { days: rows.length });
      result.ios = rows.length;
    } catch (e) {
      result.errors.ios = (e as Error).message.slice(0, 300);
    }
  }
  return result;
}

export type StoreInstalls = {
  /** null when that store has never synced */
  android: number | null;
  ios: number | null;
  /** Newest day with data, per store */
  through: { android: string | null; ios: string | null };
};

/** Installs per store over the last `days` days (by report day). */
export async function storeInstalls(days: number): Promise<StoreInstalls> {
  const since = dayString(new Date(Date.now() - days * 86_400_000));
  const { data, error } = await db()
    .from("hq_daily_snapshots")
    .select("day, metric, value")
    .in("metric", Object.values(INSTALL_METRICS))
    .gte("day", since);
  if (error) throw new Error(error.message);
  // A store that has synced before but has no rows in the window shows 0; one that never synced shows null.
  const everSynced = async (metric: string) =>
    ((await db().from("hq_daily_snapshots").select("day", { count: "exact", head: true }).eq("metric", metric)).count ?? 0) > 0;

  const pick = async (metric: string) => {
    const rows = (data ?? []).filter((r) => r.metric === metric);
    const synced = rows.length > 0 || (await everSynced(metric));
    return {
      total: synced ? rows.reduce((s, r) => s + Number(r.value), 0) : null,
      through: rows.map((r) => r.day as string).sort().at(-1) ?? null,
    };
  };
  const [a, i] = await Promise.all([pick(INSTALL_METRICS.android), pick(INSTALL_METRICS.ios)]);
  return { android: a.total, ios: i.total, through: { android: a.through, ios: i.through } };
}
