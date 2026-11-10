"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SharePanel({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let live = true;
    QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: 192,
      errorCorrectionLevel: "M",
    })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(
    () => setCanShare(typeof navigator !== "undefined" && "share" in navigator),
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border grid gap-6 rounded-lg border p-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-3">
        <p className="text-sm font-medium">Share your website</p>
        <p
          className="bg-muted rounded-md px-3 py-2 font-mono text-sm break-all"
          data-testid="public-url"
        >
          {url}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            <Copy className="size-4" /> {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                navigator
                  .share({ title: "My website", url })
                  .catch(() => undefined)
              }
            >
              <Share2 className="size-4" /> Share
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> Open
            </a>
          </Button>
        </div>
        <span className="sr-only" role="status">
          {copied ? "Link copied" : ""}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        {svg ? (
          <div
            role="img"
            aria-label={`QR code for ${url}`}
            data-testid="qr-code"
            className="size-48 overflow-hidden rounded-md border bg-white [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="bg-muted size-48 rounded-md" />
        )}
        {svg && (
          <a
            className="text-accent inline-flex items-center gap-1 text-xs underline underline-offset-4"
            href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            download="website-qr.svg"
          >
            <Download className="size-3.5" /> Download QR (SVG)
          </a>
        )}
      </div>
    </div>
  );
}
