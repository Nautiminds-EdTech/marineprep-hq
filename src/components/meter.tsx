/** A single ratio against its limit. The track is a light step of the fill's own color. */
export function Meter({
  value,
  tone = "accent",
  label,
  className = "",
}: {
  /** 0–1 */
  value: number;
  tone?: "accent" | "good" | "warning" | "critical";
  label: string;
  className?: string;
}) {
  const fill = { accent: "bg-accent", good: "bg-good", warning: "bg-warning", critical: "bg-critical" }[tone];
  const track = { accent: "bg-accent-soft", good: "bg-good-soft", warning: "bg-warning-soft", critical: "bg-critical-soft" }[
    tone
  ];
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-2 overflow-hidden rounded-full ${track} ${className}`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
