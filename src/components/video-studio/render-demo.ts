/** A real, local silent WebM export. This does not synthesize speech or facial movement. */
export async function renderDemo(
  photoUrl: string,
  script: string,
  progress: (value: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (
    typeof MediaRecorder === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  )
    throw new Error(
      "Video export is not supported in this browser. Try a recent Chrome or Edge browser.",
    );
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((v) => MediaRecorder.isTypeSupported(v));
  if (!mime)
    throw new Error("This browser cannot export WebM. Try Chrome or Edge.");
  const image = new Image();
  image.src = photoUrl;
  await image.decode();
  if (signal.aborted) throw new Error("Cancelled.");
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_000_000,
  });
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    let frame = 0;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
      reject(new Error("Cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Video export failed. Try another browser."));
    };
    recorder.onstop = () => {
      cleanup();
      if (!signal.aborted) {
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) resolve(blob);
        else reject(new Error("The browser produced an empty video."));
      }
    };
    recorder.start(250);
    const start = performance.now();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const words = script.trim().split(/\s+/);
    const excerpts = [
      words.slice(0, 18).join(" "),
      words.slice(18, 36).join(" "),
      words.slice(36, 54).join(" "),
    ].filter(Boolean);
    const draw = () => {
      const t = Math.min((performance.now() - start) / 6000, 1);
      progress(Math.round(t * 100));
      ctx.fillStyle = "#e9e4db";
      ctx.fillRect(0, 0, 720, 900);
      const scale =
        Math.max(720 / image.width, 900 / image.height) *
        (1 + (reducedMotion ? 0 : t * 0.035));
      const w = image.width * scale,
        h = image.height * scale;
      ctx.drawImage(image, (720 - w) / 2, (900 - h) / 2, w, h);
      const shade = ctx.createLinearGradient(0, 400, 0, 900);
      shade.addColorStop(0, "transparent");
      shade.addColorStop(1, "rgba(15,20,18,.94)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 400, 720, 500);
      ctx.fillStyle = "#d6e5c8";
      ctx.font = "18px sans-serif";
      ctx.fillText("FOLIOONE / INTRO STUDY", 42, 64);
      ctx.fillStyle = "white";
      ctx.font = "30px Georgia";
      const excerpt =
        excerpts[
          Math.min(Math.floor(t * excerpts.length), excerpts.length - 1)
        ] ?? "";
      let line = "",
        y = 690;
      for (const word of excerpt.split(" ")) {
        const next = line + word + " ";
        if (ctx.measureText(next).width > 625 && line) {
          ctx.fillText(line, 42, y);
          y += 42;
          line = word + " ";
        } else line = next;
      }
      ctx.fillText(line, 42, y);
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#ddd";
      ctx.fillText("SILENT DEMO · NO LIP SYNC · SCRIPT EXCERPTS", 42, 855);
      if (t < 1) frame = requestAnimationFrame(draw);
      else if (recorder.state !== "inactive") recorder.stop();
    };
    frame = requestAnimationFrame(draw);
    // Stop even if a background tab throttles animation frames.
    const timer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, 8000);
  });
}
