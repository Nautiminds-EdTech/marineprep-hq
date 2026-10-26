import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdminEmail } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

export type Admin = { id: string; email: string };

/** The authoritative check: verifies the JWT and the email allowlist. */
export async function requireAdmin(): Promise<Admin> {
  // Everything behind the admin check is live data read at request time (and uses the clock),
  // so don't let runtime prefetching render it ahead of the request.
  await connection();
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  if (!isAdminEmail(claims.email)) redirect("/login?error=not-allowed");
  return { id: claims.sub, email: claims.email as string };
}
