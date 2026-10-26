import { ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

export type Signal = {
  tone: "good" | "info" | "warning" | "critical";
  title: string;
  detail?: string;
  href?: string;
};

const TONE: Record<Signal["tone"], { Icon: LucideIcon; icon: string; label: string }> = {
  critical: { Icon: CircleAlert, icon: "bg-critical-soft text-critical", label: "Urgent" },
  warning: { Icon: TriangleAlert, icon: "bg-warning-soft text-warning", label: "Needs a look" },
  info: { Icon: Info, icon: "bg-accent-soft text-accent", label: "For context" },
  good: { Icon: CircleCheck, icon: "bg-good-soft text-good", label: "Going well" },
};

/** Plain-language signals, most urgent first. Each carries an icon and label, never color alone. */
export function AttentionList({ signals, empty }: { signals: Signal[]; empty: string }) {
  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  const sorted = [...signals].sort((a, b) => order[a.tone] - order[b.tone]);
  if (!sorted.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <CircleCheck size={18} className="text-good" aria-hidden /> {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((s) => {
        const t = TONE[s.tone];
        const inner = (
          <>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
              <t.Icon size={16} strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">{t.label}: </span>
              <span className="block text-sm font-medium text-ink">{s.title}</span>
              {s.detail && <span className="mt-0.5 block text-xs text-ink-3">{s.detail}</span>}
            </span>
            {s.href && <ChevronRight size={16} className="mt-1.5 shrink-0 text-ink-3" aria-hidden />}
          </>
        );
        const cls = "flex items-start gap-3 rounded-xl p-2.5";
        return (
          <li key={s.title}>
            {s.href ? (
              <Link href={s.href} className={`${cls} transition-colors hover:bg-surface-2`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
