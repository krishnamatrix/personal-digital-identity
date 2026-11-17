"use client";

import { useState } from "react";

/**
 * Media area of a featured item. YouTube links show the thumbnail with a play button and load
 * the (privacy-enhanced, youtube-nocookie) player only when the visitor clicks, so nothing from
 * YouTube loads or tracks visitors until then. Broken remote images fall back to a quiet panel.
 */
export function FeaturedMedia({
  title,
  platformLabel,
  thumbnailUrl,
  youtubeId,
  className = "",
}: {
  title: string;
  platformLabel: string;
  thumbnailUrl?: string;
  youtubeId?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  if (youtubeId && playing) {
    return (
      <div className={`relative aspect-video w-full bg-black ${className}`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  const image =
    thumbnailUrl && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    ) : (
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,currentColor_6%,transparent)] px-6 text-center text-lg font-medium tracking-tight opacity-70"
      >
        {platformLabel}
      </span>
    );

  if (youtubeId) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Play video: ${title}`}
        data-track-event="video_play"
        data-track-kind="featured"
        data-track-label={title}
        className={`group relative block aspect-video w-full overflow-hidden ${className}`}
      >
        {image}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-transform group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="ml-1 size-6"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`group relative aspect-video w-full overflow-hidden ${className}`}
    >
      {image}
    </div>
  );
}
