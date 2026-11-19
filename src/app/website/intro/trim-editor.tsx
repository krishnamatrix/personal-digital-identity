"use client";

import { RotateCcw, Scissors } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  MIN_TRIMMED_SECONDS,
  type IntroTrim,
} from "@/domains/intro/intro-video";

/** 0:03.4 style: trims are about fractions of a second. */
export function formatPrecise(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/**
 * Start / end handles over the take's timeline. Moving a handle shows that frame in the
 * player above (through `video`); the player plays only the part between the handles.
 */
export function TrimEditor({
  duration,
  trim,
  onChange,
  video,
  disabled = false,
}: {
  duration: number;
  trim: IntroTrim | null;
  onChange: (trim: IntroTrim | null) => void;
  video: RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
}) {
  const start = trim?.start ?? 0;
  const end = trim?.end ?? duration;
  const pct = (t: number) => `${(t / (duration || 1)) * 100}%`;

  const show = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
  };
  const set = (nextStart: number, nextEnd: number) => {
    const s = Math.max(0, Math.min(nextStart, nextEnd - MIN_TRIMMED_SECONDS));
    const e = Math.min(duration, Math.max(nextEnd, s + MIN_TRIMMED_SECONDS));
    onChange(s <= 0.05 && e >= duration - 0.05 ? null : { start: s, end: e });
  };
  const now = () => video.current?.currentTime ?? 0;

  const thumb =
    "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-foreground focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-4 [&:focus-visible::-webkit-slider-thumb]:ring-foreground/20";

  return (
    <div className="border-border bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Scissors aria-hidden className="size-4" />
          Trim
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          Plays {formatPrecise(start)} – {formatPrecise(end)} ·{" "}
          {formatPrecise(end - start)} long
        </p>
      </div>

      <div className="relative h-9">
        <div className="bg-muted absolute inset-0 overflow-hidden rounded-md">
          <div
            className="bg-foreground/15 border-foreground absolute inset-y-0 border-y-2"
            style={{ left: pct(start), width: pct(end - start) }}
          />
        </div>
        <input
          type="range"
          aria-label="Trim start"
          min={0}
          max={duration}
          step={0.05}
          value={start}
          disabled={disabled}
          aria-valuetext={formatPrecise(start)}
          onChange={(e) => {
            const t = Number(e.target.value);
            set(t, end);
            show(Math.min(t, end - MIN_TRIMMED_SECONDS));
          }}
          className={thumb}
        />
        <input
          type="range"
          aria-label="Trim end"
          min={0}
          max={duration}
          step={0.05}
          value={end}
          disabled={disabled}
          aria-valuetext={formatPrecise(end)}
          onChange={(e) => {
            const t = Number(e.target.value);
            set(start, t);
            show(Math.max(t, start + MIN_TRIMMED_SECONDS));
          }}
          className={thumb}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => set(now(), end)}
        >
          Start here
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => set(start, now())}
        >
          End here
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !trim}
          onClick={() => onChange(null)}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Keep everything
        </Button>
      </div>
    </div>
  );
}
