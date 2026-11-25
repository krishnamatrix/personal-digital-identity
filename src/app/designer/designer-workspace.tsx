"use client";

import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import { Textarea } from "@/components/ui/textarea";
import {
  PROMPT_MAX,
  PROMPT_MIN,
  type FolioDesignerProposal,
} from "@/domains/folio-designer/folio-designer-schema";
import { DesignerPreviewPanel } from "@/app/designer/designer-preview-panel";
import { publishFolioDesignerAction } from "@/app/designer/actions";

export function DesignerWorkspace({
  siteSlug = null,
}: {
  siteSlug?: string | null;
}) {
  const promptId = useId();
  const disclosureId = useId();
  const { announcements, announce } = useAnnouncer();
  const [prompt, setPrompt] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [promptOpen, setPromptOpen] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressChars, setProgressChars] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<FolioDesignerProposal | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [needsAddress, setNeedsAddress] = useState(false);

  const proposalStale = Boolean(proposal && promptDirty);
  const promptTrimmed = prompt.trim();
  const promptValid =
    promptTrimmed.length >= PROMPT_MIN && promptTrimmed.length <= PROMPT_MAX;

  async function onGenerate() {
    setError(null);
    if (!promptValid) {
      const msg =
        promptTrimmed.length < PROMPT_MIN
          ? `Describe your design in at least ${PROMPT_MIN} characters.`
          : `Keep your prompt under ${PROMPT_MAX.toLocaleString()} characters.`;
      setError(msg);
      announce(msg, "assertive");
      return;
    }
    setGenerating(true);
    setProgressChars(0);
    setPublishedSlug(null);
    setPublishError(null);
    setNeedsAddress(false);
    try {
      const res = await fetch("/api/llm/folio-designer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({ prompt: promptTrimmed }),
        cache: "no-store",
      });

      const contentType = res.headers?.get?.("content-type") ?? "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "message";
        let finalProposal: FolioDesignerProposal | null = null;
        let streamError: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            eventName = "message";
            let dataLine = "";
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLine += line.slice(5).trim();
              }
            }
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine) as {
              chars?: number;
              ok?: boolean;
              data?: FolioDesignerProposal;
              message?: string;
            };
            if (eventName === "progress" && typeof payload.chars === "number") {
              setProgressChars(payload.chars);
            } else if (eventName === "done" && payload.ok && payload.data) {
              finalProposal = payload.data;
            } else if (eventName === "error") {
              streamError = payload.message ?? "Generation failed. Try again.";
            }
          }
        }

        if (streamError) throw new Error(streamError);
        if (!finalProposal) {
          throw new Error("Generation ended without a design. Try again.");
        }
        setProposal(finalProposal);
        setPromptDirty(false);
        setPromptOpen(false);
        announce("Design preview ready.");
        return;
      }

      const json = (await res.json()) as {
        ok?: boolean;
        data?: FolioDesignerProposal;
        message?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.message ?? "Generation failed. Try again.");
      }
      setProposal(json.data);
      setPromptDirty(false);
      setPromptOpen(false);
      announce("Design preview ready.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(msg);
      announce(msg, "assertive");
    } finally {
      setGenerating(false);
    }
  }

  async function onPublish() {
    if (!proposal || proposalStale) return;
    setPublishing(true);
    setPublishError(null);
    setPublishedSlug(null);
    setNeedsAddress(false);
    try {
      const result = await publishFolioDesignerAction({
        html: proposal.html,
        title: proposal.title,
      });
      if (!result.ok) {
        setPublishError(result.message);
        setNeedsAddress(Boolean(result.needsAddress));
        announce(result.message, "assertive");
        return;
      }
      setPublishedSlug(result.slug ?? siteSlug ?? null);
      announce(result.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LiveRegions announcements={announcements} />
      <header className="space-y-2">
        <p className="eyebrow text-muted-foreground">My presence</p>
        <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
          Folio Designer
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">
          Paste any design prompt or full page specification. Folio Designer
          generates a standalone interactive design populated with your saved
          Folioone identity—preview it live, inspect responsive views, or
          download the HTML. Nothing publishes automatically.
        </p>
      </header>

      <section className="border-border bg-card rounded-2xl border p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={promptId} className="text-sm font-medium">
            Design prompt
          </label>
          {proposal ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPromptOpen((open) => !open)}
            >
              {promptOpen ? (
                <>
                  <ChevronUp className="size-4" aria-hidden />
                  Hide prompt
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" aria-hidden />
                  Edit prompt ({promptTrimmed.length.toLocaleString()} chars)
                </>
              )}
            </Button>
          ) : null}
        </div>

        {promptOpen ? (
          <div className="mt-3 space-y-4">
            <Textarea
              id={promptId}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptDirty(true);
                setError(null);
              }}
              rows={10}
              maxLength={PROMPT_MAX}
              placeholder="Paste a detailed visual/layout prompt or describe the portfolio page you want built with your Folioone identity..."
              aria-describedby={disclosureId}
              className="font-mono text-xs leading-5"
            />
            <p
              id={disclosureId}
              className="text-muted-foreground text-xs leading-5"
            >
              Generating sends your prompt and a bounded summary of your saved
              Folioone identity (profile, experience, projects, skills, and
              published articles) to the configured AI provider.{" "}
              {promptTrimmed.length.toLocaleString()}/
              {PROMPT_MAX.toLocaleString()}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onGenerate()}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {generating
                  ? progressChars > 0
                    ? `Generating design… (${progressChars.toLocaleString()} chars)`
                    : "Generating design…"
                  : "Generate design"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPrompt("");
                  setPromptDirty(false);
                  setProposal(null);
                  setError(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive mt-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="space-y-4" aria-live="polite">
        {proposalStale ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your prompt changed after this preview was generated. Click{" "}
            <strong>Generate design</strong> to refresh the preview.
          </p>
        ) : null}

        {!proposal ? (
          <div className="border-border bg-card text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center text-sm">
            <Wand2 className="size-8 opacity-40" aria-hidden />
            <p>
              Paste your design prompt above and click{" "}
              <strong>Generate design</strong> to see a full live preview here.
            </p>
          </div>
        ) : (
          <DesignerPreviewPanel
            title={proposal.title}
            html={proposal.html}
            identityFieldsUsed={proposal.identityFieldsUsed}
            siteSlug={siteSlug}
            stale={proposalStale}
            publishing={publishing}
            publishedSlug={publishedSlug}
            publishError={publishError}
            needsAddress={needsAddress}
            onPublish={() => void onPublish()}
          />
        )}
      </section>
    </div>
  );
}
