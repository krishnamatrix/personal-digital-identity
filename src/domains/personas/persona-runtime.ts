import "server-only";
import { findProfile } from "@/domains/identity/profile-repository";
import { InMemoryPersonaRepository } from "@/domains/personas/persona-memory-repository";
import type { PersonaRepository } from "@/domains/personas/persona-repository";
import { createPersonaService } from "@/domains/personas/persona-service";
import { SupabasePersonaRepository } from "@/domains/personas/persona-supabase-repository";
import { env } from "@/lib/env";
import { createAuthenticatedClient } from "@/lib/supabase/server";

/**
 * Production wiring for Personas. The storage backend is chosen by the
 * server-side PERSONA_STORAGE variable:
 *
 *   "fixture"  (DEFAULT) the IN-MEMORY FIXTURE ADAPTER. Per server process, lost
 *              on restart, no database access. Used until the Persona SQL
 *              (docs/sql/milestone-3c) has been approved, executed and verified.
 *   "supabase" the PostgREST/RPC repository. Every call carries the verified
 *              user's session JWT; RLS isolates tenants. Never enable it before
 *              the SQL is deployed: the application would fail on every call.
 *
 * Either way the account id comes from the verified Supabase session, and
 * Master Identity is only read (findProfile is a SELECT; unlike getOwnProfile it
 * never creates rows).
 *
 * The fixture instance is kept on globalThis so it survives module reloads in
 * development. It is shared by every user but keyed by account id.
 */
const globalForPersonas = globalThis as typeof globalThis & {
  __folioonePersonaFixture?: InMemoryPersonaRepository;
};

function sharedFixture() {
  globalForPersonas.__folioonePersonaFixture ??=
    new InMemoryPersonaRepository();
  return globalForPersonas.__folioonePersonaFixture;
}

export function getPersonaService() {
  // One verified session per service instance, shared by the repository and the
  // context, so a request authenticates once (auth.getUser() is a network call).
  let pending: ReturnType<typeof createAuthenticatedClient> | undefined;
  const session = () => (pending ??= createAuthenticatedClient());

  const repository: PersonaRepository =
    env.PERSONA_STORAGE === "supabase"
      ? new SupabasePersonaRepository(async () => {
          const { client, user } = await session();
          return { client, userId: user.id };
        })
      : sharedFixture();

  return createPersonaService({
    repository,
    getContext: async () => {
      // Verifies the Supabase session; the account id is never client input.
      const { client, user } = await session();
      return {
        accountId: user.id,
        // Read-only: findProfile is a SELECT and never creates or updates the
        // Master Identity profile (unlike getOwnProfile).
        loadCanonicalProfile: async () => {
          const profile = await findProfile(client, user.id);
          return {
            displayName: profile?.displayName ?? null,
            headline: profile?.headline ?? null,
            summary: profile?.summary ?? null,
            location: profile?.location ?? null,
            websiteUrl: profile?.websiteUrl ?? null,
            linkedinUrl: profile?.linkedinUrl ?? null,
            githubUrl: profile?.githubUrl ?? null,
          };
        },
      };
    },
  });
}
