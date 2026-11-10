import "server-only";
import {
  createEmptyProfile,
  ensureAccount,
  findProfile,
  getAuthenticatedDb,
  listEntries,
  replaceEntries,
  updateProfile,
} from "@/lib/db/query";
import { extractResume } from "@/lib/ai/resume-extractor";
import type { EntryItem, EntryKind } from "@/domains/identity/entry-kinds";
import { readResumeFile } from "@/domains/identity/resume-import/resume-file";
import {
  mapResumeToIdentity,
  type ResumeImportPlan,
} from "@/domains/identity/resume-import/resume-mapping";

/** The document was read, but it is not a resume (or holds nothing usable). */
export class NotAResumeError extends Error {
  constructor() {
    super(
      "This does not look like a resume or CV. Upload your resume, or skip this step.",
    );
    this.name = "NotAResumeError";
  }
}

export type ResumeImportResult = {
  summary: ResumeImportPlan["summary"];
  /** The profile after the import, for refreshing the onboarding form. */
  profile: Awaited<ReturnType<typeof updateProfile>>;
};

/**
 * Reads a resume and adds what it contains to the signed-in person's Master Identity.
 *
 * The session is verified BEFORE the file is read or sent to Claude, so anonymous requests
 * cost nothing. Existing data always wins: only empty profile fields are filled, and list
 * entries are appended (de-duplicated), never replaced. The file itself is not stored.
 */
export async function importResume(file: File): Promise<ResumeImportResult> {
  const { client, user } = await getAuthenticatedDb();
  const document = await readResumeFile(file);
  const extraction = await extractResume(document);
  if (!extraction.isResume) throw new NotAResumeError();

  await ensureAccount(client, user.id);
  const profile =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));
  const existing: Partial<Record<EntryKind, EntryItem[]>> = {};
  for (const e of await listEntries(client, user.id)) {
    (existing[e.kind] ??= []).push({
      id: e.id,
      isVisible: e.isVisible,
      data: e.data,
    });
  }

  const plan = mapResumeToIdentity(extraction, profile, existing);
  const addedSomething =
    plan.summary.profileFields.length > 0 ||
    Object.keys(plan.summary.added).length > 0;
  if (!addedSomething && plan.summary.skipped > 0) throw new NotAResumeError();

  for (const [kind, items] of Object.entries(plan.entries) as [
    EntryKind,
    EntryItem[],
  ][]) {
    await replaceEntries(client, user.id, kind, items);
  }

  const patch = { ...plan.profilePatch };
  const links = plan.entries.social_link;
  if (links) {
    // Persona selections read linkedin_url / github_url: mirror them, as the editor does.
    const first = (platform: string) =>
      links.find((i) => i.data.platform === platform)?.data.url as
        | string
        | undefined;
    if (!profile.linkedinUrl && first("linkedin"))
      patch.linkedinUrl = first("linkedin");
    if (!profile.githubUrl && first("github"))
      patch.githubUrl = first("github");
  }
  const updated =
    Object.keys(patch).length > 0
      ? await updateProfile(client, user.id, patch)
      : profile;

  return { summary: plan.summary, profile: updated };
}
