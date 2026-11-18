"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import { IntroVideoPersistenceError } from "@/lib/db/query";
import {
  beginIntroUpload,
  captionIntro,
  completeIntroUpload,
  deleteMyIntro,
  draftIntroScript,
  IntroVideoInputError,
  saveIntroCaptions,
  saveIntroScript,
  setIntroOnWebsite,
  type UploadTicket,
} from "@/domains/intro/intro-video-service";
import {
  INTRO_BACKGROUNDS,
  MAX_SCRIPT_CHARS,
  SCRIPT_LENGTHS,
  SCRIPT_TONES,
  type CaptionCue,
  type StudioTake,
} from "@/domains/intro/intro-video";

type Failure = { ok: false; message: string };
export type StudioResult<T = object> = ({ ok: true } & T) | Failure;

function failure(error: unknown, scope: string): Failure {
  if (error instanceof AuthenticationRequiredError)
    return {
      ok: false,
      message: "Your session has ended. Sign in again to continue.",
    };
  if (error instanceof IntroVideoInputError)
    return { ok: false, message: error.message };
  if (error instanceof AuthorizationError)
    return { ok: false, message: error.message };
  if (error instanceof z.ZodError)
    return { ok: false, message: "Something in the request was invalid." };
  logLoadError(`studio:${scope}`, error);
  if (error instanceof IntroVideoPersistenceError)
    return { ok: false, message: error.message };
  return { ok: false, message: "Something went wrong. Please try again." };
}

function refresh() {
  for (const path of ["/website/intro", "/website"]) revalidatePath(path);
}

const draftInput = z.object({
  length: z.enum(Object.keys(SCRIPT_LENGTHS) as [keyof typeof SCRIPT_LENGTHS]),
  tone: z.enum(Object.keys(SCRIPT_TONES) as [keyof typeof SCRIPT_TONES]),
});

export async function draftScriptAction(
  input: unknown,
): Promise<StudioResult<{ script: string; source: "ai" | "template" }>> {
  try {
    const { length, tone } = draftInput.parse(input);
    return { ok: true, ...(await draftIntroScript(length, tone)) };
  } catch (error) {
    return failure(error, "draft");
  }
}

export async function saveScriptAction(script: unknown): Promise<StudioResult> {
  try {
    await saveIntroScript(
      z
        .string()
        .max(MAX_SCRIPT_CHARS * 2)
        .parse(script),
    );
    return { ok: true };
  } catch (error) {
    return failure(error, "script");
  }
}

const beginInput = z.object({
  mimeType: z.string().max(120),
  byteSize: z.number(),
  duration: z.number(),
  withPoster: z.boolean(),
});

export async function beginUploadAction(
  input: unknown,
): Promise<StudioResult<{ ticket: UploadTicket }>> {
  try {
    return {
      ok: true,
      ticket: await beginIntroUpload(beginInput.parse(input)),
    };
  } catch (error) {
    return failure(error, "begin-upload");
  }
}

const completeInput = z.object({
  videoId: z.string().max(40),
  mimeType: z.string().max(120),
  duration: z.number(),
  hasPoster: z.boolean(),
  script: z.string().max(MAX_SCRIPT_CHARS * 2),
  background: z.enum(INTRO_BACKGROUNDS).optional(),
});

export async function completeUploadAction(
  input: unknown,
): Promise<StudioResult<{ take: StudioTake }>> {
  try {
    const take = await completeIntroUpload(completeInput.parse(input));
    refresh();
    return { ok: true, take };
  } catch (error) {
    return failure(error, "complete-upload");
  }
}

/** FormData with "audio": the take's soundtrack as a 16 kHz mono WAV (a few MB at most). */
export async function captionAction(
  formData: FormData,
): Promise<StudioResult<{ captions: CaptionCue[] }>> {
  const audio = formData.get("audio");
  if (!(audio instanceof File))
    return { ok: false, message: "We could not read the audio of this take." };
  try {
    const captions = await captionIntro(audio);
    refresh();
    return { ok: true, captions };
  } catch (error) {
    if (!(error instanceof IntroVideoInputError))
      return {
        ...failure(error, "captions"),
        message: "We could not create captions this time. You can try again.",
      };
    return failure(error, "captions");
  }
}

export async function saveCaptionsAction(
  captions: unknown,
): Promise<StudioResult<{ captions: CaptionCue[] }>> {
  try {
    const saved = await saveIntroCaptions(captions);
    refresh();
    return { ok: true, captions: saved };
  } catch (error) {
    return failure(error, "save-captions");
  }
}

export async function setShowOnWebsiteAction(
  show: unknown,
): Promise<StudioResult> {
  try {
    await setIntroOnWebsite(z.boolean().parse(show));
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "visibility");
  }
}

export async function deleteIntroAction(): Promise<StudioResult> {
  try {
    await deleteMyIntro();
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete");
  }
}
