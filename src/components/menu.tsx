"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** A <details> dropdown that closes on navigation and on a tap outside it. */
export function Menu({ summary, label, children }: { summary: React.ReactNode; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full bg-hull-accent/20 text-xs font-bold text-hull-accent [&::-webkit-details-marker]:hidden"
      >
        {summary}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 text-ink shadow-xl">
        {children}
      </div>
    </details>
  );
}
