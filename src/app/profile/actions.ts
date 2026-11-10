"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import { updateOwnProfile } from "@/domains/identity/profile-service";
import { saveOwnEntries } from "@/domains/identity/entries-service";
import { isEntryKind } from "@/domains/identity/entry-kinds";
import { PROFILE_SECTION_FIELDS } from "@/domains/identity/profile-sections";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

function describeFailure(error: unknown): ProfileActionState {
  if (error instanceof AuthenticationRequiredError) {
    return { status: "error", message: "Sign in before saving your profile." };
  }
  if (error instanceof AuthorizationError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      // Profile: path = [field]. Lists: path = [itemIndex, "data", field].
      const key = issue.path.filter((p) => p !== "data").join(".");
      fieldErrors[key || "form"] ??= issue.message;
    }
    const first = error.issues[0];
    const where =
      typeof first?.path[0] === "number" ? `Item ${first.path[0] + 1}: ` : "";
    return {
      status: "error",
      message: `${where}${first?.message ?? "Review the highlighted fields and try again."}`,
      fieldErrors,
    };
  }
  return {
    status: "error",
    message:
      "We could not save your changes. Check your sign-in and database setup, then try again.",
  };
}

/** Saves one profile-column section (personal, professional). Blank values clear the field. */
export async function saveProfileFieldsAction(
  section: string,
  values: Record<string, string>,
): Promise<ProfileActionState> {
  const allowed = PROFILE_SECTION_FIELDS[section];
  if (!allowed) return { status: "error", message: "Unknown profile section." };
  const input = Object.fromEntries(
    allowed.map((field) => {
      const value = values[field];
      return [
        field,
        typeof value === "string" && value.trim() !== "" ? value.trim() : null,
      ];
    }),
  );
  try {
    await updateOwnProfile(input);
    revalidatePath("/profile");
    return {
      status: "success",
      message: "Your private profile has been saved.",
    };
  } catch (error) {
    return describeFailure(error);
  }
}

/** Replaces the whole ordered list for one entry kind. */
export async function saveEntriesAction(
  kind: string,
  items: unknown,
): Promise<ProfileActionState> {
  if (!isEntryKind(kind)) {
    return { status: "error", message: "Unknown section." };
  }
  try {
    await saveOwnEntries(kind, items);
    revalidatePath("/profile");
    return { status: "success", message: "Saved." };
  } catch (error) {
    return describeFailure(error);
  }
}
