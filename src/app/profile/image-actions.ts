"use server";

import { revalidatePath } from "next/cache";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import { ProfileImageFileError } from "@/domains/media/image-file";
import {
  removeMyProfileImage,
  uploadMyProfileImage,
} from "@/domains/media/profile-image-service";

export type ProfileImageActionResult =
  | { ok: true; ref: string | null; displayUrl: string | null }
  | { ok: false; message: string };

function refresh() {
  for (const path of ["/profile", "/onboarding", "/website", "/cards"])
    revalidatePath(path);
}

function failure(error: unknown): ProfileImageActionResult {
  if (error instanceof AuthenticationRequiredError)
    return { ok: false, message: "Sign in before adding a photo." };
  if (error instanceof ProfileImageFileError)
    return { ok: false, message: error.message };
  logLoadError("profile-image", error);
  return {
    ok: false,
    message: "We could not save your photo. Please try again.",
  };
}

/** Stores the (browser-resized) photo privately and points the profile at it. */
export async function uploadProfileImageAction(
  formData: FormData,
): Promise<ProfileImageActionResult> {
  const file = formData.get("image");
  if (!(file instanceof File))
    return { ok: false, message: "Choose an image first." };
  try {
    const { ref, displayUrl } = await uploadMyProfileImage(file);
    refresh();
    return { ok: true, ref, displayUrl };
  } catch (error) {
    return failure(error);
  }
}

export async function removeProfileImageAction(): Promise<ProfileImageActionResult> {
  try {
    await removeMyProfileImage();
    refresh();
    return { ok: true, ref: null, displayUrl: null };
  } catch (error) {
    return failure(error);
  }
}
