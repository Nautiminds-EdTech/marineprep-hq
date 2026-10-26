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
    <p className="text-xs text-ink-3" aria-live="polite">
      Updates every {seconds}s
      {updated &&
        ` · last ${updated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
    </p>
  );
}
