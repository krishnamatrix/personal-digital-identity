"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Captions, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  formatDuration,
  toWebVtt,
  transcriptOf,
  type CaptionCue,
  type PublishedIntro,
} from "@/domains/intro/intro-video";
import { trackInsight } from "@/components/insights/page-tracker";
import { CutoutPlayer } from "@/components/website/cutout-player";
import { useSeekableDuration } from "@/components/website/use-seekable-duration";

export { useSeekableDuration };

/** The "▶ Watch intro · 0:47" badge on a large portrait. */
export function IntroPill({ length }: { length: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-[6%] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 py-1.5 pr-3 pl-2 text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-sm transition group-hover/intro:bg-black/85"
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-white text-black">
        <Play className="size-2.5 translate-x-px fill-current" />
      </span>
      Watch intro · {length}
    </span>
  );
}

/**
 * The talking photo: wraps the hero portrait in a button with a small "play" badge. Tapping it
 * opens the owner's recorded intro in a dialog with sound, captions and a transcript. Nothing
 * about the video downloads until then (no preload), so the page stays fast.
 */
export function IntroTrigger({
  intro,
  name,
  className = "",
  badge = "pill",
  children,
}: {
  intro: PublishedIntro;
  name: string;
  /** Size / shape / visibility of the portrait (the trigger takes the portrait's place). */
  className?: string;
  /** "pill" for large portraits, "dot" for small avatars. */
  badge?: "pill" | "dot";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const length = formatDuration(intro.duration);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={`group/intro relative isolate shrink-0 cursor-pointer p-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current ${className}`}
        aria-label={`Play ${name}'s video intro (${length})`}
        data-track-event="video_play"
        data-track-kind="intro"
        data-track-label="Video intro"
      >
        {children}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-white/0 transition group-hover/intro:ring-white/60 motion-safe:group-hover/intro:scale-[1.02]"
        />
        {badge === "pill" ? (
          <IntroPill length={length} />
        ) : (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 z-10 flex size-8 items-center justify-center rounded-full bg-black text-white shadow-md ring-2 ring-white"
          >
            <Play className="size-3.5 translate-x-px fill-current" />
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-[min(94vw,56rem)] -translate-x-1/2 -translate-y-1/2 outline-none"
          aria-describedby={undefined}
        >
          <div className="mb-3 flex items-center justify-between gap-4 text-white">
            <Dialog.Title className="truncate text-sm font-medium">
              Meet {name}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close video"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {open && (
            <div className="text-white">
              <IntroPlayer intro={intro} name={name} autoPlay />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function IntroPlayer({
  intro,
  name,
  autoPlay = false,
  track = true,
  videoRef,
}: {
  intro: PublishedIntro;
  name: string;
  autoPlay?: boolean;
  /** Record a 'video_complete' insight when it plays to the end. */
  track?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  if (intro.background === "cutout")
    return (
      <div>
        <CutoutPlayer
          intro={intro}
          name={name}
          layout="framed"
          autoPlay={autoPlay}
          track={track}
          videoRef={videoRef}
        />
        <Transcript cues={intro.captions ?? []} />
      </div>
    );
  return (
    <PlainPlayer
      intro={intro}
      name={name}
      autoPlay={autoPlay}
      track={track}
      videoRef={videoRef}
    />
  );
}

function PlainPlayer({
  intro,
  name,
  autoPlay,
  track,
  videoRef,
}: {
  intro: PublishedIntro;
  name: string;
  autoPlay: boolean;
  track: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const ownVideo = useRef<HTMLVideoElement>(null);
  const video = videoRef ?? ownVideo;
  const cues = useMemo(() => intro.captions ?? [], [intro.captions]);
  // A blob: URL for the <track>; made in the browser only (never during server rendering).
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!cues.length || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(
      new Blob([toWebVtt(cues)], { type: "text/vtt" }),
    );
    setCaptionsUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setCaptionsUrl(null);
    };
  }, [cues]);
  useSeekableDuration(video, () => {
    if (autoPlay) void video.current?.play().catch(() => undefined);
  });

  const completed = useRef(false);
  return (
    <div>
      <div className="overflow-hidden rounded-2xl bg-black shadow-2xl">
        <video
          ref={video}
          className="aspect-video max-h-[72vh] w-full bg-black object-contain"
          controls
          playsInline
          preload="metadata"
          poster={intro.posterUrl}
          aria-label={`${name}'s video intro`}
          onEnded={() => {
            if (track && !completed.current) {
              completed.current = true;
              trackInsight({
                event: "video_complete",
                kind: "intro",
                label: "Video intro",
              });
            }
          }}
        >
          <source src={intro.videoUrl} type={intro.type} />
          {captionsUrl && (
            <track
              kind="captions"
              src={captionsUrl}
              srcLang="en"
              label="Captions"
              default
            />
          )}
        </video>
      </div>
      <Transcript cues={cues} />
    </div>
  );
}

function Transcript({ cues }: { cues: CaptionCue[] }) {
  const [showTranscript, setShowTranscript] = useState(false);
  if (!cues.length) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShowTranscript((v) => !v)}
        aria-expanded={showTranscript}
        className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-3.5 py-1.5 text-xs font-medium transition hover:bg-[color-mix(in_srgb,currentColor_18%,transparent)] focus-visible:outline-2 focus-visible:outline-current"
      >
        <Captions aria-hidden className="size-3.5" />
        {showTranscript ? "Hide transcript" : "Read transcript"}
      </button>
      {showTranscript && (
        <p className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-[color-mix(in_srgb,currentColor_6%,transparent)] p-4 text-sm leading-6">
          {transcriptOf(cues)}
        </p>
      )}
    </div>
  );
}
