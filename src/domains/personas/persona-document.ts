import "server-only";
import {
  convertFileToMarkdown,
  type SupportedDocumentExtension,
} from "@/lib/ai/markitdown";

export const PERSONA_FILE_MAX_BYTES = 5 * 1024 * 1024;

export class PersonaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonaFileError";
  }
}

export type ValidatedPersonaFile = {
  bytes: Uint8Array;
  extension: SupportedDocumentExtension;
};

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

/**
 * Validates an uploaded Persona source file by size, extension, and content signature.
 * Supports PDF, DOCX, TXT, and Markdown.
 */
export async function validatePersonaFile(
  file: File,
): Promise<ValidatedPersonaFile> {
  if (file.size === 0) throw new PersonaFileError("The file is empty.");
  if (file.size > PERSONA_FILE_MAX_BYTES) {
    throw new PersonaFileError("Upload a file of 5 MB or less.");
  }

  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf") && startsWith(bytes, PDF_MAGIC)) {
    return { bytes, extension: ".pdf" };
  }

  if (name.endsWith(".docx") && startsWith(bytes, ZIP_MAGIC)) {
    return { bytes, extension: ".docx" };
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    if (bytes.includes(0x00)) {
      throw new PersonaFileError(
        "This text file appears to be binary. Upload a valid PDF, Word (.docx), or plain-text file.",
      );
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new PersonaFileError(
        "We could not decode this text file as UTF-8. Save it as UTF-8 text or upload a PDF.",
      );
    }
    return {
      bytes,
      extension: name.endsWith(".md") ? ".md" : ".txt",
    };
  }

  throw new PersonaFileError(
    "Upload a PDF, Word (.docx), or plain-text (.txt, .md) file.",
  );
}

/**
 * Validates the uploaded file and converts it to clean Markdown via MarkItDown.
 * Nothing is written to permanent storage or database tables.
 */
export async function readPersonaDocumentAsMarkdown(
  file: File,
  convert: typeof convertFileToMarkdown = convertFileToMarkdown,
): Promise<string> {
  const validated = await validatePersonaFile(file);
  return convert(validated.bytes, validated.extension);
}
