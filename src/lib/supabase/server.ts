import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { folioneDbOptions } from "@/lib/db/schema";
import { requireSupabaseConfig } from "@/lib/env";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Sign in with a valid Folioone account to continue.");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to access this profile.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * `anonymous: true` builds a client that ignores the visitor's cookies, so it always runs as
 * the database role `anon` (public website reads). It never carries a session.
 */
export async function createClient({ anonymous = false } = {}) {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = anonymous ? null : await cookies();

  return createServerClient(url, anonKey, {
    db: folioneDbOptions,
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet) {
        if (!cookieStore) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server components cannot mutate cookies; middleware handles session refresh.
        }
      },
    },
  });
}

/** Returns the cookie-backed client only after Supabase verifies its user. */
export async function createAuthenticatedClient() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  return { client, user };
}
