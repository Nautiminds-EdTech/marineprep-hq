"use client";

import { Activity, Funnel, LayoutDashboard, Newspaper, Plug, Star, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Attention } from "@/lib/attention";

type Item = {
  href: string;
  label: string;
  /** Label in the phone tab bar, where space is tight. */
  short?: string;
  icon: LucideIcon;
  group: string;
  badge?: keyof Attention;
  /** Hidden from the phone tab bar (reachable from the account menu). */
  tab?: false;
};

const items: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, group: "Business" },
  { href: "/funnel", label: "Funnel", icon: Funnel, group: "Business" },
  { href: "/quality", label: "Quality", icon: Activity, group: "App health" },
  { href: "/fixes", label: "Fix queue", short: "Fixes", icon: Wrench, group: "App health", badge: "fixesWaiting" },
  { href: "/reviews", label: "Reviews", icon: Star, group: "App health", badge: "reviewsUnanswered" },
  { href: "/seo", label: "Blog & SEO", short: "Blog", icon: Newspaper, group: "Growth", badge: "postsWaiting" },
  { href: "/connections", label: "Connections", icon: Plug, group: "Setup", tab: false },
];

const BADGE_HINT: Record<keyof Attention, string> = {
  fixesWaiting: "waiting for approval",
  reviewsUnanswered: "low reviews without a reply",
  postsWaiting: "blog posts waiting for approval",
};

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

type IsActive = (href: string) => boolean;
const noneActive: IsActive = () => false;

/** Desktop sidebar navigation, grouped, on the deep-ocean hull. */
export function SideNav({ badges }: { badges?: Attention }) {
  return <SideNavList badges={badges} isActive={useActive()} />;
}

/**
 * The sidebar without an active item, for Suspense fallbacks: usePathname() can't resolve while a
 * route with an unknown dynamic param (/seo/posts/[id]) prerenders.
 */
export function SideNavStatic() {
  return <SideNavList isActive={noneActive} />;
}

function SideNavList({ badges, isActive }: { badges?: Attention; isActive: IsActive }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold tracking-[0.16em] text-hull-ink-2/80 uppercase">{group}</p>
          {items
            .filter((i) => i.group === group)
            .map((item) => {
              const active = isActive(item.href);
              const count = item.badge ? (badges?.[item.badge] ?? 0) : 0;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-white/10 font-semibold text-white"
                      : "text-hull-ink-2 hover:bg-white/5 hover:text-hull-ink"
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={active ? "text-hull-accent" : "text-hull-ink-2 group-hover:text-hull-ink"}
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span
                      className="min-w-5 rounded-full bg-hull-accent px-1.5 text-center text-[11px] leading-5 font-bold text-hull"
                      title={`${count} ${BADGE_HINT[item.badge!]}`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

/** Phone bottom tab bar. Fixed to the bottom edge, clear of the home indicator. */
export function TabBar({ badges }: { badges?: Attention }) {
  return <TabBarList badges={badges} isActive={useActive()} />;
}

/** The tab bar without an active tab, for Suspense fallbacks (see SideNavStatic). */
export function TabBarStatic() {
  return <TabBarList isActive={noneActive} />;
}

function TabBarList({ badges, isActive }: { badges?: Attention; isActive: IsActive }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items
          .filter((i) => i.tab !== false)
          .map((item) => {
            const active = isActive(item.href);
            const count = item.badge ? (badges?.[item.badge] ?? 0) : 0;
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] ${
                    active ? "font-semibold text-accent" : "text-ink-3"
                  }`}
                >
                  <span className="relative">
                    <span
                      className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                        active ? "bg-accent-soft" : ""
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    </span>
                    {count > 0 && (
                      <span
                        className="absolute -top-1 right-0.5 min-w-4 rounded-full bg-critical px-1 text-center text-[10px] leading-4 font-bold text-white"
                        aria-label={`${count} ${BADGE_HINT[item.badge!]}`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
