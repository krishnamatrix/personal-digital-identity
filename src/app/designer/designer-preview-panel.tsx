"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ViewportMode = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<ViewportMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export function DesignerPreviewPanel({
  title,
  html,
  identityFieldsUsed,
  siteSlug,
  stale = false,
  publishing = false,
  publishedSlug = null,
  publishError = null,
  needsAddress = false,
  onPublish,
}: {
  title: string;
  html: string;
  identityFieldsUsed: string[];
  siteSlug?: string | null;
  stale?: boolean;
  publishing?: boolean;
  publishedSlug?: string | null;
  publishError?: string | null;
  needsAddress?: boolean;
  onPublish?: () => void;
}) {
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingPublish, setConfirmingPublish] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  function onDownload() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "folio-design"}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts.
    }
  }

  return (
    <div
      className={
        fullscreen
          ? "bg-background fixed inset-0 z-50 flex flex-col"
          : "border-border bg-card overflow-hidden rounded-2xl border shadow-sm"
      }
    >
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{title}</p>
          {identityFieldsUsed.length > 0 ? (
            <p className="text-muted-foreground truncate text-xs">
              Personalized with: {identityFieldsUsed.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Preview viewport size"
            className="border-border bg-muted/40 inline-flex rounded-full border p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              aria-pressed={viewport === "desktop"}
              aria-label="Desktop view"
              className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                viewport === "desktop"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport("tablet")}
              aria-pressed={viewport === "tablet"}
              aria-label="Tablet view"
              className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                viewport === "tablet"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tablet className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Tablet</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              aria-pressed={viewport === "mobile"}
              aria-label="Mobile view"
              className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                viewport === "mobile"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Mobile</span>
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onCopy()}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy HTML"}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDownload}
          >
            <Download className="size-3.5" aria-hidden />
            Download
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? (
              <Minimize2 className="size-3.5" aria-hidden />
            ) : (
              <Maximize2 className="size-3.5" aria-hidden />
            )}
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>

          {onPublish ? (
            <Button
              type="button"
              size="sm"
              disabled={stale || publishing}
              onClick={() => setConfirmingPublish(true)}
            >
              {publishing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Globe className="size-3.5" aria-hidden />
              )}
              {publishing
                ? "Publishing…"
                : siteSlug
                  ? `Publish to /${siteSlug}`
                  : "Publish"}
            </Button>
          ) : null}
        </div>
      </div>

      {confirmingPublish && onPublish ? (
        <div className="border-border bg-muted/50 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm">
          <p className="text-foreground">
            {siteSlug ? (
              <>
                Publish this design live at <strong>/{siteSlug}</strong>? It
                will replace your current public page until you republish or
                unpublish from My Website.
              </>
            ) : (
              <>
                Choose your website address on My Website first, then come back
                to publish.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {siteSlug ? (
              <Button
                type="button"
                size="sm"
                disabled={publishing}
                onClick={() => {
                  setConfirmingPublish(false);
                  onPublish();
                }}
              >
                Confirm publish
              </Button>
            ) : (
              <Link
                href="/website"
                className="text-accent text-sm font-medium underline-offset-4 hover:underline"
              >
                Open My Website
              </Link>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingPublish(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {publishedSlug ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-950">
          <p>
            Published live at <strong>/{publishedSlug}</strong>.
          </p>
          <a
            href={`/${publishedSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            View live site
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      ) : null}

      {publishError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm"
        >
          <p>{publishError}</p>
          {needsAddress ? (
            <Link
              href="/website"
              className="font-medium underline underline-offset-4"
            >
              Set address on My Website
            </Link>
          ) : null}
        </div>
      ) : null}

      <div
        className={`bg-neutral-950/90 flex justify-center overflow-auto ${
          fullscreen ? "flex-1" : "h-[78vh] min-h-[560px]"
        }`}
      >
        <iframe
          title={`Live preview: ${title}`}
          srcDoc={html}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          className="h-full border-0 bg-white transition-[width] duration-200"
          style={{ width: VIEWPORT_WIDTH[viewport] }}
        />
      </div>
    </div>
  );
}
