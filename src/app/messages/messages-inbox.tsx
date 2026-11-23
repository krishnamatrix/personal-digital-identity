"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox as InboxIcon, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  Inbox,
  InboxItem,
} from "@/domains/chatcards/conversation-service";
import { cn } from "@/lib/utils";

type Filter = "requests" | "active" | "closed";

const STATUS_TEXT: Record<InboxItem["status"], string> = {
  requested: "Request",
  active: "Active",
  declined: "Declined",
  closed: "Closed",
};

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ item }: { item: InboxItem }) {
  const at = item.lastMessage?.at ?? item.createdAt;
  return (
    <li>
      <Link
        href={`/messages/${item.id}`}
        className="hover:bg-muted/60 flex gap-3 rounded-2xl px-3 py-3 sm:px-4"
        data-testid="inbox-row"
      >
        <span
          aria-hidden
          className={cn(
            "mt-2 size-2 shrink-0 rounded-full",
            item.unread ? "bg-accent" : "bg-transparent",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "truncate text-sm",
                item.unread ? "font-semibold" : "font-medium",
              )}
            >
              {item.counterpart}
            </span>
            <time
              className="text-muted-foreground shrink-0 text-xs tabular-nums"
              dateTime={at}
            >
              {when(at)}
            </time>
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {item.cardTitle}
            {item.status !== "active" && <> · {STATUS_TEXT[item.status]}</>}
          </span>
          {item.lastMessage && (
            <span className="mt-0.5 block truncate text-sm">
              {item.lastMessage.fromMe ? "You: " : ""}
              {item.lastMessage.body}
            </span>
          )}
        </span>
        {item.unread && <span className="sr-only">Unread</span>}
      </Link>
    </li>
  );
}

export function MessagesInbox({
  inbox,
  initialView,
}: {
  inbox: Inbox;
  initialView: "received" | "started" | null;
}) {
  const hasReceived = inbox.received.length > 0 || inbox.ownerEntitled;
  const [view, setView] = useState<"received" | "started">(
    initialView ?? (hasReceived ? "received" : "started"),
  );
  const [filter, setFilter] = useState<Filter>(
    inbox.received.some((i) => i.status === "requested")
      ? "requests"
      : "active",
  );
  const counts = {
    requests: inbox.received.filter((i) => i.status === "requested").length,
    active: inbox.received.filter((i) => i.status === "active").length,
    closed: inbox.received.filter(
      (i) => i.status === "declined" || i.status === "closed",
    ).length,
  };
  const received = inbox.received.filter((i) =>
    filter === "requests"
      ? i.status === "requested"
      : filter === "active"
        ? i.status === "active"
        : i.status === "declined" || i.status === "closed",
  );
  const list = view === "received" ? received : inbox.started;
  const unread = (items: InboxItem[]) => items.filter((i) => i.unread).length;

  return (
    <section className="max-w-3xl space-y-6" data-testid="messages-inbox">
      <header>
        <p className="eyebrow">My connections</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          Messages
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Private conversations through ChatCards. Nobody sees your email or
          phone number.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Conversations"
        className="bg-muted inline-flex gap-1 rounded-full p-1"
      >
        {(
          [
            ["received", `Through my ChatCards`, unread(inbox.received)],
            ["started", "Started by me", unread(inbox.started)],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium",
              view === id
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {n > 0 && (
              <Badge className="bg-accent ml-2 border-0 px-1.5 py-0 text-white">
                {n}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {view === "received" && !inbox.ownerEntitled && (
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
          <p className="text-muted-foreground">
            {inbox.received.length
              ? "Your PRO period has ended. These conversations stay readable; renew to accept requests and reply."
              : "Create ChatCards with Folioone PRO to receive conversations here."}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing?from=chatcards">See PRO plans</Link>
          </Button>
        </div>
      )}

      {view === "received" && inbox.received.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
          {(
            [
              ["requests", "New requests"],
              ["active", "Active"],
              ["closed", "Closed"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={filter === id ? "default" : "outline"}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label} ({counts[id]})
            </Button>
          ))}
        </div>
      )}

      <div className="border-border bg-card rounded-[20px] border p-2">
        {list.length ? (
          <ul aria-label="Conversation list">
            {list.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        ) : (
          <div
            className="flex flex-col items-center px-6 py-12 text-center"
            data-testid="inbox-empty"
          >
            {view === "received" ? (
              <InboxIcon aria-hidden className="size-6" />
            ) : (
              <MessageSquareText aria-hidden className="size-6" />
            )}
            <p className="mt-3 text-sm font-medium">
              {view === "received"
                ? filter === "requests"
                  ? "No requests waiting"
                  : "Nothing here yet"
                : "You have not started any conversations"}
            </p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-6">
              {view === "received"
                ? "When someone writes through one of your ChatCards, it appears here."
                : "When you write to someone through their ChatCard link or QR code, the conversation appears here."}
            </p>
            {view === "received" && inbox.ownerEntitled && (
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href="/chatcards">Your ChatCards</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
