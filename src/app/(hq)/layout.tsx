import { Anchor, LogOut, Plug } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Menu } from "@/components/menu";
import { SideNav, SideNavStatic, TabBar, TabBarStatic } from "@/components/nav";
import { getAttention } from "@/lib/attention";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../login/actions";

export default function HqLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-8 bg-[linear-gradient(180deg,var(--hull),var(--hull-2))] px-3 py-6 text-hull-ink md:flex lg:w-64">
        <Brand />
        <Suspense fallback={<SideNavStatic />}>
          <SideNavWithBadges />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={null}>
            <SideAccount />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-hull pb-3 text-hull-ink md:hidden"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
          }}
        >
          <Brand compact />
          <Suspense fallback={<span className="size-9 rounded-full bg-white/10" />}>
            <PhoneAccount />
          </Suspense>
        </header>
        <main
          className="mx-auto w-full max-w-6xl flex-1 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pt-8 md:pb-12"
          style={{
            paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="md:px-4">{children}</div>
        </main>
      </div>

      <Suspense fallback={<TabBarStatic />}>
        <TabBarWithBadges />
      </Suspense>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-hull-accent/15 text-hull-accent ring-1 ring-hull-accent/30">
        <Anchor size={compact ? 18 : 20} strokeWidth={2} aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[10px] font-semibold tracking-[0.2em] text-hull-accent uppercase">MarinePrep</span>
        <span className="block font-display text-lg font-semibold text-white">HQ</span>
      </span>
    </Link>
  );
}

async function SideNavWithBadges() {
  return <SideNav badges={await getAttention()} />;
}

async function TabBarWithBadges() {
  return <TabBar badges={await getAttention()} />;
}

const initials = (email: string) => email.slice(0, 2).toUpperCase();

async function SideAccount() {
  const admin = await requireAdmin();
  return (
    <form action={signOut} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hull-accent/20 text-xs font-bold text-hull-accent">
        {initials(admin.email)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-hull-ink-2" title={admin.email}>
        {admin.email}
      </span>
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className="rounded-lg p-1.5 text-hull-ink-2 hover:bg-white/10 hover:text-white"
      >
        <LogOut size={16} aria-hidden />
      </button>
    </form>
  );
}

async function PhoneAccount() {
  const admin = await requireAdmin();
  return (
    <Menu label="Account menu" summary={initials(admin.email)}>
      <p className="truncate px-3 py-2 text-xs text-ink-3">{admin.email}</p>
      <Link href="/connections" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-2">
        <Plug size={16} className="text-ink-3" aria-hidden /> Connections
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
        >
          <LogOut size={16} className="text-ink-3" aria-hidden /> Sign out
        </button>
      </form>
    </Menu>
  );
}
