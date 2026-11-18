"use client";

import { useState } from "react";
import type { SectionOf } from "@/domains/website/published-content";
import type { Tone } from "@/components/website/sections";

/**
 * "Book a time": a card with the owner's text and a button. For Calendly, Cal.com and Google
 * Calendar the scheduler opens right here, but only after the visitor clicks, so the provider's
 * scripts and cookies never load for people who only read the page. Other booking pages open
 * in a new tab. An "open in a new tab" link always remains as a fallback.
 */
/** Works on every theme: the text colour drives a soft fill, a border and the hover state. */
const pill =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-6 text-sm font-medium bg-[color-mix(in_srgb,currentColor_7%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)]";

export function BookingBlock({
  section,
  tone,
}: {
  section: SectionOf<"booking">;
  tone: Tone;
}) {
  const [open, setOpen] = useState(false);
  const embed = section.embedUrl;

  return (
    <div className={`${tone.card} space-y-4`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className={`${tone.strong} text-lg`}>{section.title}</p>
          {section.description && (
            <p className={`text-sm leading-6 ${tone.muted}`}>
              {section.description}
            </p>
          )}
        </div>
        {!open &&
          (embed ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-track-event="booking_open"
              data-track-label={section.title}
              className={`${pill} ${tone.rule}`}
            >
              Pick a time
            </button>
          ) : (
            <a
              href={section.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              data-track-kind="booking"
              data-track-label={section.title}
              className={`${pill} ${tone.rule}`}
            >
              Book a time ↗
            </a>
          ))}
      </div>
      {open && embed && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
            <iframe
              src={embed}
              title={`${section.title} (${section.providerLabel})`}
              className="h-[42rem] w-full"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <p className={`text-xs ${tone.muted}`}>
            Scheduling by {section.providerLabel}.{" "}
            <a
              href={section.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={tone.link}
            >
              Open in a new tab
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
