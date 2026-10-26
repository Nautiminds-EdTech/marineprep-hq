import { Activity, Anchor, Funnel, Star } from "lucide-react";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · MarinePrep HQ" };

const errors: Record<string, string> = {
  "not-allowed": "This account doesn't have access to HQ.",
};

const features = [
  { icon: Funnel, text: "Signups, sales and the funnel, live" },
  { icon: Activity, text: "App health from Sentry, with Claude-drafted fixes" },
  { icon: Star, text: "Store reviews from Google Play and the App Store" },
];

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div
        className="relative flex flex-col justify-between gap-8 overflow-hidden bg-[linear-gradient(140deg,var(--hull),var(--hull-2)_60%,#145f73)] pb-8 text-hull-ink md:py-12"
        style={{
          paddingTop: "max(2rem, env(safe-area-inset-top, 0px))",
          paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
          paddingRight: "24px",
        }}
      >
        {/* Contour lines, like depth soundings on a chart. */}
        <svg
          className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] text-hull-accent/15"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          {[90, 74, 58, 42, 26].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} strokeWidth="0.75" />
          ))}
        </svg>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-hull-accent/15 text-hull-accent ring-1 ring-hull-accent/30">
            <Anchor size={20} aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-[10px] font-semibold tracking-[0.2em] text-hull-accent uppercase">
              MarinePrep
            </span>
            <span className="block font-display text-lg font-semibold text-white">HQ</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold text-white md:text-4xl">
            The company&apos;s bridge.
          </h1>
          <p className="mt-3 text-sm text-hull-ink-2 md:text-base">
            Everything Nautiminds needs to steer MarinePrep toward IMUCET, in one place.
          </p>
          <ul className="mt-6 hidden flex-col gap-3 md:flex">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-hull-ink">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/5 text-hull-accent">
                  <Icon size={16} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-xs text-hull-ink-2 md:block">Private · admins only</p>
      </div>

      <div className="flex items-start justify-center px-6 py-10 md:items-center md:py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1.5 mb-7 text-sm text-ink-2">
            Use your admin account (the same one as the content admin).
          </p>
          <Suspense fallback={null}>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  const key = typeof error === "string" ? error : undefined;
  return <LoginForm initialError={key ? errors[key] : undefined} />;
}
