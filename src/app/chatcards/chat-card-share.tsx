"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Link + QR code for a ChatCard. The QR code encodes the link with ?src=qr, so visits that
 * arrive through it can be counted as "opened from the QR code" (a browser cannot prove a
 * physical scan). Downloads: SVG for print, a 1024 px PNG for everything else.
 */
export function ChatCardShare({ url, title }: { url: string; title: string }) {
  const qrUrl = `${url}?src=qr`;
  const [svg, setSvg] = useState("");
  const [png, setPng] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let live = true;
    const opts = { margin: 1, errorCorrectionLevel: "M" as const };
    QRCode.toString(qrUrl, { ...opts, type: "svg", width: 192 })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    QRCode.toDataURL(qrUrl, { ...opts, width: 1024 })
      .then((d) => live && setPng(d))
      .catch(() => live && setPng(""));
    return () => {
      live = false;
    };
  }, [qrUrl]);
  useEffect(
    () => setCanShare(typeof navigator !== "undefined" && "share" in navigator),
    [],
  );

  const file = (
    title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "chatcard"
  ).toLowerCase();

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
    <div
      className="border-border bg-card grid gap-6 rounded-[20px] border p-5 sm:grid-cols-[1fr_auto]"
      data-testid="chatcard-share"
    >
      <div className="min-w-0 space-y-3">
        <p className="text-sm font-medium">Share your ChatCard</p>
        <p
          className="bg-muted rounded-md px-3 py-2 font-mono text-sm break-all"
          data-testid="chatcard-url"
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
                navigator.share({ title, url }).catch(() => undefined)
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
        <p className="text-muted-foreground text-xs leading-5">
          The link and QR code only open the card. For verified access, people
          also need one of your activation codes.
        </p>
        <span className="sr-only" role="status">
          {copied ? "Link copied" : ""}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        {svg ? (
          <div
            role="img"
            aria-label={`QR code for ${url}`}
            data-testid="chatcard-qr"
            className="size-48 overflow-hidden rounded-md border bg-white [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="bg-muted size-48 rounded-md" />
        )}
        <div className="flex gap-3">
          {svg && (
            <a
              className="text-accent inline-flex items-center gap-1 text-xs underline underline-offset-4"
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              download={`${file}-qr.svg`}
            >
              <Download className="size-3.5" /> SVG
            </a>
          )}
          {png && (
            <a
              className="text-accent inline-flex items-center gap-1 text-xs underline underline-offset-4"
              href={png}
              download={`${file}-qr.png`}
            >
              <Download className="size-3.5" /> PNG
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
