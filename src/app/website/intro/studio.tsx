"use client";

import Link from "next/link";
import {
  Camera,
  Captions,
  Check,
  FileText,
  Scissors,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  cleanTrim,
  formatDuration,
  MAX_SCRIPT_CHARS,
  speechBounds,
  type IntroTrim,
  readingSeconds,
  SCRIPT_LENGTHS,
  SCRIPT_TONES,
  wordCount,
  type CaptionCue,
  type ScriptLength,
  type ScriptTone,
  type StudioState,
  type StudioTake,
} from "@/domains/intro/intro-video";
import { IntroPlayer } from "@/components/website/intro-video";
import { formatPrecise, TrimEditor } from "@/app/website/intro/trim-editor";
import { IntroVideoPlayer } from "@/components/website/intro-video-player";
import { Recorder, type RecordedTake } from "@/app/website/intro/recorder";
import {
  canRecord,
  formatBytes,
  frameToJpeg,
  soundtrackSamples,
  soundtrackWav,
  uploadWithProgress,
} from "@/app/website/intro/media";
import {
  beginUploadAction,
  captionAction,
  completeUploadAction,
  deleteIntroAction,
  draftScriptAction,
  saveCaptionsAction,
  saveScriptAction,
  saveTrimAction,
  setShowOnWebsiteAction,
} from "@/app/website/intro/actions";

/** Behind a cut-out take in the studio, so it reads as "just you, over a page". */
const CUTOUT_BACKDROP =
  "bg-[radial-gradient(circle_at_30%_20%,#fdf6ec,#e6ecf5_55%,#d9e3ef)]";

type Stage = "script" | "record" | "review";
type Notice = { ok: boolean; text: string } | null;

const STEPS: { id: Stage; label: string; icon: typeof FileText }[] = [
  { id: "script", label: "Script", icon: FileText },
  { id: "record", label: "Record", icon: Camera },
  { id: "review", label: "Review", icon: Check },
];

export function Studio({ initial }: { initial: StudioState }) {
  const [stage, setStage] = useState<Stage>("script");
  const [script, setScript] = useState(initial.script);
  const [savedScript, setSavedScript] = useState(initial.script);
  const [take, setTake] = useState<StudioTake | null>(initial.take);
  const [recorded, setRecorded] = useState<RecordedTake | null>(null);
  const [showOnWebsite, setShowOnWebsite] = useState(initial.showOnWebsite);
  const { announcements, announce } = useAnnouncer();
  const supported = useSupported();

  const persistScript = async () => {
    if (script === savedScript) return;
    const result = await saveScriptAction(script);
    if (result.ok) setSavedScript(script);
  };

  return (
    <div className="space-y-6">
      <LiveRegions announcements={announcements} />
      <header className="max-w-3xl">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
          My presence
        </p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          Video intro
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          Record a short hello for the top of your website. Write or draft a
          script, read it from the teleprompter while your camera records, then
          keep the take you like. Visitors tap your photo to watch it.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="border-border bg-card min-w-0 rounded-lg border p-4 md:p-6">
          <ol
            className="mb-6 flex items-center gap-1 sm:gap-2"
            aria-label="Steps"
          >
            {STEPS.map((s, i) => {
              const active = stage === s.id;
              const reachable =
                s.id === "script" ||
                (s.id === "record" && supported && script.trim().length > 0) ||
                (s.id === "review" && recorded);
              return (
                <li key={s.id} className="flex items-center gap-1 sm:gap-2">
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="bg-border h-px w-3 sm:w-6 md:w-10"
                    />
                  )}
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={active ? "step" : undefined}
                    onClick={() => {
                      if (s.id !== "script") void persistScript();
                      setStage(s.id);
                    }}
                    className={cn(
                      "focus-visible:ring-foreground/20 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40",
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <s.icon aria-hidden className="size-3.5" />
                    {i + 1}. {s.label}
                  </button>
                </li>
              );
            })}
          </ol>

          {stage === "script" && (
            <ScriptStep
              script={script}
              onChange={setScript}
              onBlur={() => void persistScript()}
              aiAvailable={initial.aiAvailable}
              supported={supported}
              onNext={() => {
                void persistScript();
                setStage("record");
              }}
            />
          )}
          {stage === "record" && (
            <Recorder
              script={script}
              onEditScript={() => setStage("script")}
              onTake={(t) => {
                setRecorded(t);
                setStage("review");
                announce("Recording finished. Review your take.");
              }}
            />
          )}
          {stage === "review" && recorded && (
            <ReviewStep
              recorded={recorded}
              script={script}
              aiAvailable={initial.aiAvailable}
              onRetake={() => {
                setRecorded(null);
                setStage("record");
              }}
              onSaved={(saved) => {
                setTake(saved);
                setSavedScript(script);
                setRecorded(null);
                setStage("script");
                announce("Your video intro is saved.");
              }}
            />
          )}
        </section>

        <aside className="space-y-4">
          <CurrentIntro
            take={take}
            name={initial.firstName}
            showOnWebsite={showOnWebsite}
            onShowChange={setShowOnWebsite}
            onCaptions={(captions) =>
              setTake((t) => (t ? { ...t, captions } : t))
            }
            onTrim={(trim) => setTake((t) => (t ? { ...t, trim } : t))}
            onDeleted={() => {
              setTake(null);
              announce("Video intro deleted.");
            }}
          />
          <Tips />
        </aside>
      </div>
    </div>
  );
}

function useSupported() {
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(canRecord()), []);
  return supported;
}

// --------------------------------------------------------------------------- 1. script

function ScriptStep({
  script,
  onChange,
  onBlur,
  aiAvailable,
  supported,
  onNext,
}: {
  script: string;
  onChange: (s: string) => void;
  onBlur: () => void;
  aiAvailable: boolean;
  supported: boolean;
  onNext: () => void;
}) {
  const [length, setLength] = useState<ScriptLength>("standard");
  const [tone, setTone] = useState<ScriptTone>("friendly");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const words = wordCount(script);
  const seconds = readingSeconds(script);

  const draft = () =>
    start(async () => {
      setNotice(null);
      const result = await draftScriptAction({ length, tone });
      if (!result.ok) return setNotice({ ok: false, text: result.message });
      onChange(result.script);
      setNotice({
        ok: true,
        text:
          result.source === "ai"
            ? "Drafted from your profile. Make it sound like you, then save."
            : "A starting point from your profile. Edit it to sound like you.",
      });
    });

  return (
    <div className="space-y-5">
      <div className="bg-muted/60 flex flex-col gap-3 rounded-lg p-4 md:flex-row md:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Length
            </span>
            <Select
              value={length}
              onValueChange={(v) => setLength(v as ScriptLength)}
            >
              <SelectTrigger aria-label="Script length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCRIPT_LENGTHS).map(([id, l]) => (
                  <SelectItem key={id} value={id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Tone
            </span>
            <Select
              value={tone}
              onValueChange={(v) => setTone(v as ScriptTone)}
            >
              <SelectTrigger aria-label="Script tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCRIPT_TONES).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <Button
          variant="outline"
          onClick={draft}
          pending={pending}
          disabled={pending}
        >
          <Sparkles aria-hidden className="size-4" />
          {aiAvailable ? "Draft from my profile" : "Start from my profile"}
        </Button>
      </div>

      <div className="space-y-2">
        <label htmlFor="intro-script" className="text-sm font-medium">
          Your script
        </label>
        <Textarea
          id="intro-script"
          value={script}
          maxLength={MAX_SCRIPT_CHARS}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={10}
          className="text-base leading-7"
          placeholder="Hi, I'm …"
          aria-describedby="intro-script-meta"
        />
        <p
          id="intro-script-meta"
          className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs"
        >
          <span>
            {words} words · about {formatDuration(seconds)} to read aloud
            {seconds > 120 && (
              <span className="text-danger">
                {" "}
                · longer than the 2-minute limit
              </span>
            )}
          </span>
          <span>Leave a blank line between paragraphs for natural pauses.</span>
        </p>
        {notice && (
          <p
            role={notice.ok ? "status" : "alert"}
            className={cn(
              "text-sm",
              notice.ok ? "text-success" : "text-danger",
            )}
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!supported && (
          <p className="text-danger mr-auto text-sm">
            This browser cannot record video. Use the latest Chrome, Edge,
            Firefox or Safari.
          </p>
        )}
        <Button onClick={onNext} disabled={!supported || !script.trim()}>
          <Camera aria-hidden className="size-4" />
          Open the camera
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- 3. review

type SavePhase =
  | { step: "idle" }
  | { step: "uploading"; progress: number }
  | { step: "checking" }
  | { step: "captions" };

function ReviewStep({
  recorded,
  script,
  aiAvailable,
  onRetake,
  onSaved,
}: {
  recorded: RecordedTake;
  script: string;
  aiAvailable: boolean;
  onRetake: () => void;
  onSaved: (take: StudioTake) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // Made (and revoked) in an effect, so a remount never leaves a revoked URL behind.
  const [url, setUrl] = useState<string | null>(null);
  const [trim, setTrim] = useState<IntroTrim | null>(null);
  const [autoTrim, setAutoTrim] = useState<IntroTrim | null>(null);
  const [poster, setPoster] = useState<Blob | null>(recorded.poster);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<SavePhase>({ step: "idle" });
  const [notice, setNotice] = useState<Notice>(null);
  const cutout = recorded.background === "cutout";

  // Suggest a trim: from just before you start speaking to just after you finish.
  useEffect(() => {
    let cancelled = false;
    void soundtrackSamples(recorded.audio ?? recorded.video).then((sound) => {
      if (cancelled || !sound) return;
      const bounds = speechBounds(sound.samples, sound.sampleRate);
      const suggested = bounds && cleanTrim(bounds, recorded.duration);
      if (!suggested) return;
      setTrim(suggested);
      setAutoTrim(suggested);
    });
    return () => {
      cancelled = true;
    };
  }, [recorded]);

  useEffect(() => {
    const u = URL.createObjectURL(recorded.video);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [recorded.video]);
  useEffect(() => {
    if (!poster) return setPosterUrl(null);
    const u = URL.createObjectURL(poster);
    setPosterUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [poster]);

  const busy = phase.step !== "idle";

  async function save() {
    setNotice(null);
    const withPoster = Boolean(poster);
    setPhase({ step: "uploading", progress: 0 });
    const begun = await beginUploadAction({
      mimeType: recorded.mimeType,
      byteSize: recorded.video.size,
      duration: recorded.duration,
      withPoster,
    });
    if (!begun.ok) {
      setPhase({ step: "idle" });
      return setNotice({ ok: false, text: begun.message });
    }
    const { ticket } = begun;
    try {
      const type = recorded.video.type || recorded.mimeType.split(";")[0]!;
      if (poster && ticket.posterUploadUrl)
        await uploadWithProgress(ticket.posterUploadUrl, poster, "image/jpeg");
      await uploadWithProgress(
        ticket.videoUploadUrl,
        recorded.video,
        type,
        (p) => setPhase({ step: "uploading", progress: p }),
      );
    } catch {
      setPhase({ step: "idle" });
      return setNotice({
        ok: false,
        text: "The upload did not finish. Check your connection and try again.",
      });
    }
    setPhase({ step: "checking" });
    const done = await completeUploadAction({
      videoId: ticket.videoId,
      mimeType: recorded.mimeType,
      duration: recorded.duration,
      hasPoster: Boolean(poster && ticket.posterUploadUrl),
      script,
      background: recorded.background,
      trim,
    });
    if (!done.ok) {
      setPhase({ step: "idle" });
      return setNotice({ ok: false, text: done.message });
    }

    let saved = done.take;
    if (aiAvailable) {
      setPhase({ step: "captions" });
      const wav = await soundtrackWav(recorded.audio ?? recorded.video);
      if (wav) {
        const form = new FormData();
        form.append("audio", wav, "intro.wav");
        const captioned = await captionAction(form);
        if (captioned.ok) saved = { ...saved, captions: captioned.captions };
      }
    }
    setPhase({ step: "idle" });
    onSaved(saved);
  }

  return (
    <div className="space-y-4">
      <div
        className={`overflow-hidden rounded-2xl ${cutout ? CUTOUT_BACKDROP : "bg-neutral-950"}`}
      >
        {url && (
          <IntroVideoPlayer
            key={`${url}:${posterUrl ?? "none"}`}
            intro={{
              videoUrl: url,
              posterUrl: posterUrl ?? undefined,
              type:
                recorded.video.type === "video/mp4"
                  ? "video/mp4"
                  : "video/webm",
              duration: recorded.duration,
              ...(recorded.background !== "none"
                ? { background: recorded.background }
                : {}),
              ...(trim ? { trim } : {}),
            }}
            name="Your recording"
            layout="framed"
            track={false}
            videoRef={video}
          />
        )}
      </div>
      <TrimEditor
        duration={recorded.duration}
        trim={trim}
        onChange={setTrim}
        video={video}
        disabled={busy}
      />
      {autoTrim && trim === autoTrim && (
        <p className="text-muted-foreground -mt-2 text-xs leading-5">
          Trimmed {formatPrecise(autoTrim.start)} before you start speaking and{" "}
          {formatPrecise(recorded.duration - autoTrim.end)} after you finish.
          Drag the handles to change it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="tabular-nums">
          {formatDuration(trim ? trim.end - trim.start : recorded.duration)}
        </span>
        <span className="text-muted-foreground">
          {formatBytes(recorded.video.size)}
        </span>
        <span className="text-muted-foreground flex items-center gap-2">
          Cover image
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt="Cover frame"
              className={`h-9 w-16 rounded object-cover ${cutout ? "object-top" : ""}`}
            />
          ) : (
            "none"
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (!video.current) return;
            const frame = await frameToJpeg(video.current);
            if (frame) setPoster(frame);
          }}
        >
          Use current frame as cover
        </Button>
      </div>

      {busy && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm">
            {phase.step === "uploading" &&
              `Uploading… ${Math.round(phase.progress * 100)}%`}
            {phase.step === "checking" && "Checking your video…"}
            {phase.step === "captions" && "Adding captions…"}
          </p>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-foreground h-full rounded-full transition-[width]"
              style={{
                width:
                  phase.step === "uploading"
                    ? `${Math.round(phase.progress * 90)}%`
                    : phase.step === "checking"
                      ? "93%"
                      : "97%",
              }}
            />
          </div>
        </div>
      )}
      {notice && (
        <p role="alert" className="text-danger text-sm">
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onRetake} disabled={busy}>
          Record again
        </Button>
        <Button onClick={() => void save()} busy={busy} disabled={busy}>
          <Check aria-hidden className="size-4" />
          Use this take
        </Button>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        Saving replaces your previous intro. Nothing appears on your website
        until you publish it.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------- current intro

function CurrentIntro({
  take,
  name,
  showOnWebsite,
  onShowChange,
  onCaptions,
  onTrim,
  onDeleted,
}: {
  take: StudioTake | null;
  name: string;
  showOnWebsite: boolean;
  onShowChange: (v: boolean) => void;
  onCaptions: (c: CaptionCue[]) => void;
  onTrim: (trim: IntroTrim | null) => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  /** While trimming: the draft (undefined = not trimming). */
  const [draftTrim, setDraftTrim] = useState<IntroTrim | null | undefined>();
  const video = useRef<HTMLVideoElement>(null);
  const trimming = draftTrim !== undefined;
  const shownTrim = trimming ? draftTrim : take?.trim;
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  if (!take)
    return (
      <div className="border-border bg-card rounded-lg border p-5">
        <div className="bg-muted text-muted-foreground mb-4 flex aspect-video items-center justify-center rounded-lg">
          <Video aria-hidden className="size-8" />
        </div>
        <p className="font-medium">No intro yet</p>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Your saved take appears here, ready to show on your website.
        </p>
      </div>
    );

  return (
    <div className="border-border bg-card space-y-4 rounded-lg border p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Your intro</p>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatDuration(take.duration)} · {formatBytes(take.byteSize)}
        </span>
      </div>
      {take.videoUrl ? (
        <div
          className={
            take.background === "cutout"
              ? `overflow-hidden rounded-lg ${CUTOUT_BACKDROP}`
              : "[&_video]:rounded-lg"
          }
        >
          <IntroPlayer
            key={take.videoId}
            intro={{
              videoUrl: take.videoUrl,
              posterUrl: take.posterUrl ?? undefined,
              type: take.contentType,
              duration: take.duration,
              captions: take.captions.length ? take.captions : undefined,
              ...(take.background !== "none"
                ? { background: take.background }
                : {}),
              ...(shownTrim ? { trim: shownTrim } : {}),
            }}
            name={name}
            track={false}
            videoRef={video}
          />
        </div>
      ) : (
        <p className="text-danger text-sm">We could not load your video.</p>
      )}

      {take.videoUrl &&
        (trimming ? (
          <div className="space-y-3">
            <TrimEditor
              duration={take.duration}
              trim={draftTrim}
              onChange={setDraftTrim}
              video={video}
              disabled={pending}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setDraftTrim(undefined)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                busy={pending}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveTrimAction(draftTrim);
                    if (!r.ok) return setNotice({ ok: false, text: r.message });
                    onTrim(r.take.trim);
                    setDraftTrim(undefined);
                    setNotice({
                      ok: true,
                      text: "Trim saved. It reaches your website the next time you publish.",
                    });
                  })
                }
              >
                Save trim
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground text-xs tabular-nums">
              {take.trim
                ? `Plays ${formatPrecise(take.trim.start)} – ${formatPrecise(take.trim.end)}`
                : "Plays the whole take"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraftTrim(take.trim)}
            >
              <Scissors aria-hidden className="size-3.5" />
              Trim
            </Button>
          </div>
        ))}

      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Show on my website</span>
          <span className="text-muted-foreground block text-xs leading-5">
            Adds a “Watch intro” button to your photo the next time you publish.
          </span>
        </span>
        <Switch
          className="mt-0.5"
          checked={showOnWebsite}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            onShowChange(next);
            start(async () => {
              const r = await setShowOnWebsiteAction(next);
              if (!r.ok) {
                onShowChange(!next);
                setNotice({ ok: false, text: r.message });
              }
            });
          }}
        />
      </label>

      <div className="border-border space-y-2 border-t pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Captions aria-hidden className="size-4" />
          Captions
        </p>
        <p className="text-muted-foreground text-xs leading-5">
          {take.captions.length
            ? `${take.captions.length} captions, shown by default. Fix any word that came out wrong.`
            : "No captions for this take."}
        </p>
        {take.captions.length > 0 && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit captions
          </Button>
        )}
        {editing && (
          <CaptionEditor
            cues={take.captions}
            onCancel={() => setEditing(false)}
            onSaved={(c) => {
              onCaptions(c);
              setEditing(false);
              setNotice({ ok: true, text: "Captions saved." });
            }}
          />
        )}
      </div>

      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={cn("text-sm", notice.ok ? "text-success" : "text-danger")}
        >
          {notice.text}
        </p>
      )}

      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Link
          href="/website"
          className="text-accent text-sm font-medium underline-offset-4 hover:underline"
        >
          Publish on my website →
        </Link>
        <Button
          variant="destructive-outline"
          size="sm"
          onClick={() => setConfirm(true)}
        >
          <Trash2 aria-hidden className="size-3.5" />
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete your video intro?"
        description="The recording is removed from your account. Your script is kept. A website you already published keeps showing the video until you publish again."
        confirmLabel="Delete video"
        tone="danger"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const r = await deleteIntroAction();
            setConfirm(false);
            if (r.ok) onDeleted();
            else setNotice({ ok: false, text: r.message });
          })
        }
      />
    </div>
  );
}

function CaptionEditor({
  cues,
  onCancel,
  onSaved,
}: {
  cues: CaptionCue[];
  onCancel: () => void;
  onSaved: (c: CaptionCue[]) => void;
}) {
  const [draft, setDraft] = useState(cues);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {draft.map((cue, i) => (
          <li key={`${cue.start}-${i}`} className="flex items-start gap-2">
            <span className="text-muted-foreground mt-2 w-9 shrink-0 text-[11px] tabular-nums">
              {formatDuration(cue.start)}
            </span>
            <Textarea
              aria-label={`Caption at ${formatDuration(cue.start)}`}
              value={cue.text}
              rows={2}
              maxLength={240}
              className="min-h-0 text-sm"
              onChange={(e) =>
                setDraft((d) =>
                  d.map((c, j) =>
                    j === i ? { ...c, text: e.target.value } : c,
                  ),
                )
              }
            />
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          pending={pending}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCaptionsAction(
                draft.filter((c) => c.text.trim()),
              );
              if (r.ok) onSaved(r.captions);
              else setError(r.message);
            })
          }
        >
          Save captions
        </Button>
      </div>
    </div>
  );
}

function Tips() {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <p className="font-medium">Tips for a good take</p>
      <ul className="text-muted-foreground mt-3 space-y-2 text-sm leading-6">
        <li>Face a window or a lamp, so the light falls on your face.</li>
        <li>Put the camera at eye level and look at it, not at yourself.</li>
        <li>Use a quiet room. Earphones with a mic help a lot.</li>
        <li>
          Practise once with the teleprompter, then record. Smile at the start.
        </li>
        <li>Keep it under a minute: people watch short intros to the end.</li>
      </ul>
    </div>
  );
}
