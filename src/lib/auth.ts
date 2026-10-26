import "server-only";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

export type Admin = { id: string; email: string };

/** The authoritative check: verifies the JWT and the email allowlist. */
export async function requireAdmin(): Promise<Admin> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  if (!isAdminEmail(claims.email)) redirect("/login?error=not-allowed");
  return { id: claims.sub, email: claims.email as string };
}
