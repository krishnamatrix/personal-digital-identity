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
import {
  importResume,
  NotAResumeError,
} from "@/domains/identity/resume-import/resume-import-service";
import { ResumeFileError } from "@/domains/identity/resume-import/resume-file";
import type { ResumeImportPlan } from "@/domains/identity/resume-import/resume-mapping";
import {
  ResumeExtractionFailedError,
  ResumeExtractionUnavailableError,
} from "@/lib/ai/resume-extractor";
import { logLoadError } from "@/lib/server-log";

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

export type ResumeImportActionResult =
  | {
      ok: true;
      summary: ResumeImportPlan["summary"];
      /** Onboarding form values after the import (empty string = not set). */
      values: Record<string, string>;
    }
  | { ok: false; message: string };

const ONBOARDING_VALUE_KEYS = [
  "fullName",
  "displayName",
  "headline",
  "currentDesignation",
  "currentOrganization",
  "industry",
  "professionalSummary",
  "profileImageUrl",
  "location",
  "contactEmail",
  "phone",
  "websiteUrl",
  "primaryPurpose",
] as const;

/** Reads an uploaded resume (PDF or DOCX) and adds its contents to My Identity. */
export async function importResumeAction(
  formData: FormData,
): Promise<ResumeImportActionResult> {
  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return { ok: false, message: "Choose your resume file first." };
  }
  try {
    const { summary, profile } = await importResume(file);
    const values = Object.fromEntries(
      ONBOARDING_VALUE_KEYS.map((key) => [key, profile[key] ?? ""]),
    );
    return { ok: true, summary, values };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return {
        ok: false,
        message: "Your session has ended. Sign in again to continue.",
      };
    }
    if (
      error instanceof ResumeFileError ||
      error instanceof NotAResumeError ||
      error instanceof ResumeExtractionUnavailableError ||
      error instanceof AuthorizationError
    ) {
      return { ok: false, message: error.message };
    }
    logLoadError("/onboarding#resume-import", error);
    if (error instanceof ResumeExtractionFailedError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message:
        "We read your resume but could not save it to your profile. Please try again.",
    };
  }
}
