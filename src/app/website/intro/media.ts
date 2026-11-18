/**
 * Browser-only helpers for the video intro studio: recorder formats, poster frames, the
 * caption soundtrack (16 kHz mono WAV) and an upload with progress. No server imports.
 */

/** H.264/AAC MP4 plays everywhere, so it wins when the browser can record it. */
const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];
const AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

function firstSupported(types: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return types.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}
export const pickVideoType = () => firstSupported(VIDEO_TYPES);
export const pickAudioType = () => firstSupported(AUDIO_TYPES);

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** About 2 Mbit/s video: a two-minute take stays near 30 MB. */
export const VIDEO_BITS_PER_SECOND = 2_000_000;
export const AUDIO_BITS_PER_SECOND = 128_000;
/** Cut-out takes are twice as tall (picture + mask); the mask half compresses to little. */
export const STACKED_BITS_PER_SECOND = 3_000_000;

/** The current frame of a <video> or canvas as a JPEG (at most 1280 px wide). */
export async function frameToJpeg(
  video: HTMLVideoElement | HTMLCanvasElement,
): Promise<Blob | null> {
  const w = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
  const h =
    video instanceof HTMLVideoElement ? video.videoHeight : video.height;
  if (!w || !h) return null;
  const scale = Math.min(1, 1280 / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
  );
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** The recording's soundtrack, resampled to 16 kHz mono (what speech recognition needs). */
export async function soundtrackWav(media: Blob): Promise<Blob | null> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === "undefined") return null;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await media.arrayBuffer());
    const rate = 16_000;
    const length = Math.ceil(decoded.duration * rate);
    if (!length) return null;
    const offline = new OfflineAudioContext(1, length, rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), rate);
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** PUT to a Storage signed upload URL, reporting progress (0..1). */
export function uploadWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload_${xhr.status}`));
    xhr.onerror = () => reject(new Error("upload_network"));
    xhr.onabort = () => reject(new Error("upload_aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
