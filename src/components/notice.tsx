import { CircleAlert, Info, TriangleAlert } from "lucide-react";

/** An inline message: info for context, warning for degraded data, critical for failures. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "critical";
  children: React.ReactNode;
}) {
  const style = {
    info: { cls: "border-line bg-surface-2 text-ink-2", Icon: Info, icon: "text-ink-3" },
    warning: { cls: "border-warning/30 bg-warning-soft text-ink", Icon: TriangleAlert, icon: "text-warning" },
    critical: { cls: "border-critical/30 bg-critical-soft text-ink", Icon: CircleAlert, icon: "text-critical" },
  }[tone];
  return (
    <div role={tone === "critical" ? "alert" : undefined} className={`flex gap-3 rounded-2xl border p-3.5 text-sm ${style.cls}`}>
      <style.Icon size={18} className={`mt-px shrink-0 ${style.icon}`} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
