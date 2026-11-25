"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Film,
  ImagePlus,
  LockKeyhole,
  Mic2,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  draftFromResume,
  MAX_PHOTO_BYTES,
  SAMPLE_SCRIPT,
  validateImage,
  validateScript,
  VOICES,
} from "@/domains/video-studio/studio";
import { renderDemo } from "./render-demo";

type Result = {
  id?: string;
  status: "processing" | "ready" | "failed";
  url?: string;
  error?: string;
};
export function VideoStudio({
  liveAvailable = false,
}: {
  liveAvailable?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [resume, setResume] = useState("");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [output, setOutput] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [resultMode, setResultMode] = useState<"demo" | "live">("demo");
  const controller = useRef<AbortController | null>(null);
  const fileVersion = useRef(0);
  const mounted = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  const validScript = words >= 10 && words <= 140 && script.length <= 2000;
  const valid = Boolean(photo && validScript && consent);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );
  useEffect(
    () => () => {
      if (output.startsWith("blob:")) URL.revokeObjectURL(output);
    },
    [output],
  );
  function stopVoice() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }
  function invalidate() {
    setOutput("");
    setJob(null);
    setRequestId(null);
    setConsent(false);
    setError("");
    setNotice("");
    stopVoice();
  }
  async function choosePhoto(file?: File) {
    if (!file) return;
    const version = ++fileVersion.current;
    let url = "";
    try {
      if (file.size > MAX_PHOTO_BYTES)
        throw new Error("Choose a photo smaller than 2 MB.");
      validateImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
        file.size,
      );
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (
        image.width < 128 ||
        image.height < 128 ||
        image.width * image.height > 25_000_000
      )
        throw new Error(
          "Choose a clear photo between 128 pixels and 25 megapixels.",
        );
      if (version !== fileVersion.current || !mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      invalidate();
      setPhoto(file);
      setPhotoUrl(url);
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      setError(
        e instanceof Error ? e.message : "This photo could not be opened.",
      );
    }
  }
  async function readResume(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100_000 || !/\.(txt|md)$/i.test(file.name))
        throw new Error(
          "Upload a TXT or Markdown résumé under 100 KB, or paste text below.",
        );
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      draftFromResume(text);
      invalidate();
      setResume(text);
      setNotice(
        "Résumé loaded locally. Choose Prepare draft, then edit it into a spoken introduction.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this résumé.");
    }
  }
  function prepareDraft() {
    try {
      const draft = draftFromResume(resume);
      invalidate();
      setScript(draft);
      setNotice(
        "Draft copies only your supplied wording. Edit it into first person and review every claim before generation.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function previewVoice() {
    if (speaking) {
      stopVoice();
      return;
    }
    if (!("speechSynthesis" in window)) {
      setError("Voice preview is not supported in this browser.");
      return;
    }
    stopVoice();
    const utterance = new SpeechSynthesisUtterance(script);
    const option = VOICES.find((v) => v.id === voice)!;
    utterance.lang = option.lang;
    utterance.voice =
      window.speechSynthesis.getVoices().find((v) => v.lang === option.lang) ??
      null;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setError(
        "Voice preview could not play. Check your browser audio settings.",
      );
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  async function checkStatus(id: string, signal: AbortSignal) {
    const response = await fetch(
      `/api/poc/video-studio?id=${encodeURIComponent(id)}`,
      { signal, cache: "no-store" },
    );
    const data = (await response.json()) as Result;
    if (!response.ok || data.error)
      throw new Error(data.error ?? "Status unavailable. Check again.");
    if (data.status === "failed")
      throw new Error(
        "The provider could not generate this video. Check provider activity before submitting again.",
      );
    if (data.status === "ready" && data.url) {
      setOutput(data.url);
      setNotice(
        "Your AI intro is ready. This provider link expires; save it before leaving.",
      );
      return true;
    }
    return false;
  }
  async function generate() {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(0);
    setOutput("");
    stopVoice();
    try {
      validateScript(script);
      if (!photo || !consent)
        throw new Error(
          "Add a portrait and approve your script and permissions first.",
        );
      setResultMode(mode);
      setStep(3);
      if (mode === "demo") {
        const blob = await renderDemo(
          photoUrl,
          script,
          setProgress,
          abort.signal,
        );
        if (!abort.signal.aborted) setOutput(URL.createObjectURL(blob));
        setNotice(
          "Demo ready: a six-second silent motion portrait. Live mode creates the talking avatar.",
        );
      } else {
        const id = requestId ?? crypto.randomUUID();
        setRequestId(id);
        const form = new FormData();
        form.set("image", photo);
        form.set("script", script);
        form.set("voice", voice);
        form.set("consent", "true");
        form.set("requestId", id);
        const response = await fetch("/api/poc/video-studio", {
          method: "POST",
          body: form,
          signal: abort.signal,
        });
        const data = (await response.json()) as Result;
        if (!response.ok || data.error || !data.id)
          throw new Error(data.error ?? "Could not submit video.");
        setJob(data.id);
        for (let n = 0; n < 24; n++) {
          if (await checkStatus(data.id, abort.signal)) return;
          setNotice(
            "The provider is generating your introduction. You can leave this tab open.",
          );
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              abort.signal.removeEventListener("abort", cancel);
              resolve();
            };
            const timer = setTimeout(done, 5000);
            const cancel = () => {
              clearTimeout(timer);
              reject(new Error("Cancelled."));
            };
            abort.signal.addEventListener("abort", cancel, { once: true });
          });
        }
        setNotice(
          "Still processing. Use Check status to continue without paying for another generation.",
        );
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Generation could not complete.",
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  async function refreshStatus() {
    if (!job || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      if (!(await checkStatus(job, abort.signal)))
        setNotice("Still processing. Check again in a moment.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    controller.current?.abort();
    fileVersion.current++;
    invalidate();
    setPhoto(null);
    setPhotoUrl("");
    setScript(SAMPLE_SCRIPT);
    setResume("");
    setStep(0);
    setProgress(0);
    setBusy(false);
  }
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card flex items-center justify-between border-b px-5 py-4 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-semibold tracking-tight"
        >
          <span className="bg-foreground text-background flex size-8 items-center justify-center rounded-xl">
            f.
          </span>
          folioone
          <span className="border-border text-muted-foreground ml-3 hidden border-l pl-4 text-sm font-normal sm:inline">
            Experiments
          </span>
        </Link>
        <span className="bg-success-soft text-success rounded-full px-3 py-1.5 text-xs font-medium">
          Proof of concept
        </span>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-3">YOUR STORY, IN YOUR OWN WORDS</p>
            <h1 className="font-display text-3xl md:text-5xl">
              A face. A story. An introduction.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-6">
              Turn your portrait and a few thoughtful words into a memorable
              first hello.
            </p>
          </div>
          <Button variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw size={15} />
            Start over
          </Button>
        </div>
        <nav
          aria-label="Creation steps"
          className="border-border bg-card mb-7 grid grid-cols-4 gap-2 rounded-2xl border p-2"
        >
          {["Portrait", "Your story", "Voice & consent", "Review"].map(
            (label, i) => (
              <button
                key={label}
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                aria-label={`${i + 1} ${label}`}
                className={`flex items-center justify-center gap-2 rounded-xl px-1 py-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 md:text-sm ${step === i ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                disabled={busy}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${step === i ? "border-white/40" : "border-border"}`}
                >
                  {i < step ? <Check size={11} /> : i + 1}
                </span>
                <span>{label}</span>
              </button>
            ),
          )}
        </nav>
        <div className="grid items-start gap-6 lg:grid-cols-[1.12fr_1fr]">
          <fieldset
            disabled={busy}
            aria-label="Studio controls"
            className="border-border bg-card rounded-[20px] border p-6 md:p-8"
          >
            <div className="mb-7 flex items-center justify-between">
              <p className="eyebrow">0{step + 1} / CREATE YOUR INTRO</p>
              <span className="text-muted-foreground text-xs">
                {mode === "demo" ? "Local demo" : "D-ID avatar"}
              </span>
            </div>
            {step === 0 && (
              <>
                <h2 className="font-display text-2xl">
                  Start with a great portrait.
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  A single person, facing the camera. Good light and a simple
                  background go a long way.
                </p>
                <button
                  onClick={() => photoInput.current?.click()}
                  className="border-foreground/25 bg-muted/40 hover:bg-muted mt-7 flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-7 focus-visible:outline-2"
                >
                  <span className="bg-card flex size-14 items-center justify-center rounded-2xl shadow-sm">
                    <ImagePlus size={25} strokeWidth={1.3} />
                  </span>
                  <span className="text-sm font-medium">
                    {photo ? "Change your portrait" : "Choose your portrait"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    JPEG or PNG · up to 2 MB · at least 128 × 128
                  </span>
                </button>
                <input
                  ref={photoInput}
                  aria-label="Upload portrait"
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  onChange={(e) => {
                    void choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {photo && (
                  <p className="text-success mt-4 flex items-center gap-2 text-sm">
                    <Check size={14} />
                    {photo.name}
                  </p>
                )}
                <div className="bg-muted/60 text-muted-foreground mt-6 flex items-start gap-3 rounded-xl p-4 text-xs leading-5">
                  <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                  Your photo stays in this browser in demo mode. Live mode sends
                  it to the video provider only after your approval.
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="font-display text-2xl">
                  What would you like to say?
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  Introduce yourself, share what you do, and give people a
                  reason to connect.
                </p>
                <label
                  className="mt-6 block text-sm font-medium"
                  htmlFor="intro-script"
                >
                  Your introduction
                </label>
                <textarea
                  id="intro-script"
                  value={script}
                  maxLength={2000}
                  rows={8}
                  onChange={(e) => {
                    invalidate();
                    setScript(e.target.value);
                  }}
                  className="border-border bg-background/50 focus:border-foreground mt-2 w-full resize-y rounded-xl border p-4 text-sm leading-7 outline-none"
                />
                <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                  <span className={!validScript ? "text-danger" : ""}>
                    {words} / 140 words · minimum 10
                  </span>
                  <span>About {Math.round((words / 140) * 60)} sec</span>
                </div>
                <details className="border-border mt-6 rounded-xl border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Start from your résumé instead
                  </summary>
                  <p className="text-muted-foreground mt-3 text-xs leading-5">
                    Paste text or upload TXT/Markdown. The POC copies an
                    extractive draft; edit it into a spoken introduction. PDF
                    and DOCX are not supported here.
                  </p>
                  <label className="border-border mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-full border p-2 text-xs">
                    <Upload size={13} />
                    Upload résumé text
                    <input
                      aria-label="Upload résumé text"
                      type="file"
                      accept=".txt,.md"
                      className="sr-only"
                      onChange={(e) => {
                        void readResume(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <textarea
                    aria-label="Résumé text"
                    placeholder="Paste your résumé text here…"
                    value={resume}
                    maxLength={100000}
                    onChange={(e) => setResume(e.target.value)}
                    rows={4}
                    className="border-border mt-3 w-full rounded-lg border p-3 text-sm"
                  />
                  <Button
                    onClick={prepareDraft}
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                  >
                    <Sparkles size={13} />
                    Prepare draft
                  </Button>
                </details>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="font-display text-2xl">
                  Give your story a voice.
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  Choose a stock voice for the avatar. Voice cloning is outside
                  this POC.
                </p>
                <fieldset className="mt-6 space-y-3">
                  <legend className="mb-3 text-sm font-medium">
                    Avatar voice
                  </legend>
                  {VOICES.map((v) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${voice === v.id ? "border-foreground bg-muted/40" : "border-border"}`}
                    >
                      <input
                        type="radio"
                        name="voice"
                        value={v.id}
                        checked={voice === v.id}
                        onChange={() => {
                          invalidate();
                          setVoice(v.id);
                        }}
                      />
                      <span className="bg-muted flex size-9 items-center justify-center rounded-full">
                        <Mic2 size={17} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">
                          {v.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {v.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={previewVoice}
                >
                  <Play size={13} />
                  {speaking ? "Stop preview" : "Preview browser voice"}
                </Button>
                <p className="text-muted-foreground mt-2 text-xs leading-5">
                  Uses your device’s available voice, which may use OS speech
                  services and will differ from D-ID. This audio is not embedded
                  in the local demo.
                </p>
                <fieldset className="mt-7">
                  <legend className="mb-3 text-sm font-medium">
                    Generation mode
                  </legend>
                  <select
                    aria-label="Generation mode"
                    value={mode}
                    onChange={(e) => {
                      invalidate();
                      setMode(e.target.value as "demo" | "live");
                    }}
                    className="border-border bg-card w-full rounded-xl border p-3 text-sm"
                  >
                    <option value="demo">
                      Local demo · free · silent motion portrait
                    </option>
                    <option value="live" disabled={!liveAvailable}>
                      Live avatar · D-ID{" "}
                      {liveAvailable
                        ? "· requires sign-in"
                        : "· not configured"}
                    </option>
                  </select>
                </fieldset>
                <label className="bg-muted/70 mt-6 flex cursor-pointer items-start gap-3 rounded-xl p-4 text-xs leading-5">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    {mode === "live"
                      ? "I have permission to animate this person. I reviewed the script and approve sending my photo and script to D-ID. Generation may use paid provider credits. Provider retention applies, and the result uses an expiring bearer link."
                      : "I have permission to use this photo and have reviewed this script. I understand this demo exports a silent motion portrait with script excerpts, without lip sync."}
                  </span>
                </label>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="font-display text-2xl">
                  Your first hello, ready to review.
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  {output
                    ? "Play your result in the preview. Nothing is published or saved to your Folioone identity."
                    : "Review your inputs, then create your introduction."}
                </p>
                <dl className="divide-border mt-7 divide-y text-sm">
                  {[
                    ["Portrait", photo?.name ?? "Choose a photo"],
                    [
                      "Script",
                      `${words} words · about ${Math.round((words / 140) * 60)} seconds`,
                    ],
                    ["Voice", VOICES.find((v) => v.id === voice)?.name ?? ""],
                    [
                      "Output",
                      mode === "demo"
                        ? "6-second silent WebM study"
                        : "Talking-avatar video",
                    ],
                    ["Storage", "This session only"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-5 py-4"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="max-w-[65%] truncate text-right">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="bg-muted/60 text-muted-foreground mt-5 rounded-xl p-4 text-xs leading-5">
                  {mode === "demo"
                    ? "The demo proves the upload, editing, rendering, and review flow. Connect D-ID for a photo that actually speaks the complete script."
                    : "POC jobs expire in one hour and are lost on a server restart. Live output links expire. Save your result promptly; this POC does not copy it into Folioone storage."}
                </p>
                {job && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    disabled={busy}
                    onClick={() => void refreshStatus()}
                  >
                    Check status
                  </Button>
                )}
              </>
            )}
            {error && (
              <p
                role="alert"
                className="bg-danger-soft text-danger mt-5 rounded-xl p-4 text-sm leading-6"
              >
                {error}
              </p>
            )}
            <p role="status" className="text-success mt-4 text-sm leading-6">
              {notice}
            </p>
            <div className="border-border mt-7 flex items-center justify-between border-t pt-6">
              <Button
                variant="ghost"
                disabled={step === 0 || busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={14} />
                Back
              </Button>
              {step < 2 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    busy ||
                    (step === 0 && !photo) ||
                    (step === 1 && !validScript)
                  }
                >
                  Continue
                  <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  onClick={() => void generate()}
                  disabled={!valid || busy || Boolean(job)}
                  busy={busy}
                >
                  <Sparkles size={14} />
                  {busy
                    ? mode === "demo"
                      ? `Rendering ${progress}%`
                      : "Generating…"
                    : mode === "demo"
                      ? "Create demo video"
                      : "Generate AI intro"}
                </Button>
              )}
            </div>
          </fieldset>
          <aside className="lg:sticky lg:top-7">
            <div className="border-border bg-card overflow-hidden rounded-[20px] border">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="eyebrow">INTRO PREVIEW</span>
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <LockKeyhole size={12} />
                  {output && resultMode === "live"
                    ? "Provider link"
                    : "Session only"}
                </span>
              </div>
              <div className="relative mx-4 aspect-[4/5] overflow-hidden rounded-xl bg-[#e6e7e2]">
                {output ? (
                  <video
                    key={output}
                    src={output}
                    poster={photoUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                    aria-label="Generated intro video"
                  />
                ) : photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Local object URL cannot use the image optimizer. */}
                    <img
                      src={photoUrl}
                      alt="Your selected portrait"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-6 pt-28 pb-8 text-white">
                      <span className="mb-3 inline-block rounded-full border border-white/30 px-2 py-1 text-[10px] tracking-widest">
                        YOUR INTRODUCTION
                      </span>
                      <p className="line-clamp-3 font-serif text-2xl leading-8">
                        {script.split(/(?<=[.!?])\s/)[0]}
                      </p>
                      <p className="mt-4 text-xs text-white/70">
                        {mode === "demo"
                          ? "Motion portrait study"
                          : "Photo-to-talking-avatar"}{" "}
                        · {words} words
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-9 text-center">
                    <div className="mb-8 flex size-28 items-center justify-center rounded-[35px] border border-white/80 bg-white/45 text-[#777e72]">
                      <Film size={46} strokeWidth={1} />
                    </div>
                    <span className="font-serif text-3xl leading-tight text-[#525a4c]">
                      A little more human.
                      <br />A lot more you.
                    </span>
                    <p className="mt-5 max-w-56 text-xs leading-5 text-[#777e72]">
                      Your portrait will appear here.
                      <br />
                      Add a photo to make it yours.
                    </p>
                  </div>
                )}
                {busy && (
                  <div
                    className="bg-foreground/75 absolute inset-0 flex flex-col items-center justify-center gap-4 p-7 text-center text-white"
                    role="status"
                  >
                    <span className="size-10 animate-pulse rounded-full border border-white/50 p-2 motion-reduce:animate-none">
                      <Sparkles size={22} />
                    </span>
                    <span className="text-sm">
                      {mode === "demo"
                        ? "Composing your portrait study…"
                        : "Creating your talking avatar…"}
                    </span>
                    {mode === "demo" && (
                      <progress
                        aria-label="Rendering progress"
                        value={progress}
                        max={100}
                        className="h-1.5 w-44 accent-white"
                      />
                    )}
                  </div>
                )}
              </div>
              <div className="px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {output
                      ? "A new way to say hello."
                      : "Made for your portfolio."}
                  </p>
                  {output && (
                    <a
                      href={output}
                      download={
                        resultMode === "demo"
                          ? "folioone-intro-demo.webm"
                          : undefined
                      }
                      target={resultMode === "live" ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="border-border flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs"
                    >
                      <Download size={13} />
                      {resultMode === "live" ? "Open / save" : "Download"}
                    </a>
                  )}
                </div>
                <p className="text-muted-foreground mt-2 text-xs leading-5">
                  {output
                    ? resultMode === "demo"
                      ? "Silent local demo · no lip sync · script excerpts"
                      : "AI-generated avatar · expiring provider link"
                    : "A thoughtful introduction, one click away. Your portfolio stays unchanged throughout this experiment."}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-5 flex items-start gap-2 px-2 text-xs leading-5">
              <LockKeyhole size={13} className="mt-1 shrink-0" />
              No automatic publishing. No changes to your Master Identity. Reset
              or close this page to clear local inputs.
            </p>
            {output && (
              <button
                onClick={() => {
                  setOutput("");
                  setNotice("");
                }}
                className="text-muted-foreground mt-3 flex items-center gap-1 px-2 text-xs"
              >
                <X size={12} />
                Dismiss result
              </button>
            )}
          </aside>
        </div>
        <footer className="border-border text-muted-foreground mt-10 flex flex-wrap justify-between gap-3 border-t pt-5 text-xs">
          <span>Folioone Labs / Video intro studio</span>
          <span>Next.js · TypeScript · Tailwind · Optional D-ID</span>
        </footer>
      </div>
    </main>
  );
}
