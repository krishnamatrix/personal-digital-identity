"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  createDesign,
  deleteDraftDesign,
  DesignNotFoundError,
  DesignNotReadyError,
  generateDesignVersion,
  NotPlatformAdminError,
  publishDesign,
  saveDesignVersion,
  setDesignRetired,
  surfaceSchema,
  updateDesignDetails,
} from "@/domains/designs/design-admin-service";
import type { DesignProblem } from "@/domains/designs/design-checks";
import { DesignAiError } from "@/lib/ai/design-generator";
import { DesignConflictError, DesignsNotInstalledError } from "@/lib/db/query";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";

/**
 * Folio Designer actions (platform admins only: the service checks platform_admins on every
 * call and RLS checks again). Results carry safe messages only.
 */
export type DesignActionResult<T = object> =
  | ({ ok: true; message?: string; problems?: DesignProblem[] } & T)
  | { ok: false; message: string; problems?: DesignProblem[] };

type Failure = { ok: false; message: string; problems?: DesignProblem[] };

function failure(action: string, error: unknown): Failure {
  if (error instanceof NotPlatformAdminError)
    return { ok: false, message: error.message };
  if (error instanceof AuthenticationRequiredError)
    return { ok: false, message: "Your session has ended. Sign in again." };
  if (error instanceof DesignAiError)
    return { ok: false, message: error.message };
  if (error instanceof DesignNotReadyError)
    return { ok: false, message: error.message, problems: error.problems };
  if (error instanceof DesignNotFoundError)
    return { ok: false, message: error.message };
  if (error instanceof DesignConflictError)
    return { ok: false, message: error.message };
  if (error instanceof DesignsNotInstalledError)
    return {
      ok: false,
      message:
        "Folio Designer is not set up in the database yet (milestone-14 SQL).",
    };
  if (error instanceof ZodError)
    return {
      ok: false,
      message: `Check the design: ${error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "value"} ${i.message.toLowerCase()}`)
        .join("; ")}.`,
    };
  logLoadError(`admin-designs:${action}`, error);
  return { ok: false, message: "That did not work. Please try again." };
}

const refresh = (surface: string, id?: string) => {
  revalidatePath("/admin/designs");
  if (id) revalidatePath(`/admin/designs/${surface}/${id}`);
};

export async function createDesignAction(
  input: unknown,
): Promise<DesignActionResult<{ surface: string; id: string }>> {
  try {
    const made = await createDesign(input);
    refresh(made.surface);
    return {
      ok: true,
      surface: made.surface,
      id: made.id,
      problems: made.problems,
    };
  } catch (error) {
    return failure("create", error);
  }
}

export async function saveVersionAction(
  surface: string,
  id: string,
  spec: unknown,
): Promise<DesignActionResult<{ version: number }>> {
  try {
    const s = surfaceSchema.parse(surface);
    const r = await saveDesignVersion(s, id, spec);
    refresh(s, id);
    return {
      ok: true,
      version: r.version,
      problems: r.problems,
      message: `Saved as version ${r.version}.`,
    };
  } catch (error) {
    return failure("save-version", error);
  }
}

export async function generateVersionAction(
  surface: string,
  id: string,
  prompt: string,
  fromSpec: unknown,
): Promise<DesignActionResult<{ version: number }>> {
  try {
    const s = surfaceSchema.parse(surface);
    const r = await generateDesignVersion(s, id, prompt, fromSpec);
    refresh(s, id);
    return {
      ok: true,
      version: r.version,
      problems: r.problems,
      message: `The AI made version ${r.version}.`,
    };
  } catch (error) {
    return failure("generate", error);
  }
}

export async function updateDetailsAction(
  surface: string,
  id: string,
  input: unknown,
): Promise<DesignActionResult> {
  try {
    const s = surfaceSchema.parse(surface);
    await updateDesignDetails(s, id, input);
    refresh(s, id);
    return { ok: true, message: "Details saved." };
  } catch (error) {
    return failure("details", error);
  }
}

export async function publishDesignAction(
  surface: string,
  id: string,
  version: number,
): Promise<DesignActionResult> {
  try {
    const s = surfaceSchema.parse(surface);
    await publishDesign(s, id, version);
    refresh(s, id);
    return {
      ok: true,
      message: `Version ${version} is live. People can now choose this design.`,
    };
  } catch (error) {
    return failure("publish", error);
  }
}

export async function retireDesignAction(
  surface: string,
  id: string,
  retired: boolean,
): Promise<DesignActionResult> {
  try {
    const s = surfaceSchema.parse(surface);
    await setDesignRetired(s, id, retired);
    refresh(s, id);
    return {
      ok: true,
      message: retired
        ? "Retired. It is no longer offered; sites already using it keep it."
        : "Restored. It is offered again.",
    };
  } catch (error) {
    return failure("retire", error);
  }
}

export async function deleteDesignAction(
  surface: string,
  id: string,
): Promise<DesignActionResult> {
  try {
    const s = surfaceSchema.parse(surface);
    await deleteDraftDesign(s, id);
    refresh(s);
    return { ok: true, message: "Deleted." };
  } catch (error) {
    return failure("delete", error);
  }
}
