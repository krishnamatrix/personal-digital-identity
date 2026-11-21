import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);

export const MARKITDOWN_MAX_CHARS = 100_000;
export const MARKITDOWN_TIMEOUT_MS = 30_000;
export const MARKITDOWN_MAX_BUFFER = 2 * 1024 * 1024;

export type SupportedDocumentExtension = ".pdf" | ".docx" | ".txt" | ".md";

export class MarkItDownUnavailableError extends Error {
  constructor() {
    super(
      "PDF conversion requires markitdown, which is not installed in this environment. Install it (`uv tool install 'markitdown[all]'`), set MARKITDOWN_BIN, or upload a .docx, .txt, or .md file.",
    );
    this.name = "MarkItDownUnavailableError";
  }
}

export class MarkItDownConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkItDownConversionError";
  }
}

export type MarkItDownRunner = (
  bin: string,
  filePath: string,
) => Promise<{ stdout: string }>;

export function getMarkItDownBin(): string {
  const configured = process.env.MARKITDOWN_BIN?.trim();
  if (configured) return configured;
  const home = os.homedir();
  for (const candidate of [
    path.join(home, ".local", "bin", "markitdown"),
    "/opt/homebrew/bin/markitdown",
    "/usr/local/bin/markitdown",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "markitdown";
}

const defaultRunner: MarkItDownRunner = async (bin, filePath) => {
  const { stdout } = await execFileAsync(bin, [filePath], {
    timeout: MARKITDOWN_TIMEOUT_MS,
    maxBuffer: MARKITDOWN_MAX_BUFFER,
    encoding: "utf8",
  });
  return { stdout };
};

function normalizeMarkdownOutput(raw: string): string {
  const markdown = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!markdown) {
    throw new MarkItDownConversionError(
      "No readable text was found in this document. Image-only or empty files cannot be extracted.",
    );
  }
  if (markdown.length > MARKITDOWN_MAX_CHARS) {
    throw new MarkItDownConversionError(
      "This document is too long to process. Upload a shorter summary, bio, or resume.",
    );
  }
  return markdown;
}

async function convertFallback(
  bytes: Uint8Array,
  extension: SupportedDocumentExtension,
): Promise<string> {
  if (extension === ".txt" || extension === ".md") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return normalizeMarkdownOutput(text);
  }
  if (extension === ".docx") {
    let text: string;
    try {
      ({ value: text } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      }));
    } catch {
      throw new MarkItDownConversionError(
        "We could not read this Word document. Try saving it again or uploading a .txt or .md file.",
      );
    }
    return normalizeMarkdownOutput(text);
  }
  throw new MarkItDownUnavailableError();
}

/**
 * Converts validated document bytes to normalized UTF-8 Markdown using the local
 * MarkItDown CLI. Writes to an isolated ephemeral temp directory and removes it
 * unconditionally in `finally`. Never uses a shell (`execFile` only).
 *
 * If the `markitdown` CLI is not installed (`ENOENT`), falls back cleanly for
 * `.docx` (via `mammoth`) and `.txt`/`.md` (UTF-8), while requiring `markitdown`
 * for `.pdf` files.
 */
export async function convertFileToMarkdown(
  bytes: Uint8Array,
  extension: SupportedDocumentExtension,
  runner: MarkItDownRunner = defaultRunner,
): Promise<string> {
  const bin = getMarkItDownBin();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "folioone-md-"));
  const filePath = path.join(tempDir, `upload${extension}`);

  try {
    await writeFile(filePath, bytes);
    let stdout: string;
    try {
      ({ stdout } = await runner(bin, filePath));
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { killed?: boolean };
      if (err?.code === "ENOENT") {
        return await convertFallback(bytes, extension);
      }
      if (err?.killed) {
        throw new MarkItDownConversionError(
          "Document conversion timed out. Try a smaller or simpler file.",
        );
      }
      throw new MarkItDownConversionError(
        "We could not convert this document to Markdown. Try saving it again or uploading a different file.",
      );
    }

    return normalizeMarkdownOutput(stdout);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
