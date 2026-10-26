"use client";

import { useState } from "react";

export type Point = { label: string; value: number | null };
type Format = "count" | "inr" | "percent";

const fmt = (v: number, format: Format, compact = false) => {
  if (format === "percent") return `${(v * 100).toFixed(compact ? 0 : 1)}%`;
  const n = new Intl.NumberFormat("en-IN", { notation: compact && v >= 1000 ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(v);
  return format === "inr" ? `₹${n}` : n;
};

/** Clean tick values (1, 2 or 5 × 10^k steps) from `min` to at least `max`. */
function ticks(min: number, max: number, format: Format) {
  const span = Math.max(max - min, format === "percent" ? 0.01 : 1);
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v < max + step * 0.999; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

/**
 * Daily trend with a hover/focus readout. Bars for counts, a line for rates.
 * Every value is also in a screen-reader table, so the tooltip never gates a number.
 */
export function TrendChart({
  points,
  kind = "bar",
  format = "count",
  title,
  height = 176,
  partialLast = false,
  floor,
}: {
  points: Point[];
  kind?: "bar" | "line";
  format?: Format;
  /** Names the series for the table view and screen readers. */
  title: string;
  height?: number;
  /** Mark the last point as still in progress (today). */
  partialLast?: boolean;
  /** Lowest y value to show; defaults to 0 (bars) or just under the data (lines). */
  floor?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const dataMax = Math.max(...values, 0);
  const dataMin = Math.min(...values, dataMax);
  const lo = floor ?? (kind === "bar" ? 0 : Math.max(0, dataMin - (dataMax - dataMin || 0.02) * 0.5));
  const yTicks = ticks(lo, Math.max(dataMax, lo + (format === "percent" ? 0.01 : 1)), format);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const y = (v: number) => ((v - yMin) / (yMax - yMin || 1)) * 100; // % from bottom
  const n = points.length;
  const xc = (i: number) => ((i + 0.5) / n) * 100;
  const xLabels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : points.map((_, i) => i);

  const linePath = points
    .map((p, i) => (p.value === null ? null : { i, v: p.value }))
    .reduce<string>((d, pt, idx, arr) => {
      if (!pt) return d;
      const move = idx === 0 || arr[idx - 1] === null;
      return `${d} ${move ? "M" : "L"}${xc(pt.i).toFixed(2)},${(100 - y(pt.v)).toFixed(2)}`;
    }, "");

  const a = active !== null ? points[active] : null;

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="relative flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the arrow keys to read each day.`}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          setActive((i) => Math.min(n - 1, Math.max(0, (i ?? (step > 0 ? -1 : n)) + step)));
        }}
      >
        {/* y-axis labels */}
        <div className="relative w-10 shrink-0 text-[10px] text-ink-3 tabular-nums" aria-hidden>
          {yTicks.map((t) => (
            <span key={t} className="absolute right-2" style={{ bottom: `${y(t)}%`, transform: "translateY(50%)" }}>
              {fmt(t, format, true)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {yTicks.map((t, i) => (
            <div
              key={t}
              className={`absolute inset-x-0 h-px ${i === 0 ? "bg-line-strong" : "bg-grid"}`}
              style={{ bottom: `${y(t)}%` }}
              aria-hidden
            />
          ))}

          {kind === "line" && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <path
                d={`${linePath}`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {active !== null && kind === "line" && (
            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${xc(active)}%` }} aria-hidden />
          )}

          <div className="absolute inset-0 flex">
            {points.map((p, i) => {
              const partial = partialLast && i === n - 1;
              const isActive = active === i;
              return (
                <div
                  key={p.label}
                  onPointerEnter={() => setActive(i)}
                  className="relative flex h-full flex-1 cursor-default items-end justify-center px-px"
                >
                  {kind === "bar" && p.value !== null && (
                    p.value > 0 ? (
                      <div
                        className={`w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity ${
                          partial ? "opacity-45" : active !== null && !isActive ? "opacity-60" : ""
                        }`}
                        style={{ height: `${Math.max(y(p.value), 1.5)}%` }}
                      />
                    ) : (
                      <div className="h-0.5 w-full max-w-6 rounded-full bg-line-strong" />
                    )
                  )}
                  {kind === "line" && p.value !== null && (isActive || i === n - 1) && (
                    <span
                      className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
                      style={{ left: "50%", bottom: `${y(p.value)}%` }}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>

          {a && active !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${xc(active)}%`,
                transform: `translate(${active < n * 0.25 ? "-10%" : active > n * 0.75 ? "-90%" : "-50%"}, -100%)`,
              }}
              aria-hidden
            >
              <p className="display-num text-sm text-ink">
                {a.value === null ? "No data" : fmt(a.value, format)}
                  {partialLast && active === n - 1 && (
                  <span className="ml-1 font-sans text-xs font-normal text-ink-3">so far</span>
                )}
              </p>
              <p className="text-ink-3">{a.label}</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative ml-10 h-4 text-[11px] text-ink-3" aria-hidden>
        {xLabels.map((i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap"
            style={{
              left: `${xc(i)}%`,
              transform: i === 0 ? "translateX(-25%)" : i === n - 1 ? "translateX(-75%)" : "translateX(-50%)",
            }}
          >
            {points[i].label}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value === null ? "no data" : fmt(p.value, format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
