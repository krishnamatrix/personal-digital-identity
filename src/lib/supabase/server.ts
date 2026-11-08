import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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

export async function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
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
