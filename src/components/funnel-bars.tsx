import type { FunnelStep } from "@/lib/posthog";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Horizontal funnel: one bar per step, scaled to the first step. */
export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.count || 1;
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const fromPrev = prev ? s.count / prev : null;
        const share = s.count / top;
        return (
          <li key={s.label} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr]">
            <span className="text-ink-2">{s.label}</span>
            <div
              className="flex items-center gap-2"
              title={`${s.label}: ${s.count.toLocaleString("en-IN")} people · ${pct(share)} of the first step${
                fromPrev !== null ? ` · ${pct(fromPrev)} of the step before` : ""
              }`}
            >
              <span
                className="h-5 max-h-6 rounded-r bg-accent"
                style={{ width: `${Math.max(share * 100, 0.5)}%` }}
              />
              <span className="shrink-0 tabular-nums text-ink">
                {s.count.toLocaleString("en-IN")}
                {fromPrev !== null && <span className="ml-2 text-xs text-ink-3">{pct(fromPrev)} of previous</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
