import { CreditCard, Download, KeyRound, Wallet } from "lucide-react";
import { Suspense } from "react";
import { AttentionList, type Signal } from "@/components/attention-list";
import { biggestDrop, FunnelBars } from "@/components/funnel-bars";
import { NotConnected } from "@/components/not-connected";
import { Notice } from "@/components/notice";
import { PageHeader, Section } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeleton";
import { StatTile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth";
import { storeInstalls, type StoreInstalls } from "@/lib/installs";
import { FUNNEL_STEPS, getFeatureReach, getFunnel, posthogConfigured, type Funnel } from "@/lib/posthog";
import { createServiceClient } from "@/lib/supabase/server";
import { istDayStart } from "@/lib/time";

export const metadata = { title: "Funnel · MarinePrep HQ" };

const DAYS = 30;

export default function FunnelPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Funnel"
        description={`PostHog, last ${DAYS} days. People who did each step in order within 14 days. Refreshed every few minutes.`}
      />
      <Suspense fallback={<PageSkeleton label="Loading from PostHog" />}>
        <FunnelBody />
      </Suspense>
    </div>
  );
}

const n = (v: number) => v.toLocaleString("en-IN");
const pct = (v: number) => `${v < 0.1 && v > 0 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;

async function FunnelBody() {
  await requireAdmin();
  if (!posthogConfigured()) return <NotConnected service="PostHog" />;

  let funnel, reach;
  try {
    [funnel, reach] = await Promise.all([getFunnel(DAYS), getFeatureReach()]);
  } catch (e) {
    return <Notice tone="critical">Couldn&apos;t load PostHog: {(e as Error).message}</Notice>;
  }
  const [payers, store] = await Promise.all([countPayers(istDayStart(DAYS - 1)), storeInstalls(DAYS).catch(() => null)]);
  const start = funnel.total[0]?.count ?? 0;
  const end = funnel.total[funnel.total.length - 1]?.count ?? 0;
  // Store reports when we have them (PostHog misses installs: the event sits on an anonymous ID).
  const installRows = installsByPlatform(funnel, store);
  const installs = installRows.reduce((s, i) => s + i.count, 0);
  const fromStores = installRows.some((i) => i.source === "store");
  const maxReach = Math.max(...reach.map((f) => f.users), 1);

  return (
    <>
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Requested an OTP" icon={KeyRound} value={n(start)} sub="Start of the funnel" />
        <StatTile
          label="Opened billing"
          icon={CreditCard}
          value={n(end)}
          sub={start ? `${pct(end / start)} of those who started` : undefined}
        />
        <StatTile
          label="Paid"
          icon={Wallet}
          value={payers === null ? "" : n(payers)}
          note={payers === null ? "Needs service key" : undefined}
          sub="People, Supabase · Sandbox excluded"
          tone={payers === 0 ? "critical" : "default"}
        />
        <StatTile
          label="Installs"
          icon={Download}
          value={n(installs)}
          sub={
            (installRows.map((i) => `${n(i.count)} ${i.platform === "Android" ? "Google Play" : i.platform === "iOS" ? "App Store" : i.platform}`).join(" · ") || "none") +
            (fromStores ? " · store reports" : " · PostHog")
          }
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="From OTP request to billing"
          description="Each bar is a share of the people who requested an OTP"
          className="lg:col-span-2"
        >
          <FunnelBars steps={funnel.total} />
        </Section>
        <Section title="What stands out" description="Read from this page's numbers">
          <AttentionList signals={signals(funnel, payers, installRows)} empty="No step loses an unusual share of people." />
          <p className="border-t border-line pt-3 text-xs text-ink-3">
            Installs come from the stores&apos; own reports (Google Play daily user installs, App Store first-time
            downloads), a day or two behind{store?.ios === null ? "; the App Store part needs the Sales key (Connections)" : ""}. They aren&apos;t part of
            the funnel, which starts at sign-in. Payments aren&apos;t either: the app doesn&apos;t send a purchase event to
            PostHog yet.
          </p>
        </Section>
      </div>

      {funnel.byPlatform.length > 1 && (
        <Section title="By platform" description="People at each step, and their share of that platform's start">
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 pr-4 font-medium">Step</th>
                  {funnel.byPlatform.map((p) => (
                    <th key={p.platform} className="py-2 pl-4 text-right font-medium">
                      {p.platform}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {FUNNEL_STEPS.map((s, i) => (
                  <tr key={s.event}>
                    <td className="py-2.5 pr-4 text-ink-2">{s.label}</td>
                    {funnel.byPlatform.map((p) => {
                      const c = p.steps[i]?.count ?? 0;
                      const top = p.steps[0]?.count || 1;
                      return (
                        <td key={p.platform} className="py-2.5 pl-4 text-right whitespace-nowrap tabular-nums">
                          <span className="font-medium text-ink">{n(c)}</span>{" "}
                          <span className="inline-block w-10 text-xs text-ink-3">{pct(c / top)}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Feature reach" description="People who used each feature in the last 7 days">
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[...reach]
            .sort((a, b) => b.users - a.users)
            .map((f) => (
              <li key={f.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-2">{f.label}</span>
                  <span className="display-num text-base text-ink">{n(f.users)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(f.users / maxReach) * 100}%` }} />
                </div>
              </li>
            ))}
        </ul>
      </Section>
    </>
  );
}

type InstallRow = { platform: string; count: number; source: "store" | "posthog" };

/** Installs per platform (named like PostHog's $os), from the store reports where synced, else PostHog. */
function installsByPlatform(funnel: Funnel, store: StoreInstalls | null): InstallRow[] {
  const posthog = (platform: string) => funnel.installs.find((i) => i.platform === platform)?.count ?? 0;
  const rows: InstallRow[] = [
    store?.android != null ? { platform: "Android", count: store.android, source: "store" } : { platform: "Android", count: posthog("Android"), source: "posthog" },
    store?.ios != null ? { platform: "iOS", count: store.ios, source: "store" } : { platform: "iOS", count: posthog("iOS"), source: "posthog" },
  ];
  return rows.filter((r) => r.count > 0 || r.source === "store");
}

function signals(funnel: Funnel, payers: number | null, installs: InstallRow[]): Signal[] {
  const out: Signal[] = [];
  const steps = funnel.total;
  const worst = biggestDrop(steps);
  if (worst !== null) {
    const kept = steps[worst].count / (steps[worst - 1].count || 1);
    out.push({
      tone: kept < 0.5 ? "warning" : "info",
      title: `Biggest drop: ${steps[worst - 1].label.toLowerCase()} → ${steps[worst].label.toLowerCase()}`,
      detail: `Only ${pct(kept)} continue; ${n(steps[worst - 1].count - steps[worst].count)} people stop here.`,
    });
  }
  const end = steps[steps.length - 1]?.count ?? 0;
  if (end > 0 && payers === 0) {
    out.push({
      tone: "critical",
      title: `${n(end)} opened billing, nobody paid`,
      detail: "Look at price, plan choice and the payment step itself.",
    });
  }
  // A platform whose first step is far below its share of installs usually means a sign-in problem there.
  for (const install of installs) {
    const started = funnel.byPlatform.find((p) => p.platform === install.platform)?.steps[0]?.count ?? 0;
    if (install.count >= 10 && started / install.count < 0.2) {
      out.push({
        tone: "warning",
        title: `${install.platform}: ${n(install.count)} installs, ${n(started)} OTP requests`,
        detail: "Few installers reach sign-in on this platform.",
      });
    }
  }
  return out;
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
