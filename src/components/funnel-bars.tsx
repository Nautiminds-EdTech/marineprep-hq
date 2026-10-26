import { ArrowDown } from "lucide-react";
import type { FunnelStep } from "@/lib/posthog";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => n.toLocaleString("en-IN");

/** Index of the step that loses the largest share of the step before it (null with no losses). */
export function biggestDrop(steps: FunnelStep[]) {
  let worst: number | null = null;
  let worstRate = 0;
  steps.forEach((s, i) => {
    if (!i || !steps[i - 1].count) return;
    const lost = 1 - s.count / steps[i - 1].count;
    if (lost > worstRate) {
      worstRate = lost;
      worst = i;
    }
  });
  return worst;
}

/** Funnel as full-width tracks scaled to the first step, with the hand-off between steps called out. */
export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.count || 1;
  const worst = biggestDrop(steps);
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const kept = prev ? s.count / prev : null;
        const share = s.count / top;
        return (
          <li key={s.label} className="flex flex-col">
            {kept !== null && (
              <p
                className={`my-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-xs ${
                  i === worst ? "text-warning" : "text-ink-3"
                }`}
              >
                <ArrowDown size={13} aria-hidden />
                <span>
                  {pct(kept)} continued · {num(prev! - s.count)} dropped
                </span>
                {i === worst && <span className="chip bg-warning-soft font-semibold text-warning">Biggest drop</span>}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{s.label}</span>
              <span className="shrink-0 text-sm">
                <span className="display-num text-lg">{num(s.count)}</span>
                <span className="ml-1.5 text-xs text-ink-3">{pct(share)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(share * 100, s.count ? 1 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
