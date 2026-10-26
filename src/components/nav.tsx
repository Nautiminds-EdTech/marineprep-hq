"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Overview" },
  { href: "/funnel", label: "Funnel" },
  { href: "/quality", label: "Quality" },
  { href: "/fixes", label: "Fix queue" },
  { href: "/reviews", label: "Reviews" },
  { href: "/connections", label: "Connections" },
] as const;

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
    </nav>
  );
}
