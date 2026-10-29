import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// This is an optimistic check only; pages still call requireAdmin().
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const onLogin = request.nextUrl.pathname.startsWith("/login");

  if (!signedIn && !onLogin) {
    // Keep where they were going (e.g. a Telegram "View in HQ" link) so sign-in can return there.
    const login = new URL("/login", request.url);
    const target = request.nextUrl.pathname + request.nextUrl.search;
    if (target !== "/") login.searchParams.set("next", target);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Skip static assets and webhook/cron endpoints (they authenticate with their own secrets).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron).*)"],
};
