"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Overview" },
  { href: "/funnel", label: "Funnel" },
  { href: "/quality", label: "Quality" },
  { href: "/fixes", label: "Fix queue" },
  { href: "/connections", label: "Connections" },
] as const;

const upcoming = ["Reviews"];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
              active ? "bg-accent/15 font-medium text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      {upcoming.map((label) => (
        <span
          key={label}
          className="hidden px-3 py-2 text-sm text-ink-3 md:block"
          title="Coming in the next steps"
        >
          {label} <span className="text-xs">· soon</span>
        </span>
      ))}
    </nav>
  );
}
