import type {
  PersonaDbClient,
  PersonaDbSession,
} from "@/lib/db/queries/personas";

export type FakeCall =
  | {
      kind: "select";
      table: string;
      select: string;
      filters: Record<string, unknown>;
    }
  | { kind: "rpc"; name: string; params: Record<string, unknown> };

type RpcResult = {
  data?: unknown;
  error?: { code: string; message?: string; details?: string } | null;
};

/**
 * A recording stand-in for the Supabase client. It performs NO network access and
 * emulates no database: it only records the calls the repository makes and
 * returns whatever the test scripts. It filters rows by the `.eq()` conditions it
 * receives so a missing owner predicate would be visible.
 */
export function createFakePostgrest(options: {
  userId: string;
  rows?: Record<string, unknown>[];
  rpc?: Record<string, (params: Record<string, unknown>) => RpcResult>;
  selectError?: { code: string; message?: string };
}) {
  const calls: FakeCall[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let selected = "";
      const run = () => {
        calls.push({
          kind: "select",
          table,
          select: selected,
          filters: { ...filters },
        });
        if (options.selectError)
          return { data: null, error: options.selectError };
        const rows = (options.rows ?? []).filter((row) =>
          Object.entries(filters).every(
            ([column, value]) => row[column] === value,
          ),
        );
        return { data: rows, error: null };
      };
      const builder = {
        select(columns: string) {
          selected = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        async maybeSingle() {
          const result = run();
          return {
            data: result.data ? ((result.data as unknown[])[0] ?? null) : null,
            error: result.error,
          };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve);
        },
      };
      return builder;
    },
    async rpc(name: string, params: Record<string, unknown>) {
      // Serialize like the HTTP layer: undefined keys disappear, as in a real request.
      const sent = JSON.parse(JSON.stringify(params ?? {}));
      calls.push({ kind: "rpc", name, params: sent });
      const handler = options.rpc?.[name];
      const result = handler ? handler(sent) : { data: null, error: null };
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
  const session: PersonaDbSession = {
    client: client as unknown as PersonaDbClient,
    userId: options.userId,
  };
  return { calls, session, client };
}

export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";
export const PERSONA = "33333333-3333-4333-8333-333333333333";

/** A valid PostgREST row for `personas` with embedded children. */
export function dbRow(patch: Record<string, unknown> = {}) {
  return {
    id: PERSONA,
    account_id: USER,
    name: "Founder",
    description: null,
    audience: "Investors",
    purpose: null,
    status: "active",
    is_default: false,
    position: 0,
    version: 1,
    created_at: "2026-11-09T09:00:00+00:00",
    updated_at: "2026-11-09T09:00:00.123456+00:00",
    archived_at: null,
    persona_sections: [
      {
        section_key: "experience",
        label_override: null,
        is_visible: false,
        position: 1,
      },
      {
        section_key: "profile",
        label_override: "About me",
        is_visible: true,
        position: 0,
      },
    ],
    persona_profile_field_selections: [
      {
        field_key: "headline",
        is_included: true,
        is_highlighted: true,
        position: 1,
      },
      {
        field_key: "display_name",
        is_included: true,
        is_highlighted: false,
        position: 0,
      },
    ],
    persona_profile_overrides: [
      { field_key: "headline", override_value: null, override_version: 2 },
    ],
    persona_revisions: [{ count: 3 }],
    ...patch,
  };
}
