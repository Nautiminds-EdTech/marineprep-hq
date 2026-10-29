"use server";

import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Only same-origin paths ("/seo/posts/…"), never "//evil.com" or "/\\evil.com". */
function safeNext(next: unknown) {
  const path = typeof next === "string" ? next : "";
  return /^\/(?![/\\])/.test(path) && !path.startsWith("/login") ? path : "/";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Reject before touching Supabase so non-admins never get an HQ session.
  if (!isAdminEmail(email)) return { error: "This account doesn't have access to HQ." };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
