import "server-only";
import { getAuthenticatedDb } from "@/lib/db/query";
import {
  createEmptyProfile,
  ensureAccount,
  updateProfile,
} from "@/lib/db/query";
import { listEntries, replaceEntries, type StoredEntry } from "@/lib/db/query";
import {
  entryListSchema,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";

export async function getOwnEntries(): Promise<StoredEntry[]> {
  const { client, user } = await getAuthenticatedDb();
  return listEntries(client, user.id);
}

export async function saveOwnEntries(
  kind: EntryKind,
  input: unknown,
): Promise<EntryItem[]> {
  const items = entryListSchema(kind).parse(input) as EntryItem[];
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  await createEmptyProfile(client, user.id);
  await replaceEntries(client, user.id, kind, items);

  if (kind === "social_link") {
    // Persona selections still read linkedin_url / github_url: keep them in step.
    const first = (platform: string) =>
      items.find((i) => i.data.platform === platform)?.data.url;
    await updateProfile(client, user.id, {
      linkedinUrl: (first("linkedin") as string | undefined) ?? null,
      githubUrl: (first("github") as string | undefined) ?? null,
    });
  }
  return items;
}
