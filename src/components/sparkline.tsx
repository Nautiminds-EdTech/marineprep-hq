/**
 * Tiny trend line for stat tiles: 2px line, a 10% wash under it and a dot on the latest value.
 * Stretches to its container; the dot is HTML so it stays round.
 */
export function Sparkline({ values, className = "h-10" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const y = (v: number) => 92 - (v / max) * 84;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <div className={`relative ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={`${line} L100,100 L0,100 Z`} fill="var(--accent)" fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-2 -translate-1/2 rounded-full bg-accent ring-2 ring-surface"
        style={{ left: "100%", top: `${y(last)}%` }}
      />
    </div>
  );
}
