"use client";

import { useEffect } from "react";

/**
 * Browser recordings (Chrome WebM especially) carry no duration, which breaks the seek bar.
 * The usual fix: seek far past the end once, let the browser find the real end, rewind.
 */
export function useSeekableDuration(
  ref: React.RefObject<HTMLVideoElement | null>,
  onReady?: () => void,
) {
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let fixing = false;
    const ready = () => onReady?.();
    const onMeta = () => {
      if (Number.isFinite(video.duration)) return ready();
      fixing = true;
      video.currentTime = 1e101;
    };
    const onDuration = () => {
      if (!fixing || !Number.isFinite(video.duration)) return;
      fixing = false;
      video.currentTime = 0;
      ready();
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onDuration);
    if (video.readyState >= 1) onMeta();
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onDuration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
