import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { folioneDbOptions } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  } = env;

  // Keep static UI preview usable without Supabase configuration. The profile
  // route still renders its safe unavailable state in this case.
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    db: folioneDbOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // This refreshes cookies when needed; the page/service independently verifies
  // the user before any user-owned database operation.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/",
    "/profile/:path*",
    "/personas/:path*",
    "/onboarding/:path*",
    "/website/:path*",
    "/cards/:path*",
    "/insights/:path*",
    "/designer/:path*",
    "/pricing/:path*",
    "/articles/:path*",
    "/reset-password",
  ],
};
