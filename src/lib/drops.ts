// Drop detection for the daily brief. Pure functions (no I/O) so the rules are easy to test.

export type DropRule =
  | { metric: string; label: string; kind: "count"; minAverage: number; ratio: number }
  | { metric: string; label: string; kind: "rate"; maxFall: number };

export const DROP_RULES: DropRule[] = [
  { metric: "signups", label: "Signups", kind: "count", minAverage: 5, ratio: 0.5 },
  { metric: "mocks_started", label: "Mocks started", kind: "count", minAverage: 5, ratio: 0.5 },
  { metric: "ai_messages", label: "AI messages", kind: "count", minAverage: 5, ratio: 0.5 },
  { metric: "error_free_users_7d", label: "Error-free users (7d)", kind: "rate", maxFall: 0.03 },
];

/** Days of history needed before any alert fires. */
export const MIN_HISTORY_DAYS = 7;

export type Drop = { metric: string; label: string; value: number; average: number; kind: DropRule["kind"] };

/**
 * Compares yesterday's value of each metric with its average over the previous days.
 * `history` maps metric → values for the days before yesterday (any order).
 * A metric with fewer than MIN_HISTORY_DAYS values is skipped.
 */
export function findDrops(
  yesterday: Record<string, number | undefined>,
  history: Record<string, number[]>,
  rules: DropRule[] = DROP_RULES,
): Drop[] {
  const drops: Drop[] = [];
  for (const rule of rules) {
    const value = yesterday[rule.metric];
    const past = history[rule.metric] ?? [];
    if (value === undefined || past.length < MIN_HISTORY_DAYS) continue;
    const average = past.reduce((s, v) => s + v, 0) / past.length;

    const dropped =
      rule.kind === "count"
        ? average >= rule.minAverage && value < average * rule.ratio
        : value < average - rule.maxFall;
    if (dropped) drops.push({ metric: rule.metric, label: rule.label, value, average, kind: rule.kind });
  }
  return drops;
}

export function formatDrop(d: Drop) {
  if (d.kind === "rate") {
    const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
    return `${d.label}: ${pct(d.value)} vs ${pct(d.average)} average`;
  }
  const fall = Math.round((1 - d.value / d.average) * 100);
  return `${d.label}: ${d.value} yesterday vs ${d.average.toFixed(1)}/day average (−${fall}%)`;
}
