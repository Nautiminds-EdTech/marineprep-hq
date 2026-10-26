"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {
    error: initialError,
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        Email
        <input name="email" type="email" required autoComplete="email" className="field" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-critical-soft px-3.5 py-2.5 text-sm text-critical">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-2 min-h-11 w-full text-base">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
