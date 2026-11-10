import "server-only";
import mammoth from "mammoth";

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
/** Far above any real resume; a document this long is rejected, never silently cut. */
const MAX_TEXT_CHARS = 100_000;

/** A problem with the uploaded file. The message is safe to show to the person. */
export class ResumeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeFileError";
  }
}

export type ResumeDocument =
  | { kind: "pdf"; base64: string }
  | { kind: "docx"; text: string };

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" (DOCX is a zip)

/**
 * Checks the upload by size, name AND content signature (the browser-supplied MIME type is
 * not trusted), then prepares it for Claude: a PDF is passed through as a document, a DOCX
 * is reduced to plain text. Nothing is written to disk or storage.
 */
export async function readResumeFile(file: File): Promise<ResumeDocument> {
  if (file.size === 0) throw new ResumeFileError("The file is empty.");
  if (file.size > RESUME_MAX_BYTES) {
    throw new ResumeFileError("Upload a file of 5 MB or less.");
  }
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf") && startsWith(bytes, PDF_MAGIC)) {
    return { kind: "pdf", base64: Buffer.from(bytes).toString("base64") };
  }
  if (name.endsWith(".docx") && startsWith(bytes, ZIP_MAGIC)) {
    let text: string;
    try {
      ({ value: text } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      }));
    } catch {
      throw new ResumeFileError(
        "We could not read this Word document. Try saving it again, or upload a PDF.",
      );
    }
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) {
      throw new ResumeFileError("This document does not contain any text.");
    }
    if (text.length > MAX_TEXT_CHARS) {
      throw new ResumeFileError(
        "This document is too long to be a resume. Upload your resume or CV only.",
      );
    }
    return { kind: "docx", text };
  }
  throw new ResumeFileError(
    "Upload your resume as a PDF or Word (.docx) file.",
  );
}
