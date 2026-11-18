"use client";

import {
  Circle,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  MAX_RECORDING_SECONDS,
  readingSeconds,
} from "@/domains/intro/intro-video";
import {
  AUDIO_BITS_PER_SECOND,
  frameToJpeg,
  pickAudioType,
  pickVideoType,
  VIDEO_BITS_PER_SECOND,
} from "@/app/website/intro/media";

export type RecordedTake = {
  video: Blob;
  mimeType: string;
  duration: number;
  /** Separate soundtrack for captions (may be missing on some browsers). */
  audio: Blob | null;
  poster: Blob | null;
};

const SPEEDS = [
  { id: "slow", label: "Slow", wpm: 110 },
  { id: "normal", label: "Normal", wpm: 140 },
  { id: "fast", label: "Fast", wpm: 170 },
] as const;
type SpeedId = (typeof SPEEDS)[number]["id"];
const FONT_SIZES = [22, 26, 30, 36, 42];

type Phase = "starting" | "ready" | "countdown" | "recording" | "error";

function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access is blocked. Allow the camera and microphone for this site in your browser's address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "We could not find a camera and microphone. Connect one and try again.";
  if (name === "NotReadableError")
    return "Your camera is being used by another app. Close it and try again.";
  return "We could not start your camera. Please try again.";
}

/**
 * Camera + teleprompter. The preview is mirrored (as people expect); the recording is not.
 * The script scrolls at the chosen reading speed; Space pauses and resumes the scroll.
 */
export function Recorder({
  script,
  onTake,
  onEditScript,
}: {
  script: string;
  onTake: (take: RecordedTake) => void;
  onEditScript: () => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<{
    cameras: MediaDeviceInfo[];
    mics: MediaDeviceInfo[];
  }>({ cameras: [], mics: [] });
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<SpeedId>("normal");
  const [fontIndex, setFontIndex] = useState(2);
  const [scrolling, setScrolling] = useState(false);
  const [practice, setPractice] = useState(false);
  const prompter = useRef<HTMLDivElement>(null);
  // Phones: portrait stage, smaller script text.
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 639px)").matches) setFontIndex(0);
  }, []);

  // ------------------------------------------------------------------ camera lifecycle
  const startCamera = useCallback(async (camera?: string, mic?: string) => {
    setPhase("starting");
    setError(null);
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(camera
            ? { deviceId: { exact: camera } }
            : { facingMode: "user" }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: {
          ...(mic ? { deviceId: { exact: mic } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = media;
      if (preview.current) {
        preview.current.srcObject = media;
        await preview.current.play().catch(() => undefined);
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        cameras: all.filter((d) => d.kind === "videoinput" && d.deviceId),
        mics: all.filter((d) => d.kind === "audioinput" && d.deviceId),
      });
      setCameraId(media.getVideoTracks()[0]?.getSettings().deviceId ?? "");
      setMicId(media.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      setPhase("ready");
    } catch (e) {
      setError(cameraError(e));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [startCamera]);

  // ------------------------------------------------------------------- microphone meter
  useEffect(() => {
    const media = stream.current;
    if (!media || phase === "starting" || phase === "error") return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx || !media.getAudioTracks().length) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(media).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (t - last < 80) return;
      last = t;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      void ctx.close().catch(() => undefined);
    };
    // Re-attach when the stream changes (device switch).
  }, [phase, cameraId, micId]);

  // ----------------------------------------------------------------------- teleprompter
  const wpm = SPEEDS.find((s) => s.id === speed)!.wpm;
  useEffect(() => {
    if (!scrolling) return;
    const box = prompter.current;
    if (!box) return;
    const seconds = Math.max(5, readingSeconds(script, wpm));
    const distance = box.scrollHeight - box.clientHeight;
    const pxPerSecond = distance / seconds;
    let frame = 0;
    let prev = performance.now();
    let position = box.scrollTop;
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      // Respect a manual nudge (wheel / touch) made while scrolling.
      if (Math.abs(box.scrollTop - position) > 2) position = box.scrollTop;
      position += pxPerSecond * dt;
      box.scrollTop = position;
      if (position < distance) frame = requestAnimationFrame(tick);
      else setScrolling(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, wpm, script, fontIndex]);

  const rewindPrompter = () => {
    if (prompter.current) prompter.current.scrollTop = 0;
  };

  // -------------------------------------------------------------------------- recording
  const recorders = useRef<{
    video: MediaRecorder;
    audio: MediaRecorder | null;
    chunks: Blob[];
    audioChunks: Blob[];
    started: number;
    poster: Blob | null;
  } | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    const r = recorders.current;
    if (!r || r.video.state === "inactive") return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setScrolling(false);
    const duration = (performance.now() - r.started) / 1000;
    const done = new Promise<void>((resolve) => {
      r.video.onstop = () => resolve();
    });
    const audioDone = r.audio
      ? new Promise<void>((resolve) => {
          r.audio!.onstop = () => resolve();
        })
      : Promise.resolve();
    r.video.stop();
    if (r.audio?.state !== "inactive") r.audio?.stop();
    void Promise.all([done, audioDone]).then(() => {
      const mimeType = r.video.mimeType || r.chunks[0]?.type || "video/webm";
      onTake({
        video: new Blob(r.chunks, { type: mimeType.split(";")[0] }),
        mimeType,
        duration: Math.min(duration, MAX_RECORDING_SECONDS + 1),
        audio: r.audioChunks.length
          ? new Blob(r.audioChunks, {
              type: r.audio?.mimeType || r.audioChunks[0]!.type,
            })
          : null,
        poster: r.poster,
      });
      recorders.current = null;
      setPhase("ready");
    });
  }, [onTake]);

  const begin = useCallback(() => {
    const media = stream.current;
    if (!media) return;
    const type = pickVideoType();
    let video: MediaRecorder;
    try {
      video = new MediaRecorder(media, {
        ...(type ? { mimeType: type } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      setError(
        "This browser cannot record video. Try the latest Chrome, Edge, Firefox or Safari.",
      );
      setPhase("error");
      return;
    }
    let audio: MediaRecorder | null = null;
    try {
      const audioType = pickAudioType();
      audio = new MediaRecorder(new MediaStream(media.getAudioTracks()), {
        ...(audioType ? { mimeType: audioType } : {}),
        audioBitsPerSecond: 64_000,
      });
    } catch {
      audio = null;
    }
    const state = {
      video,
      audio,
      chunks: [] as Blob[],
      audioChunks: [] as Blob[],
      started: performance.now(),
      poster: null as Blob | null,
    };
    video.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
    if (audio)
      audio.ondataavailable = (e) =>
        e.data.size && state.audioChunks.push(e.data);
    recorders.current = state;
    video.start(1000);
    audio?.start(1000);
    setPhase("recording");
    setElapsed(0);
    setPractice(false);
    rewindPrompter();
    window.setTimeout(() => setScrolling(true), 600);
    window.setTimeout(() => {
      if (preview.current && recorders.current === state)
        void frameToJpeg(preview.current).then((b) => {
          state.poster = b;
        });
    }, 1500);
    timer.current = window.setInterval(() => {
      const s = (performance.now() - state.started) / 1000;
      setElapsed(s);
      if (s >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [stop]);

  const startCountdown = () => {
    setScrolling(false);
    setPractice(false);
    rewindPrompter();
    setPhase("countdown");
    setCount(3);
  };
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      begin();
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 900);
    return () => window.clearTimeout(t);
  }, [phase, count, begin]);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      const r = recorders.current;
      if (r && r.video.state !== "inactive") {
        r.video.onstop = null;
        r.video.stop();
        r.audio?.stop();
      }
    },
    [],
  );

  // Space toggles the scroll while recording or practising.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, button, [role=combobox], [role=switch]")
      )
        return;
      if (phase !== "recording" && !practice) return;
      e.preventDefault();
      setScrolling((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, practice]);

  const recording = phase === "recording";
  const remaining = MAX_RECORDING_SECONDS - elapsed;
  const estimate = readingSeconds(script, wpm);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-neutral-950 shadow-sm">
        <video
          ref={preview}
          muted
          playsInline
          aria-label="Camera preview"
          className="aspect-[3/4] w-full -scale-x-100 bg-neutral-950 object-cover sm:aspect-video"
        />

        {/* Teleprompter, near the top so your eyes stay close to the camera. */}
        {phase !== "error" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[46%] bg-gradient-to-b from-black/80 via-black/60 to-transparent">
            <div
              ref={prompter}
              tabIndex={0}
              aria-label="Teleprompter script"
              className="pointer-events-auto mx-auto h-full max-w-3xl overflow-y-auto px-6 pt-5 text-center leading-snug font-semibold text-white [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
              style={{
                fontSize: FONT_SIZES[fontIndex],
                maskImage:
                  "linear-gradient(to bottom, transparent 0, black 18%, black 70%, transparent 100%)",
              }}
            >
              <div className="h-[22%]" aria-hidden="true" />
              {script.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="mb-[0.8em] whitespace-pre-line">
                  {para}
                </p>
              ))}
              {/* Lets the last line scroll up to the reading line. */}
              <div className="h-[70%]" aria-hidden="true" />
            </div>
            <span
              aria-hidden="true"
              className="absolute top-[38%] left-2 text-lg text-white/70"
            >
              ▸
            </span>
          </div>
        )}

        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span
              key={count}
              className="text-8xl font-semibold text-white tabular-nums motion-safe:animate-[ping_0.9s_ease-out_1_reverse]"
              aria-live="assertive"
            >
              {count || ""}
            </span>
          </div>
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting your camera…
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-sm text-white">
            <p className="max-w-md leading-6">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void startCamera()}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Status chips */}
        <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium tabular-nums backdrop-blur-sm",
              recording ? "bg-red-600 text-white" : "bg-black/60 text-white",
            )}
            aria-live="off"
          >
            {recording && (
              <span className="size-2 rounded-full bg-white motion-safe:animate-pulse" />
            )}
            {recording
              ? `${formatDuration(elapsed)} / ${formatDuration(MAX_RECORDING_SECONDS)}`
              : `Script ≈ ${formatDuration(estimate)}`}
          </span>
          {phase !== "error" && phase !== "starting" && (
            <span
              className="flex h-7 items-center gap-2 rounded-full bg-black/60 px-3 backdrop-blur-sm"
              title="Microphone level"
            >
              <span className="sr-only">Microphone level</span>
              <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/25">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-400 transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </span>
            </span>
          )}
        </div>
        {recording && remaining <= 10 && (
          <p className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
            {Math.ceil(remaining)}s left
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Teleprompter speed"
            className="border-border bg-card inline-flex rounded-full border p-0.5"
          >
            {SPEEDS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={speed === s.id}
                onClick={() => setSpeed(s.id)}
                className={cn(
                  "focus-visible:ring-foreground/20 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  speed === s.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="border-border bg-card inline-flex items-center rounded-full border p-0.5">
            <button
              type="button"
              aria-label="Smaller script text"
              disabled={fontIndex === 0}
              onClick={() => setFontIndex((i) => Math.max(0, i - 1))}
              className="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-full disabled:opacity-40"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="px-1 text-xs font-medium" aria-hidden="true">
              Aa
            </span>
            <button
              type="button"
              aria-label="Larger script text"
              disabled={fontIndex === FONT_SIZES.length - 1}
              onClick={() =>
                setFontIndex((i) => Math.min(FONT_SIZES.length - 1, i + 1))
              }
              className="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-full disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {!recording && phase === "ready" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (practice && scrolling) {
                  setScrolling(false);
                  return;
                }
                if (!practice) rewindPrompter();
                setPractice(true);
                setScrolling(true);
              }}
            >
              {practice && scrolling ? (
                <Pause aria-hidden className="size-3.5" />
              ) : (
                <Play aria-hidden className="size-3.5" />
              )}
              {practice && scrolling ? "Pause practice" : "Practice"}
            </Button>
          )}
          {!recording && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScrolling(false);
                setPractice(false);
                rewindPrompter();
              }}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Rewind
            </Button>
          )}
          {recording && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScrolling((s) => !s)}
            >
              {scrolling ? (
                <Pause aria-hidden className="size-3.5" />
              ) : (
                <Play aria-hidden className="size-3.5" />
              )}
              {scrolling ? "Pause script" : "Resume script"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!recording && (
            <Button
              variant="outline"
              onClick={onEditScript}
              disabled={phase === "countdown"}
            >
              Edit script
            </Button>
          )}
          {recording ? (
            <Button variant="destructive" onClick={stop}>
              <Square aria-hidden className="size-3.5 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={startCountdown}
              disabled={phase !== "ready"}
            >
              <Circle aria-hidden className="size-3.5 fill-current" />
              Start recording
            </Button>
          )}
        </div>
      </div>

      {!recording &&
        (devices.cameras.length > 1 || devices.mics.length > 1) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {devices.cameras.length > 1 && (
              <DevicePicker
                label="Camera"
                value={cameraId}
                devices={devices.cameras}
                onChange={(id) => {
                  setCameraId(id);
                  void startCamera(id, micId || undefined);
                }}
              />
            )}
            {devices.mics.length > 1 && (
              <DevicePicker
                label="Microphone"
                value={micId}
                devices={devices.mics}
                onChange={(id) => {
                  setMicId(id);
                  void startCamera(cameraId || undefined, id);
                }}
              />
            )}
          </div>
        )}
      <p className="text-muted-foreground text-xs leading-5">
        Press <kbd className="border-border rounded border px-1">Space</kbd> to
        pause or resume the script. Recording stops by itself at two minutes.
      </p>
    </div>
  );
}

function DevicePicker({
  label,
  value,
  devices,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {devices.map((d, i) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
