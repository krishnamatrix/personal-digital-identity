"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { QrCode, X } from "lucide-react";

/**
 * Wraps a card with a small QR button. The QR is hidden by default and generated on the fly
 * (in the browser) only when the button is pressed, then shown as an overlay on the card.
 * `value` is a vCard, so a phone camera offers to save the contact directly.
 */
export function CardWithQr({
  value,
  children,
  label = "Show QR code",
  radius = 0,
}: {
  value: string;
  children: ReactNode;
  label?: string;
  /** The card's corner radius as a fraction of its width, so the overlay matches it. */
  radius?: number;
}) {
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      // "L" keeps the code coarse: a full vCard is long, and phones scan a screen cleanly.
      errorCorrectionLevel: "L",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, value]);

  function close() {
    setOpen(false);
    openRef.current?.focus();
  }

  return (
    <div className="@container relative">
      {children}
      <button
        ref={openRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="absolute top-[3%] right-[2%] flex size-8 items-center justify-center rounded-full bg-white/85 text-[#111] shadow-sm ring-1 ring-black/10 backdrop-blur transition hover:bg-white focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
      >
        <QrCode aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="QR code"
          className="absolute inset-0 z-10 flex items-center justify-center gap-[5%] overflow-hidden bg-white/95 p-[4%] text-[#111] backdrop-blur-sm"
          style={{ borderRadius: `${radius * 100}cqw` }}
        >
          {svg ? (
            <div
              role="img"
              aria-label="QR code with this contact card"
              data-testid="card-qr"
              className="aspect-square h-full max-h-full [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="aspect-square h-full animate-pulse rounded-md bg-black/5" />
          )}
          <p className="hidden max-w-[34%] text-sm leading-snug text-black/70 sm:block">
            Point a phone camera here to save this contact.
          </p>
          <button
            ref={closeRef}
            type="button"
            aria-label="Hide QR code"
            onClick={close}
            className="absolute top-[3%] right-[2%] flex size-8 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
