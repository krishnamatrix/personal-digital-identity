// @vitest-environment node
import { access } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  convertFileToMarkdown,
  MARKITDOWN_MAX_CHARS,
  MarkItDownConversionError,
  MarkItDownUnavailableError,
} from "@/lib/ai/markitdown";

describe("convertFileToMarkdown", () => {
  const originalBin = process.env.MARKITDOWN_BIN;

  afterEach(() => {
    if (originalBin === undefined) delete process.env.MARKITDOWN_BIN;
    else process.env.MARKITDOWN_BIN = originalBin;
  });

  it("writes an ephemeral temp file, runs markitdown, normalizes Markdown, and cleans up", async () => {
    process.env.MARKITDOWN_BIN = "/custom/markitdown";
    let observedBin = "";
    let observedFile = "";

    const md = await convertFileToMarkdown(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      ".pdf",
      async (bin, filePath) => {
        observedBin = bin;
        observedFile = filePath;
        await access(filePath);
        return { stdout: "# Ada Lovelace\r\n\r\n\r\nKeynote speaker.\n" };
      },
    );

    expect(observedBin).toBe("/custom/markitdown");
    expect(observedFile.endsWith("upload.pdf")).toBe(true);
    expect(md).toBe("# Ada Lovelace\n\nKeynote speaker.");
    // Ephemeral temp directory must be removed after conversion.
    await expect(access(path.dirname(observedFile))).rejects.toThrow();
  });

  it("maps ENOENT to MarkItDownUnavailableError for PDFs and falls back cleanly for .txt/.md", async () => {
    let pdfTempDir = "";
    await expect(
      convertFileToMarkdown(
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        ".pdf",
        async (_, fp) => {
          pdfTempDir = path.dirname(fp);
          const err = new Error(
            "spawn markitdown ENOENT",
          ) as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        },
      ),
    ).rejects.toThrow(MarkItDownUnavailableError);
    await expect(access(pdfTempDir)).rejects.toThrow();

    let txtTempDir = "";
    const fallbackMd = await convertFileToMarkdown(
      new TextEncoder().encode("# Speaker Bio\r\n\r\n\r\nHello world."),
      ".md",
      async (_, fp) => {
        txtTempDir = path.dirname(fp);
        const err = new Error(
          "spawn markitdown ENOENT",
        ) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
    );
    expect(fallbackMd).toBe("# Speaker Bio\n\nHello world.");
    await expect(access(txtTempDir)).rejects.toThrow();
  });

  it("rejects timeouts, empty Markdown, and excessively long Markdown", async () => {
    await expect(
      convertFileToMarkdown(new Uint8Array([0x41]), ".txt", async () => {
        const err = new Error("timed out") as NodeJS.ErrnoException & {
          killed?: boolean;
        };
        err.killed = true;
        throw err;
      }),
    ).rejects.toThrow(/timed out/i);

    await expect(
      convertFileToMarkdown(new Uint8Array([0x41]), ".txt", async () => ({
        stdout: "   \n\n  ",
      })),
    ).rejects.toThrow(MarkItDownConversionError);

    await expect(
      convertFileToMarkdown(new Uint8Array([0x41]), ".txt", async () => ({
        stdout: "A".repeat(MARKITDOWN_MAX_CHARS + 1),
      })),
    ).rejects.toThrow(/too long/i);
  });
});
