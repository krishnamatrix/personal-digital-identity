"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  removeProfileImageAction,
  uploadProfileImageAction,
} from "@/app/profile/image-actions";

/** Longest side of the stored photo. Square, centre-cropped. */
const SIZE = 800;
/** Originals above this are refused before decoding (the stored file is far smaller). */
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

/**
 * Centre-crops to a square, scales to SIZE and re-encodes (WebP, else JPEG). Re-encoding also
 * drops EXIF metadata such as the GPS location phones add to photos.
 */
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black, as JPEG
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    out,
    out,
  );
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

export function ProfileImageUpload({
  initialUrl,
  name,
  onChange,
}: {
  /** Displayable URL of the current photo (signed URL for an upload). */
  initialUrl: string | null;
  name?: string | null;
  /** Called with the new profile_image_url value (null when removed). */
  onChange?: (ref: string | null) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function choose(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setMessage({ ok: false, text: "Use a JPEG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      setMessage({ ok: false, text: "Use an image smaller than 15 MB." });
      return;
    }
    start(async () => {
      let blob: Blob;
      try {
        blob = await prepareImage(file);
      } catch {
        setMessage({ ok: false, text: "We could not read that image." });
        return;
      }
      const form = new FormData();
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      form.set(
        "image",
        new File([blob], `profile.${ext}`, { type: blob.type }),
      );
      const result = await uploadProfileImageAction(form);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setUrl(result.displayUrl);
      onChange?.(result.ref);
      setMessage({ ok: true, text: "Photo saved." });
    });
    if (input.current) input.current.value = "";
  }

  function remove() {
    setMessage(null);
    start(async () => {
      const result = await removeProfileImageAction();
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setUrl(null);
      onChange?.(null);
      setMessage({ ok: true, text: "Photo removed." });
    });
  }

  const initial = (name ?? "").trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="border-border bg-muted size-24 shrink-0 overflow-hidden rounded-full border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Your profile photo"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-muted-foreground font-display flex h-full items-center justify-center text-3xl">
            {initial}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">
          <label htmlFor={inputId}>Profile photo</label>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {pending ? "Saving…" : url ? "Change photo" : "Upload photo"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={remove}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs leading-5">
          JPEG, PNG or WebP. Cropped to a square and stored privately. It
          appears on your website and card only when you publish them.
        </p>
        {message && (
          <p
            className={`text-xs ${message.ok ? "text-muted-foreground" : "text-danger"}`}
            role={message.ok ? "status" : "alert"}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
