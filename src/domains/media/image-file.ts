import type { ImageExtension } from "@/domains/media/media-paths";

/** Upload limit (the browser resizes first, so real uploads are far smaller). Same as the buckets. */
export const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

export class ProfileImageFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileImageFileError";
  }
}

const TYPES: Record<ImageExtension, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Image type from the file's first bytes (never from its name or the browser's claim). */
export function sniffImage(bytes: Uint8Array): ImageExtension | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

export type ProfileImageUpload = {
  bytes: Uint8Array;
  ext: ImageExtension;
  contentType: string;
};

export async function readProfileImageFile(
  file: File,
): Promise<ProfileImageUpload> {
  if (file.size === 0)
    throw new ProfileImageFileError("Choose an image first.");
  if (file.size > MAX_PROFILE_IMAGE_BYTES)
    throw new ProfileImageFileError("Use an image smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) throw new ProfileImageFileError("Use a JPEG, PNG or WebP image.");
  return { bytes, ext, contentType: TYPES[ext] };
}
