import { Suspense } from "react";
import { FunnelBars } from "@/components/funnel-bars";
import { NotConnected } from "@/components/not-connected";
import { requireAdmin } from "@/lib/auth";
import { FUNNEL_STEPS, getFeatureReach, getFunnel, posthogConfigured } from "@/lib/posthog";
import { createServiceClient } from "@/lib/supabase/server";
import { istDayStart } from "@/lib/time";

export const metadata = { title: "Funnel · MarinePrep HQ" };

const DAYS = 30;

export default function FunnelPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Funnel</h1>
        <p className="text-sm text-ink-2">
          PostHog, last {DAYS} days · people who did each step in order within 14 days · refreshed every few minutes
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-ink-3">Loading from PostHog…</p>}>
        <FunnelBody />
      </Suspense>
    </div>
  );
}

async function FunnelBody() {
  await requireAdmin();
  if (!posthogConfigured()) return <NotConnected service="PostHog" />;

  let funnel, reach;
  try {
    [funnel, reach] = await Promise.all([getFunnel(DAYS), getFeatureReach()]);
  } catch (e) {
    return <p className="card p-4 text-sm text-critical">Couldn&apos;t load PostHog: {(e as Error).message}</p>;
  }
  const payers = await countPayers(istDayStart(DAYS - 1));
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      <section className="card flex flex-col gap-4 p-4">
        <h2 className="font-medium">From OTP request to billing</h2>
        <FunnelBars steps={funnel.total} />
        <p className="text-xs text-ink-3">
          Installs in the same {DAYS} days:{" "}
          <span className="text-ink-2">
            {funnel.installs.map((i) => `${n(i.count)} ${i.platform}`).join(" · ") || "none"}
          </span>
          . Not part of the funnel: the app records installs under an anonymous ID that isn&apos;t merged into the
          logged-in user.
        </p>
        {payers !== null && (
          <p className="text-xs text-ink-3">
            Paid in the same {DAYS} days: <span className="text-ink-2">{n(payers)} people</span> (Supabase, Sandbox
            excluded). Not linked to the funnel above: the app doesn&apos;t send a purchase event to PostHog yet.
          </p>
        )}
      </section>

      {funnel.byPlatform.length > 1 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-medium">By platform</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 pr-4 font-normal">Step</th>
                {funnel.byPlatform.map((p) => (
                  <th key={p.platform} className="py-1 pr-4 text-right font-normal">
                    {p.platform}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {FUNNEL_STEPS.map((s, i) => (
                <tr key={s.event}>
                  <td className="py-1.5 pr-4 text-ink-2">{s.label}</td>
                  {funnel.byPlatform.map((p) => {
                    const c = p.steps[i]?.count ?? 0;
                    const top = p.steps[0]?.count || 1;
                    return (
                      <td key={p.platform} className="py-1.5 pr-4 text-right tabular-nums">
                        {n(c)} <span className="text-xs text-ink-3">{Math.round((c / top) * 100)}%</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 font-medium">Feature reach, last 7 days</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {reach.map((f) => (
            <li key={f.label}>
              <p className="text-2xl font-semibold tabular-nums">{n(f.users)}</p>
              <p className="text-xs text-ink-3">{f.label}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Distinct users with a real (non-Sandbox) captured payment since `since`. */
async function countPayers(since: string) {
  const db = createServiceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("payments")
    .select("user_id")
    .eq("status", "captured")
    .or("apple_environment.is.null,apple_environment.neq.Sandbox")
    .gte("created_at", since);
  if (error) return null;
  return new Set(data.map((p) => p.user_id).filter(Boolean)).size;
}
