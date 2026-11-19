"use client";

import {
  Captions,
  CaptionsOff,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  formatDuration,
  playLength,
  type CaptionCue,
  type IntroTrim,
  type PublishedIntro,
} from "@/domains/intro/intro-video";
import { trackInsight } from "@/components/insights/page-tracker";
import { useSeekableDuration } from "@/components/website/use-seekable-duration";
import {
  createStackedRenderer,
  stackedAspect,
  type StackedFit,
  type StackedRenderer,
  type StackedSource,
} from "@/components/website/stacked-gl";

/**
 * The intro player, for every intro: custom controls, captions drawn over the picture, and
 * the owner's trim honoured (only the chosen part plays; the seek bar covers just that).
 *
 * A cut-out intro (a stacked video: picture + mask) is drawn through WebGL so only the
 * person shows, over whatever is behind the player. Two layouts:
 *  - "inline": takes the hero portrait's place; the person appears in the page itself and
 *              talks right there when tapped (nothing downloads before that).
 *  - "framed": a player with controls (the dialog, the studio).
 * Without WebGL (or if the browser refuses the frames) it shows the original picture instead.
 */

type Layout = "inline" | "framed";

export function cueAt(cues: CaptionCue[], t: number): CaptionCue | null {
  for (const cue of cues) if (t >= cue.start && t < cue.end) return cue;
  return null;
}

function useStackedCanvas(
  canvas: RefObject<HTMLCanvasElement | null>,
  video: RefObject<HTMLVideoElement | null>,
  posterUrl: string | undefined,
  fit: StackedFit,
  /** Plain videos show the <video> itself: none of this runs. */
  enabled: boolean,
) {
  const renderer = useRef<StackedRenderer | null>(null);
  const last = useRef<StackedSource | null>(null);
  const showingVideo = useRef(false);
  const [fallback, setFallback] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const paint = useCallback((source: StackedSource | null) => {
    if (!source || !renderer.current) return;
    try {
      if (renderer.current.draw(source, fitRef.current)) {
        last.current = source;
        setAspect((a) => a ?? stackedAspect(source));
      }
    } catch {
      // A cross-origin source without CORS taints WebGL: show the plain picture instead.
      setFallback(true);
    }
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !enabled) return;
    const r = createStackedRenderer(el);
    if (!r) {
      setFallback(true);
      return;
    }
    renderer.current = r;
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => paint(last.current))
        : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      r.dispose();
      renderer.current = null;
    };
  }, [canvas, paint, enabled]);

  // The cover image, until the video has frames to show.
  useEffect(() => {
    if (!posterUrl || fallback || !enabled) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (!showingVideo.current) paint(img);
      setPosterReady(true);
    };
    img.src = posterUrl;
    return () => {
      img.onload = null;
    };
  }, [posterUrl, fallback, paint, enabled]);

  // Video frames: every new frame while playing, and once after seeking / pausing.
  useEffect(() => {
    const v = video.current;
    if (!v || fallback || !enabled) return;
    let raf = 0;
    let vfc = 0;
    const hasVfc = "requestVideoFrameCallback" in v;
    const frame = () => {
      if (v.readyState >= 2) {
        showingVideo.current = true;
        paint(v);
      }
    };
    const loop = () => {
      frame();
      if (v.paused || v.ended) return;
      if (hasVfc) vfc = v.requestVideoFrameCallback(loop);
      else raf = requestAnimationFrame(loop);
    };
    const onPlay = () => loop();
    v.addEventListener("playing", onPlay);
    v.addEventListener("seeked", frame);
    v.addEventListener("loadeddata", frame);
    return () => {
      v.removeEventListener("playing", onPlay);
      v.removeEventListener("seeked", frame);
      v.removeEventListener("loadeddata", frame);
      cancelAnimationFrame(raf);
      if (hasVfc && vfc) v.cancelVideoFrameCallback(vfc);
    };
  }, [video, fallback, paint, enabled]);

  const showPoster = useCallback(() => {
    showingVideo.current = false;
    setPosterReady((ready) => {
      if (ready && posterUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => paint(img);
        img.src = posterUrl;
      }
      return ready;
    });
  }, [paint, posterUrl]);

  return { fallback, posterReady, aspect, showPoster };
}

/**
 * Video time and state for custom controls, within the trimmed part: `time` and `length`
 * are relative to the trim start, and playback stops at the trim end (checked every frame,
 * so it does not overshoot by a quarter second as `timeupdate` would).
 */
function usePlayback(
  video: RefObject<HTMLVideoElement | null>,
  knownDuration: number,
  trim: IntroTrim | undefined,
  onFinish: () => void,
) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fileDuration, setFileDuration] = useState(knownDuration);
  const [muted, setMuted] = useState(false);
  const start = trim?.start ?? 0;
  const end = trim?.end ?? null;
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const atEnd = () => end !== null && v.currentTime >= end - 0.02;
    const sync = () => {
      setTime(v.currentTime);
      setPlaying(!v.paused && !v.ended);
      setMuted(v.muted);
      if (Number.isFinite(v.duration) && v.duration > 0)
        setFileDuration(v.duration);
    };
    const watch = () => {
      if (v.paused) return;
      if (atEnd()) {
        v.pause();
        finish.current();
        return;
      }
      raf = requestAnimationFrame(watch);
    };
    const onPlaying = () => {
      cancelAnimationFrame(raf);
      if (end !== null) raf = requestAnimationFrame(watch);
    };
    const onEnded = () => finish.current();
    const events = [
      "timeupdate",
      "play",
      "pause",
      "ended",
      "durationchange",
      "volumechange",
      "seeked",
    ];
    events.forEach((e) => v.addEventListener(e, sync));
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    return () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => v.removeEventListener(e, sync));
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
    };
  }, [video, end]);

  const length = Math.max(0, (end ?? fileDuration) - start);
  return {
    time: Math.min(length, Math.max(0, time - start)),
    /** The file time, for captions (which keep the file's timeline). */
    fileTime: time,
    playing,
    length,
    muted,
    start,
    end,
  };
}

export function IntroVideoPlayer({
  intro,
  name,
  layout,
  autoPlay = false,
  track = true,
  className = "",
  idle,
  videoRef,
  children,
}: {
  intro: PublishedIntro;
  name: string;
  layout: Layout;
  autoPlay?: boolean;
  /** Record a 'video_complete' insight when it plays to the end. */
  track?: boolean;
  className?: string;
  /** Inline only: shown over the portrait before it starts (the "Watch intro" badge). */
  idle?: ReactNode;
  /** Access to the underlying <video> (the studio's "use current frame as cover"). */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Inline only: the photo, shown until the cut-out cover has loaded. */
  children?: ReactNode;
}) {
  const stacked = intro.background === "cutout";
  const canvas = useRef<HTMLCanvasElement>(null);
  const ownVideo = useRef<HTMLVideoElement>(null);
  const video = videoRef ?? ownVideo;
  const inline = layout === "inline";
  const fit: StackedFit = useMemo(
    () =>
      inline
        ? { fit: "cover", anchorY: 0.12, fadeBottom: 0.18 }
        : { fit: "contain" },
    [inline],
  );
  const { fallback, posterReady, aspect, showPoster } = useStackedCanvas(
    canvas,
    video,
    intro.posterUrl,
    fit,
    stacked,
  );
  const completed = useRef(false);
  const finished = () => {
    if (track && !completed.current) {
      completed.current = true;
      trackInsight({
        event: "video_complete",
        kind: "intro",
        label: "Video intro",
      });
    }
    if (inline) stop();
  };
  const playback = usePlayback(video, intro.duration, intro.trim, () =>
    finished(),
  );
  const { time, fileTime, playing, length, muted } = playback;
  const [plainAspect, setPlainAspect] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const cues = intro.captions ?? [];
  const cue = captionsOn ? cueAt(cues, fileTime) : null;

  /** From the trim start whenever playback is outside the trimmed part. */
  const rewindIntoRange = (v: HTMLVideoElement) => {
    const { start, end } = playback;
    if (
      v.currentTime < start - 0.05 ||
      (end !== null && v.currentTime >= end - 0.05) ||
      v.ended
    )
      v.currentTime = start;
  };

  const start = () => {
    const v = video.current;
    if (!v) return;
    setStarted(true);
    rewindIntoRange(v);
    // play() inside the tap, so phones allow sound.
    void v.play().catch(() => undefined);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!started) return start();
    if (v.paused || v.ended) {
      rewindIntoRange(v);
      void v.play().catch(() => undefined);
    } else v.pause();
  };
  const stop = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = playback.start;
    setStarted(false);
    showPoster();
  };

  // Framed: fix the seek bar of browser recordings first (see useSeekableDuration). Inline
  // shows no seek bar and must start inside the tap, so it skips this.
  const noVideo = useRef<HTMLVideoElement>(null);
  useSeekableDuration(inline ? noVideo : video, () => {
    if (video.current && playback.start > 0)
      video.current.currentTime = playback.start;
    if (autoPlay) start();
  });

  const pictureAspect = (stacked ? aspect : plainAspect) ?? 16 / 9;
  const label = `${name}'s video intro`;

  const videoElement = (
    <video
      ref={video}
      src={intro.videoUrl}
      crossOrigin="anonymous"
      playsInline
      preload={inline ? "none" : "metadata"}
      aria-label={label}
      poster={stacked ? undefined : intro.posterUrl}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth && v.videoHeight)
          setPlainAspect(v.videoWidth / v.videoHeight);
      }}
      // The canvas shows the picture; without WebGL the video itself is shown, cropped to
      // its top (picture) half.
      className={
        !stacked
          ? "absolute inset-0 size-full bg-black object-contain"
          : fallback
            ? "absolute inset-x-0 top-0 h-[200%] w-full object-cover object-top"
            : "pointer-events-none absolute size-px opacity-0"
      }
    />
  );

  const fallbackPoster =
    fallback && intro.posterUrl && !started ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={intro.posterUrl}
        alt=""
        className="absolute inset-x-0 top-0 h-[200%] w-full object-cover object-top"
      />
    ) : null;

  if (inline) {
    return (
      <span
        className={`relative block ${fallback ? "overflow-hidden" : ""} ${className}`}
      >
        <span
          className={`block size-full transition-opacity duration-500 ${
            fallback ? "" : posterReady || started ? "opacity-0" : ""
          }`}
        >
          {children}
        </span>
        {videoElement}
        {fallbackPoster}
        <canvas
          ref={canvas}
          aria-hidden="true"
          className={`absolute inset-0 size-full transition-opacity duration-500 ${
            !fallback && (posterReady || started) ? "opacity-100" : "opacity-0"
          }`}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={
            !started
              ? `Play ${name}'s video intro (${formatDuration(playLength(intro))})`
              : playing
                ? "Pause video"
                : "Play video"
          }
          className="group/intro absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          {...(!started
            ? {
                "data-track-event": "video_play",
                "data-track-kind": "intro",
                "data-track-label": "Video intro",
              }
            : {})}
        >
          {!started && idle}
          {started && !playing && (
            <span className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
              <Play
                aria-hidden
                className="size-5 translate-x-px fill-current"
              />
            </span>
          )}
        </button>
        {started && (
          <>
            <span className="absolute inset-x-[8%] bottom-1 z-10 flex items-center gap-1.5">
              <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-black/25">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-current"
                  style={{
                    width: `${Math.min(100, (time / (length || 1)) * 100)}%`,
                  }}
                />
              </span>
            </span>
            <span className="absolute -top-2 -right-2 z-10 flex gap-1">
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  if (video.current) video.current.muted = !muted;
                }}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </IconButton>
              {cues.length > 0 && (
                <IconButton
                  label={captionsOn ? "Hide captions" : "Show captions"}
                  onClick={() => setCaptionsOn((c) => !c)}
                >
                  {captionsOn ? <Captions /> : <CaptionsOff />}
                </IconButton>
              )}
              <IconButton label="Stop video" onClick={stop}>
                <X />
              </IconButton>
            </span>
            {cue && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1 bottom-4 z-20 mx-auto w-fit rounded-md bg-black/75 px-2 py-1 text-center text-[11px] leading-snug font-medium text-white sm:text-xs"
              >
                {cue.text}
              </span>
            )}
          </>
        )}
      </span>
    );
  }

  return (
    <div
      className={`group/player relative mx-auto overflow-hidden ${className}`}
      style={{
        aspectRatio: String(pictureAspect),
        width: `min(100%, calc(72vh * ${pictureAspect}))`,
      }}
    >
      {videoElement}
      {fallbackPoster}
      {stacked && (
        <canvas
          ref={canvas}
          aria-hidden="true"
          className="absolute inset-0 size-full"
        />
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      >
        {!playing && (
          <span className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <Play aria-hidden className="size-6 translate-x-0.5 fill-current" />
          </span>
        )}
      </button>
      {cue && (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-14 mx-auto w-max max-w-[90%] rounded-md bg-black/75 px-3 py-1.5 text-center text-sm leading-snug font-medium text-white sm:text-base"
        >
          {cue.text}
        </p>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2.5 text-white">
        <IconButton
          label={playing ? "Pause" : "Play"}
          onClick={toggle}
          tone="dark"
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={length || 1}
          step={0.1}
          value={Math.min(time, length || 1)}
          aria-label="Seek"
          onChange={(e) => {
            if (video.current)
              video.current.currentTime =
                playback.start + Number(e.target.value);
          }}
          className="h-1 flex-1 cursor-pointer accent-white"
        />
        <span className="text-xs tabular-nums">
          {formatDuration(time)} / {formatDuration(length)}
        </span>
        {cues.length > 0 && (
          <IconButton
            label={captionsOn ? "Hide captions" : "Show captions"}
            onClick={() => setCaptionsOn((c) => !c)}
            tone="dark"
          >
            {captionsOn ? <Captions /> : <CaptionsOff />}
          </IconButton>
        )}
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          onClick={() => {
            if (video.current) video.current.muted = !muted;
          }}
          tone="dark"
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone = "solid",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "solid" | "dark";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        tone === "dark"
          ? "flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white [&_svg]:size-4"
          : "flex size-7 items-center justify-center rounded-full bg-black/70 text-white shadow ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-current [&_svg]:size-3.5"
      }
    >
      {children}
    </button>
  );
}
