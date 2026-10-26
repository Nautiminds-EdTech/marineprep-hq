import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · MarinePrep HQ" };

const errors: Record<string, string> = {
  "not-allowed": "This account doesn't have access to HQ.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          MarinePrep
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">HQ</h1>
        <p className="mt-2 mb-8 text-sm text-ink-2">
          Sign in with your admin account (the same one as the content admin).
        </p>
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  const key = typeof error === "string" ? error : undefined;
  return <LoginForm initialError={key ? errors[key] : undefined} />;
}
