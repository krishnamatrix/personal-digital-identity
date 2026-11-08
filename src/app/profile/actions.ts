"use server";

import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import { updateOwnProfile } from "@/domains/identity/profile-service";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const fieldNames = [
    "displayName",
    "headline",
    "summary",
    "location",
    "websiteUrl",
    "linkedinUrl",
    "githubUrl",
  ] as const;
  const input = Object.fromEntries(
    fieldNames.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" && value !== "" ? value : null];
    }),
  );

  try {
    await updateOwnProfile(input);
    return {
      status: "success",
      message: "Your private profile has been saved.",
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return {
        status: "error",
        message: "Sign in before saving your profile.",
      };
    }
    if (error instanceof AuthorizationError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: "Review the highlighted fields and try again.",
        fieldErrors: error.issues.reduce<Record<string, string[]>>(
          (result, issue) => {
            const field = issue.path[0];
            if (typeof field === "string") {
              result[field] ??= [];
              result[field].push(issue.message);
            }
            return result;
          },
          {},
        ),
      };
    }

    return {
      status: "error",
      message:
        "We could not save your profile. Check your sign-in and database setup, then try again.",
    };
  }
}
