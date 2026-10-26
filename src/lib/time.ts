const TZ = "Asia/Kolkata";

/** ISO timestamp for 00:00 IST, `daysAgo` days before today. */
export function istDayStart(daysAgo = 0) {
  const now = new Date(Date.now() - daysAgo * 86_400_000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  return `${ymd}T00:00:00+05:30`;
}

export function formatTimeIST(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatINR(rupees: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** The IST calendar day (YYYY-MM-DD) a timestamp falls on. */
export function istDay(iso: string) {
  return dayKey.format(new Date(iso));
}

/** The last `n` IST days as YYYY-MM-DD, oldest first, ending today. */
export function lastIstDays(n: number) {
  return Array.from({ length: n }, (_, i) => dayKey.format(new Date(Date.now() - (n - 1 - i) * 86_400_000)));
}

/** "26 Oct" for a YYYY-MM-DD day. */
export function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** "Monday, 26 October" in IST. */
export function formatTodayIST() {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );
}

/** "3 min ago", "5 h ago", "2 days ago". */
export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
