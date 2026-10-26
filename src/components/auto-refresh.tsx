"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-runs the page's server queries every `seconds` while the tab is visible. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdated(new Date());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <p
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2"
      aria-live="polite"
      title={`Updates every ${seconds}s while this tab is open`}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-good" />
      </span>
      Live
      {updated && (
        <span className="text-ink-3">
          · {updated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </p>
  );
}
