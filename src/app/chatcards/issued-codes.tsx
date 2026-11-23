"use client";

import { useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IssuedBatch } from "@/domains/chatcards/chat-card-service";

/** CSV for a print shop / mail merge: one code per row. Pure. */
export function codesCsv(batch: IssuedBatch, cardTitle: string, url: string) {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const rows = [["code", "batch", "card", "link"]];
  for (const code of batch.codes)
    rows.push([code, batch.label, cardTitle, url]);
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Freshly generated codes. They exist only in this page's memory: Folioone stores hashes,
 * so once this page is left they cannot be shown again.
 */
export function IssuedCodes({
  batch,
  cardTitle,
  url,
  onDismiss,
}: {
  batch: IssuedBatch;
  cardTitle: string;
  url: string;
  onDismiss?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const file = `${(batch.label.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "codes").toLowerCase()}-activation-codes`;
  return (
    <section
      className="border-border bg-card space-y-4 rounded-[20px] border p-5 sm:p-6"
      data-testid="issued-codes"
    >
      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="text-sm leading-6">
          <p className="font-semibold">
            Download these {batch.codes.length} codes now
          </p>
          <p>
            For your security Folioone keeps only a fingerprint of each code.
            Once you leave this page the codes cannot be shown again. Store the
            file somewhere private and send it only to your printer.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            download(
              `${file}.csv`,
              codesCsv(batch, cardTitle, url),
              "text/csv;charset=utf-8",
            );
            setSaved(true);
          }}
        >
          <Download aria-hidden className="size-4" /> Download CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            download(
              `${file}.txt`,
              batch.codes.join("\r\n") + "\r\n",
              "text/plain;charset=utf-8",
            );
            setSaved(true);
          }}
        >
          <Download aria-hidden className="size-4" /> Download TXT
        </Button>
        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            disabled={!saved}
          >
            I have saved them
          </Button>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Show codes ({batch.label})
        </summary>
        <ol
          className="bg-muted/50 mt-3 grid max-h-72 gap-x-6 gap-y-1 overflow-auto rounded-xl p-4 font-mono text-sm sm:grid-cols-2"
          data-testid="issued-code-list"
        >
          {batch.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
