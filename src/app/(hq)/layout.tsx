import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../login/actions";

export default function HqLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-line px-4 py-4 md:w-56 md:border-r md:py-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">MarinePrep</p>
          <p className="text-lg font-semibold">HQ</p>
        </div>
        <Nav />
        <div className="mt-auto hidden md:block">
          <Suspense fallback={null}>
            <Account />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}

async function Account() {
  const admin = await requireAdmin();
  return (
    <form action={signOut} className="flex flex-col gap-1 text-xs text-ink-3">
      <span className="truncate">{admin.email}</span>
      <button type="submit" className="self-start text-ink-2 underline-offset-2 hover:underline">
        Sign out
      </button>
    </form>
  );
}
