"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import {
  completeOnboarding,
  saveOnboardingStep,
} from "@/domains/identity/profile-service";

export type OnboardingStepResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function saveOnboardingStepAction(
  step: number,
  values: Record<string, string>,
): Promise<OnboardingStepResult> {
  // Blank optional fields are stored as "not set".
  const cleaned = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      typeof v === "string" && v.trim() !== "" ? v.trim() : null,
    ]),
  );
  try {
    await saveOnboardingStep(step, cleaned);
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return {
        ok: false,
        message: "Your session has ended. Sign in again to continue.",
      };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key) fieldErrors[key] ??= issue.message;
      }
      return {
        ok: false,
        message: "Review the highlighted fields.",
        fieldErrors,
      };
    }
    return {
      ok: false,
      message: "We could not save this step. Please try again.",
    };
  }
}

export async function finishOnboardingAction(): Promise<OnboardingStepResult> {
  try {
    await completeOnboarding();
  } catch {
    return {
      ok: false,
      message: "We could not finish setup. Please try again.",
    };
  }
  redirect("/profile?welcome=1");
}
