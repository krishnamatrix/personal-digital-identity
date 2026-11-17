"use client";

import { useId, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  importResumeAction,
  type ResumeImportActionResult,
} from "@/app/onboarding/actions";
import {
  ENTRY_KIND_DEFS,
  type EntryKind,
} from "@/domains/identity/entry-kinds";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 5 * 1024 * 1024;

type Summary = Extract<ResumeImportActionResult, { ok: true }>["summary"];

function describe(summary: Summary): string[] {
  const lines: string[] = [];
  const fields = summary.profileFields.length;
  if (fields > 0) {
    lines.push(`${fields} profile detail${fields === 1 ? "" : "s"}`);
  }
  for (const [kind, count] of Object.entries(summary.added) as [
    EntryKind,
    number,
  ][]) {
    lines.push(`${count} × ${ENTRY_KIND_DEFS[kind].label.toLowerCase()}`);
  }
  return lines;
}

/**
 * Optional first step: upload a resume and let Folioone fill the profile from it.
 * The file goes to a server action; the server checks it again (type, size, content).
 */
export function ResumeImport({
  onImported,
}: {
  onImported: (values: Record<string, string>) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: File | undefined) {
    setError(null);
    setSummary(null);
    if (!next) return;
    const name = next.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      setError("Upload your resume as a PDF or Word (.docx) file.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("Upload a file of 5 MB or less.");
      return;
    }
    setFile(next);
  }

  function upload() {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("resume", file);
    startTransition(async () => {
      const result = await importResumeAction(form);
      if (result.ok) {
        setSummary(result.summary);
        onImported(result.values);
      } else {
        setError(result.message);
      }
    });
  }

  if (summary) {
    const lines = describe(summary);
    return (
      <section
        aria-live="polite"
        className="border-success/25 bg-success-soft/60 rounded-2xl border p-5"
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="text-success size-4" aria-hidden="true" />
          {lines.length > 0
            ? "Your resume has been added to your profile"
            : "Nothing new to add — your profile already has these details"}
        </p>
        {lines.length > 0 && (
          <ul className="text-muted-foreground mt-3 space-y-1 pl-6 text-sm">
            {lines.map((line) => (
              <li key={line} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground mt-3 text-xs leading-5">
          Continue to review the details. Everything stays private, and you can
          edit or remove any of it later in your profile.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="space-y-3">
      <div>
        <h2 id={`${inputId}-title`} className="text-[15px] font-medium">
          Start from your resume
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Upload a PDF or Word file and we will fill in your profile,
          experience, education and skills. Optional — you can also fill things
          in by hand.
        </p>
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${dragging ? "border-foreground/40 bg-muted" : "border-border bg-background hover:bg-muted/60"}`}
      >
        <span className="bg-card flex size-10 items-center justify-center rounded-full ring-1 ring-black/5">
          {file ? (
            <FileText className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </span>
        <span className="text-sm font-medium">
          {file ? file.name : "Choose a file or drop it here"}
        </span>
        <span className="text-muted-foreground text-xs">
          PDF or DOCX, up to 5 MB
        </span>
        <input
          ref={inputRef}
          id={inputId}
          name="resume"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={pending}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          pending={pending}
          type="button"
          onClick={upload}
          disabled={!file || pending}
        >
          {pending ? "Reading your resume…" : "Import resume"}
        </Button>
        {pending && (
          <span className="text-muted-foreground text-xs" aria-live="polite">
            This can take up to a minute.
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        Your file is read once to fill in your profile and is not stored. Its
        contents are processed by Google’s Gemini API.
      </p>
    </section>
  );
}
