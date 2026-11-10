import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import type {
  EntryData,
  EntryItem,
  EntryKind,
} from "@/domains/identity/entry-kinds";

export class EntryPersistenceError extends Error {
  constructor() {
    super("We could not save or load this section. Please try again.");
    this.name = "EntryPersistenceError";
  }
}

function mapError(error: { code?: string }): Error {
  if (error.code === "42501" || error.code === "PGRST301") {
    return new AuthorizationError();
  }
  return new EntryPersistenceError();
}

export type StoredEntry = EntryItem & { kind: EntryKind; position: number };

export async function listEntries(
  client: FolioneClient,
  userId: string,
): Promise<StoredEntry[]> {
  const { data, error } = await client
    .from("identity_entries")
    .select("id,kind,position,is_visible,data")
    .eq("account_id", userId)
    .order("kind")
    .order("position");
  if (error) throw mapError(error);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as EntryKind,
    position: Number(row.position),
    isVisible: Boolean(row.is_visible),
    data: (row.data ?? {}) as EntryData,
  }));
}

/**
 * Replaces one kind's list with `items` (already validated). Upserts first and deletes the
 * rest afterwards, so a failed write never removes data. Ownership is enforced by RLS.
 */
export async function replaceEntries(
  client: FolioneClient,
  userId: string,
  kind: EntryKind,
  items: readonly EntryItem[],
): Promise<void> {
  if (items.length > 0) {
    const now = new Date().toISOString();
    const { error } = await client.from("identity_entries").upsert(
      items.map((item, position) => ({
        id: item.id,
        account_id: userId,
        kind,
        position,
        is_visible: item.isVisible,
        data: item.data,
        updated_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) throw mapError(error);
  }

  let remove = client
    .from("identity_entries")
    .delete()
    .eq("account_id", userId)
    .eq("kind", kind);
  if (items.length > 0) {
    // ids are validated UUIDs, so the list cannot carry filter syntax.
    remove = remove.not("id", "in", `(${items.map((i) => i.id).join(",")})`);
  }
  const { error } = await remove;
  if (error) throw mapError(error);
}
