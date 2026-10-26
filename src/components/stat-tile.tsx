import { ArrowRight, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "./sparkline";

export type Delta = {
  /** Fractional change (0.25 = +25%); null when there's nothing to compare with. */
  change: number | null;
  /** What it's compared with, e.g. "vs previous 7 days". */
  label: string;
  /** False for metrics where going down is good (errors). */
  upIsGood?: boolean;
};

export function DeltaChip({ change, label, upIsGood = true }: Delta) {
  if (change === null || !Number.isFinite(change)) return null;
  const pct = Math.round(change * 100);
  if (pct === 0) return <span className="chip bg-surface-2 text-ink-2">No change {label}</span>;
  const up = pct > 0;
  const good = up === upIsGood;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`chip ${good ? "bg-good-soft text-good" : "bg-critical-soft text-critical"}`}>
      <Icon size={13} strokeWidth={2.25} aria-hidden />
      {up ? "+" : ""}
      {pct}% <span className="font-normal opacity-80">{label}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  note,
  icon: Icon,
  delta,
  trend,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  /** Shown instead of a value when the data isn't available yet. */
  note?: string;
  icon?: LucideIcon;
  delta?: Delta;
  /** Daily values, oldest first, drawn as a sparkline under the figure. */
  trend?: number[];
  href?: string;
  tone?: "default" | "good" | "warning" | "critical";
}) {
  const toneText = { default: "text-ink", good: "text-good", warning: "text-warning", critical: "text-critical" }[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        {Icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon size={15} strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>
      {note ? (
        <p className="mt-3 text-sm text-ink-3">{note}</p>
      ) : (
        <>
          <p className={`display-num mt-2 text-[1.75rem] leading-none sm:text-3xl ${toneText}`}>{value}</p>
          {(delta || sub) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
              {delta && <DeltaChip {...delta} />}
              {sub && <span>{sub}</span>}
            </div>
          )}
          {trend && trend.some((v) => v > 0) && <Sparkline values={trend} className="mt-3 h-9" />}
        </>
      )}
      {href && (
        <ArrowRight
          size={14}
          className="absolute right-4 bottom-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </>
  );
  const cls = "card group relative flex min-w-0 flex-col p-4";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
