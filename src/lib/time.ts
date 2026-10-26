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
