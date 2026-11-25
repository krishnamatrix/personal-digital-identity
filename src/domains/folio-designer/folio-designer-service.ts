import "server-only";
import {
  createEmptyProfile,
  ensureAccount,
  findProfile,
  getAuthenticatedDb,
} from "@/lib/db/query";
import { designPromptSchema } from "@/domains/folio-designer/folio-designer-schema";
import {
  buildIdentityDesignContext,
  type IdentityDesignContext,
} from "@/domains/folio-designer/identity-design-context";
import { extractFolioDesignerProposal } from "@/lib/ai/folio-designer-extractor";
import type { FolioDesignerProposal } from "@/domains/folio-designer/folio-designer-schema";

export async function loadFolioDesignerSession() {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const profile =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));
  return { client, user, profile };
}

export async function generateFolioDesignerProposal(
  promptInput: unknown,
  options?: { onProgress?: (chars: number) => void },
): Promise<{ proposal: FolioDesignerProposal; identity: IdentityDesignContext }> {
  const prompt = designPromptSchema.parse(promptInput);
  const { client, user, profile } = await loadFolioDesignerSession();
  const identity = await buildIdentityDesignContext(client, user.id, profile);
  const proposal = await extractFolioDesignerProposal(prompt, identity, options);
  return { proposal, identity };
}