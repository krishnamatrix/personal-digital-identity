"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  BookOpen,
  Eye,
  KeyRound,
  MessageSquareText,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ACCESS_POLICY_LABELS,
  describeAccess,
  STATUS_LABELS,
  type CardStatus,
} from "@/domains/chatcards/chat-card-schema";
import type { OwnerCardSummary } from "@/domains/chatcards/chat-card-service";
import { changeChatCardStatusAction } from "@/app/chatcards/actions";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<CardStatus, string> = {
  draft: "bg-muted text-foreground",
  active: "border-success/30 bg-success/10 text-success",
  paused: "bg-amber-50 text-amber-900 border-amber-200",
  expired: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <Badge className={cn(STATUS_TONE[status])} data-testid="chat-card-status">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-xl tabular-nums">{value}</p>
      <p className="text-muted-foreground truncate text-xs">{label}</p>
    </div>
  );
}

function EmptyState() {
  const steps = [
    {
      icon: Plus,
      title: "Create a card",
      text: "Give it a title, a welcome message and the name people will see.",
    },
    {
      icon: KeyRound,
      title: "Choose who can reach you",
      text: "Anyone with the link, people you approve, or holders of an activation code.",
    },
    {
      icon: Share2,
      title: "Share the link or QR code",
      text: "On a slide, your website, a badge, or printed inside a book.",
    },
  ];
  return (
    <div
      className="border-border bg-card rounded-[20px] border p-6 md:p-8"
      data-testid="chatcards-empty"
    >
      <BookOpen aria-hidden className="size-6" />
      <h2 className="font-display mt-3 text-xl">No ChatCards yet</h2>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
        A ChatCard is an invitation to a private conversation with you. People
        who use it can write to you here, without ever seeing your email, phone
        number or social accounts.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="bg-muted/50 rounded-2xl p-4">
            <p className="text-muted-foreground text-xs font-medium">
              Step {i + 1}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
              <Icon aria-hidden className="size-4" />
              {title}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {text}
            </p>
          </li>
        ))}
      </ol>
      <Button asChild className="mt-6">
        <Link href="/chatcards/new">
          <Plus aria-hidden className="size-4" /> Create your first ChatCard
        </Link>
      </Button>
    </div>
  );
}

export function ChatCardsDashboard({ cards }: { cards: OwnerCardSummary[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [archiving, setArchiving] = useState<OwnerCardSummary | null>(null);
  const [filter, setFilter] = useState<"current" | "archived">("current");

  const shown = cards.filter((c) =>
    filter === "archived" ? c.status === "archived" : c.status !== "archived",
  );
  const archivedCount = cards.filter((c) => c.status === "archived").length;

  function change(card: OwnerCardSummary, to: "pause" | "resume" | "archive") {
    start(async () => {
      const r = await changeChatCardStatusAction(card.id, to);
      setMessage({ ok: r.ok, text: r.message ?? "" });
      setArchiving(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-6" data-testid="chatcards-dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My connections</p>
          <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
            ChatCards
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Share access to a conversation, not your personal information.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/messages">
              <MessageSquareText aria-hidden className="size-4" /> Messages
            </Link>
          </Button>
          <Button asChild>
            <Link href="/chatcards/new">
              <Plus aria-hidden className="size-4" /> New ChatCard
            </Link>
          </Button>
        </div>
      </header>

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

      {cards.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {archivedCount > 0 && (
            <div className="flex gap-2" role="group" aria-label="Show">
              <Button
                size="sm"
                variant={filter === "current" ? "default" : "outline"}
                onClick={() => setFilter("current")}
                aria-pressed={filter === "current"}
              >
                Current
              </Button>
              <Button
                size="sm"
                variant={filter === "archived" ? "default" : "outline"}
                onClick={() => setFilter("archived")}
                aria-pressed={filter === "archived"}
              >
                Archived ({archivedCount})
              </Button>
            </div>
          )}
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Your ChatCards">
            {shown.map((card) => (
              <li
                key={card.id}
                className="border-border bg-card flex min-w-0 flex-col rounded-[20px] border p-5"
                data-testid="chat-card-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      <Link
                        href={`/chatcards/${card.id}`}
                        className="hover:underline"
                      >
                        {card.title}
                      </Link>
                    </h2>
                    {card.description && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-6">
                        {card.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={card.effective} />
                </div>
                <dl className="text-muted-foreground mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="sr-only">Access</dt>
                    <dd>
                      {ACCESS_POLICY_LABELS[card.accessPolicy].title} ·{" "}
                      {describeAccess(card).split(" · ")[1]}
                    </dd>
                  </div>
                  {card.personaName && (
                    <div className="flex gap-1">
                      <dt>Persona:</dt>
                      <dd className="truncate">{card.personaName}</dd>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <dt>Created</dt>
                    <dd>{day(card.createdAt)}</dd>
                  </div>
                  {card.expiresAt && (
                    <div className="flex gap-1">
                      <dt>Expires</dt>
                      <dd>{day(card.expiresAt)}</dd>
                    </div>
                  )}
                </dl>
                <div className="border-border mt-4 grid grid-cols-4 gap-3 border-t pt-4">
                  <Stat label="Visits" value={card.stats.views} />
                  <Stat
                    label={
                      card.accessPolicy === "verified"
                        ? "Redeemed"
                        : "QR visits"
                    }
                    value={
                      card.accessPolicy === "verified"
                        ? card.stats.redemptions
                        : card.stats.qrVisits
                    }
                  />
                  <Stat label="Waiting" value={card.stats.pending} />
                  <Stat label="Active" value={card.stats.active} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/chatcards/${card.id}?tab=edit`}>
                      <Pencil aria-hidden className="size-3.5" /> Edit
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/chatcards/${card.id}?tab=preview`}>
                      <Eye aria-hidden className="size-3.5" /> Preview
                    </Link>
                  </Button>
                  {card.status !== "draft" && card.status !== "archived" && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/chatcards/${card.id}?tab=share`}>
                        <Share2 aria-hidden className="size-3.5" /> Share
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href="/messages">
                      <MessageSquareText aria-hidden className="size-3.5" />{" "}
                      Conversations
                    </Link>
                  </Button>
                  {card.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => change(card, "pause")}
                    >
                      <Pause aria-hidden className="size-3.5" /> Pause
                    </Button>
                  )}
                  {card.status === "paused" && card.effective !== "expired" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => change(card, "resume")}
                    >
                      <Play aria-hidden className="size-3.5" /> Resume
                    </Button>
                  )}
                  {card.status === "draft" && (
                    <Button asChild size="sm">
                      <Link href={`/chatcards/${card.id}?tab=preview`}>
                        Publish…
                      </Link>
                    </Button>
                  )}
                  {card.status !== "archived" && card.status !== "draft" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setArchiving(card)}
                    >
                      <Archive aria-hidden className="size-3.5" /> Archive
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive this ChatCard?"
        description="Its link stops working for new visitors and no new conversations can start. Existing conversations stay in Messages. Archiving cannot be undone."
        confirmLabel="Archive"
        tone="danger"
        pending={pending}
        onConfirm={() => archiving && change(archiving, "archive")}
      />
    </section>
  );
}
