"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  Ban,
  KeyRound,
  Pause,
  Play,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatCardFace } from "@/components/chatcards/chat-card-face";
import {
  ACCESS_POLICY_LABELS,
  describeAccess,
  LIMITS,
} from "@/domains/chatcards/chat-card-schema";
import type {
  BatchView,
  CodeState,
  EditorContext,
  IssuedBatch,
  OwnerCardSummary,
} from "@/domains/chatcards/chat-card-service";
import {
  changeChatCardStatusAction,
  generateCodesAction,
  revokeCodesAction,
} from "@/app/chatcards/actions";
import { ChatCardEditForm } from "@/app/chatcards/chat-card-editor";
import { ChatCardShare } from "@/app/chatcards/chat-card-share";
import { IssuedCodes } from "@/app/chatcards/issued-codes";
import { StatusBadge } from "@/app/chatcards/chatcards-dashboard";
import { cn } from "@/lib/utils";

export type ManagerTab = "overview" | "edit" | "preview" | "share" | "codes";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <p className="font-display text-2xl tabular-nums">{value}</p>
      <p className="text-sm">{label}</p>
      {note && (
        <p className="text-muted-foreground mt-1 text-xs leading-5">{note}</p>
      )}
    </div>
  );
}

const STATE_LABEL: Record<CodeState, string> = {
  unused: "Unused",
  in_use: "Partly used",
  used: "Used",
  revoked: "Revoked",
  expired: "Expired",
};

function CodesPanel({
  card,
  batches,
  origin,
}: {
  card: OwnerCardSummary;
  batches: BatchView[];
  origin: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<IssuedBatch | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [revoking, setRevoking] = useState<BatchView | null>(null);
  const [form, setForm] = useState({
    label: `Batch ${batches.length + 1}`,
    count: "50",
    singleUse: true,
    uses: "2",
    expiresOn: "",
  });
  const archived = card.status === "archived";

  return (
    <div className="space-y-6">
      {issued && (
        <IssuedCodes
          batch={issued}
          cardTitle={card.title}
          url={`${origin}/chat/${card.publicId}`}
          onDismiss={() => setIssued(null)}
        />
      )}
      {!archived && (
        <form
          className="border-border bg-card space-y-4 rounded-[20px] border p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            start(async () => {
              const r = await generateCodesAction(card.id, {
                label: form.label,
                count: Number.parseInt(form.count, 10) || 0,
                usesPerCode: form.singleUse
                  ? 1
                  : Number.parseInt(form.uses, 10) || 2,
                expiresOn: form.expiresOn,
              });
              if (r.ok) {
                setIssued(r.data);
                router.refresh();
              } else setMessage({ ok: false, text: r.message });
            });
          }}
        >
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound aria-hidden className="size-4" /> Generate activation
            codes
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="batch-label" className="text-sm font-medium">
                Batch name
              </label>
              <Input
                id="batch-label"
                value={form.label}
                maxLength={LIMITS.batchLabel}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="batch-count" className="text-sm font-medium">
                Number of codes
              </label>
              <Input
                id="batch-count"
                type="number"
                min={1}
                max={LIMITS.batchSize}
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="batch-expiry" className="text-sm font-medium">
                Expire (optional)
              </label>
              <DatePicker
                id="batch-expiry"
                value={form.expiresOn}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(v) => setForm({ ...form, expiresOn: v })}
                placeholder="Never"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.singleUse}
                onChange={(e) =>
                  setForm({ ...form, singleUse: e.target.checked })
                }
                aria-label="Each code works once"
              />
              Each code works once
            </label>
            {!form.singleUse && (
              <label className="flex items-center gap-2 text-sm">
                People per code
                <Input
                  type="number"
                  min={2}
                  max={LIMITS.usesPerCode}
                  value={form.uses}
                  onChange={(e) => setForm({ ...form, uses: e.target.value })}
                  className="w-20"
                />
              </label>
            )}
          </div>
          {message && (
            <p role="alert" className="text-danger text-sm">
              {message.text}
            </p>
          )}
          <Button type="submit" pending={pending}>
            Generate codes
          </Button>
        </form>
      )}

      {batches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No codes yet.</p>
      ) : (
        <ul className="space-y-4" aria-label="Code batches">
          {batches.map((b) => {
            const revocable = b.counts.unused + b.counts.in_use;
            return (
              <li
                key={b.id}
                className="border-border bg-card rounded-[20px] border p-5"
                data-testid="code-batch"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{b.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {b.codes.length} codes ·{" "}
                      {b.maxUses === 1
                        ? "single use"
                        : `${b.maxUses} people each`}{" "}
                      · created {day(b.createdAt)}
                      {b.expiresAt ? ` · expires ${day(b.expiresAt)}` : ""}
                    </p>
                  </div>
                  {!archived && revocable > 0 && (
                    <Button
                      size="sm"
                      variant="destructive-outline"
                      onClick={() => setRevoking(b)}
                    >
                      <Ban aria-hidden className="size-3.5" /> Revoke unused (
                      {revocable})
                    </Button>
                  )}
                </div>
                <p
                  className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                  data-testid="code-batch-counts"
                >
                  {(Object.keys(STATE_LABEL) as CodeState[]).map((s) =>
                    b.counts[s] ? (
                      <span key={s}>
                        {STATE_LABEL[s]}:{" "}
                        <span className="tabular-nums">{b.counts[s]}</span>
                      </span>
                    ) : null,
                  )}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">
                    Codes by their last four characters
                  </summary>
                  <ul className="mt-2 grid gap-1 font-mono text-xs sm:grid-cols-3">
                    {b.codes.map((c) => (
                      <li
                        key={c.id}
                        className="odd:bg-muted/50 flex justify-between gap-2 rounded-md px-2 py-1"
                      >
                        <span>…{c.hint}</span>
                        <span className="text-muted-foreground font-sans">
                          {STATE_LABEL[c.state]}
                          {c.maxUses > 1 ? ` ${c.uses}/${c.maxUses}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-muted-foreground text-xs leading-5">
        Codes are stored only as fingerprints, so lost codes cannot be shown
        again: revoke them and generate new ones. Redemption history is kept for
        your records.
      </p>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke the unused codes in this batch?"
        description="They stop working at once. People who already redeemed a code keep their access."
        confirmLabel="Revoke"
        tone="danger"
        pending={pending}
        onConfirm={() =>
          revoking &&
          start(async () => {
            const r = await revokeCodesAction(card.id, {
              batchId: revoking.id,
            });
            setMessage({ ok: r.ok, text: r.message ?? "" });
            setRevoking(null);
            router.refresh();
          })
        }
      />
    </div>
  );
}

export function ChatCardManager({
  card,
  context,
  origin,
  batches,
  initialTab,
}: {
  card: OwnerCardSummary;
  context: EditorContext;
  origin: string;
  batches: BatchView[];
  initialTab: ManagerTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ManagerTab>(initialTab);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const url = `${origin}/chat/${card.publicId}`;
  const live = card.status === "active" || card.status === "paused";

  const tabs: { id: ManagerTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "edit", label: "Edit" },
    { id: "preview", label: "Preview" },
    ...(live ? [{ id: "share" as const, label: "Share" }] : []),
    ...(card.accessPolicy === "verified"
      ? [{ id: "codes" as const, label: "Activation codes" }]
      : []),
  ];

  function change(to: "publish" | "pause" | "resume" | "archive") {
    start(async () => {
      const r = await changeChatCardStatusAction(card.id, to);
      setMessage({ ok: r.ok, text: r.message ?? "" });
      setArchiveOpen(false);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="space-y-6" data-testid="chatcard-manager">
      <header className="space-y-3">
        <Link
          href="/chatcards"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> ChatCards
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl break-words md:text-[2.25rem]">
                {card.title}
              </h1>
              <StatusBadge status={card.effective} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {ACCESS_POLICY_LABELS[card.accessPolicy].title} ·{" "}
              {describeAccess(card)}
              {card.personaName ? ` · Persona: ${card.personaName}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {card.status === "draft" && (
              <Button pending={pending} onClick={() => change("publish")}>
                <Send aria-hidden className="size-4" /> Publish
              </Button>
            )}
            {card.status === "active" && (
              <Button
                variant="outline"
                pending={pending}
                onClick={() => change("pause")}
              >
                <Pause aria-hidden className="size-4" /> Pause
              </Button>
            )}
            {card.status === "paused" && (
              <Button
                variant="outline"
                pending={pending}
                onClick={() => change("resume")}
                disabled={card.effective === "expired"}
              >
                <Play aria-hidden className="size-4" /> Resume
              </Button>
            )}
            {live && (
              <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
                <Archive aria-hidden className="size-4" /> Archive
              </Button>
            )}
          </div>
        </div>
        {card.effective === "expired" && (
          <p className="text-muted-foreground text-sm">
            The invitation&rsquo;s end date has passed. Choose a later date
            under Edit to take new conversations again.
          </p>
        )}
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={cn(
              "rounded-xl border px-4 py-2.5 text-sm",
              message.ok
                ? "border-success/30 bg-success/5"
                : "border-danger/30 bg-danger-soft text-danger",
            )}
          >
            {message.text}
          </p>
        )}
      </header>

      <div
        role="tablist"
        aria-label="ChatCard sections"
        className="bg-muted inline-flex flex-wrap gap-1 rounded-full p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium",
              tab === t.id
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric
                label="Visits"
                value={card.stats.views}
                note="Last 90 days"
              />
              <Metric
                label="Unique visitors"
                value={card.stats.uniqueVisitors}
                note="Counted per day"
              />
              <Metric
                label="Opened from QR link"
                value={card.stats.qrVisits}
                note="Not proof of a physical scan"
              />
              {card.accessPolicy === "verified" && (
                <Metric label="Codes redeemed" value={card.stats.redemptions} />
              )}
              <Metric label="Waiting for you" value={card.stats.pending} />
              <Metric label="Active conversations" value={card.stats.active} />
              <Metric label="All conversations" value={card.stats.requests} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/messages">Open Messages</Link>
              </Button>
              {live && (
                <Button variant="outline" onClick={() => setTab("share")}>
                  Share
                </Button>
              )}
            </div>
          </div>
        )}
        {tab === "edit" && <ChatCardEditForm card={card} context={context} />}
        {tab === "preview" && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              This is what visitors see.{" "}
              {live ? "" : "Publish the card to make it reachable."}
            </p>
            <div className="bg-background rounded-2xl p-3 sm:p-6">
              <ChatCardFace
                title={card.title}
                hostName={card.hostName}
                description={card.description}
                welcomeMessage={card.welcomeMessage}
                coverImageUrl={card.coverImageUrl}
                accessPolicy={card.accessPolicy}
                autoAccept={card.autoAccept}
                className="mx-auto max-w-lg"
              />
            </div>
            {card.status === "draft" && (
              <Button pending={pending} onClick={() => change("publish")}>
                <Send aria-hidden className="size-4" /> Publish ChatCard
              </Button>
            )}
            {live && (
              <Button asChild variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open the live page
                </a>
              </Button>
            )}
          </div>
        )}
        {tab === "share" && live && (
          <ChatCardShare url={url} title={card.title} />
        )}
        {tab === "codes" && (
          <CodesPanel card={card} batches={batches} origin={origin} />
        )}
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this ChatCard?"
        description="Its link stops working for new visitors and no new conversations can start. Existing conversations stay in Messages. Archiving cannot be undone."
        confirmLabel="Archive"
        tone="danger"
        pending={pending}
        onConfirm={() => change("archive")}
      />
    </section>
  );
}
