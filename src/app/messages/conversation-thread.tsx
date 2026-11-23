"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Flag,
  KeyRound,
  LogOut,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LIMITS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/domains/chatcards/chat-card-schema";
import type {
  ChatMessage,
  ConversationAction,
  ConversationView,
} from "@/domains/chatcards/conversation-service";
import {
  changeConversationAction,
  markReadAction,
  olderMessagesAction,
  pollMessagesAction,
  reportConversationAction,
  sendMessageAction,
} from "@/app/messages/actions";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;

const BLOCK_TEXT: Record<NonNullable<ConversationView["sendBlock"]>, string> = {
  requested: "",
  awaiting_reply: "You can send another message once they reply.",
  closed: "This conversation is closed.",
  owner_lapsed:
    "This conversation is paused by its host for now. Your messages are kept.",
  pro_required:
    "Your PRO period has ended. Renew to reply; the conversation is kept.",
};

function time(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

function closedText(view: ConversationView) {
  if (view.status === "declined")
    return view.role === "owner"
      ? "You declined this request."
      : "This request was declined.";
  if (view.closeReason === "blocked")
    return "This conversation was closed with a block.";
  if (view.closeReason === "left")
    return view.role === "recipient"
      ? "You left this conversation."
      : `${view.counterpart} left this conversation.`;
  return view.closedBy === (view.role === "owner" ? "owner" : "recipient")
    ? "You closed this conversation."
    : "This conversation was closed.";
}

export function ConversationThread({ view }: { view: ConversationView }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(view.messages);
  const [hasOlder, setHasOlder] = useState(view.hasOlder);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<ConversationAction | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [awaitingReply, setAwaitingReply] = useState(
    view.sendBlock === "awaiting_reply",
  );
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id ?? 0;
  const open = view.status === "active" || view.status === "requested";
  const sendBlock = awaitingReply
    ? "awaiting_reply"
    : view.sendBlock === "awaiting_reply"
      ? null
      : view.sendBlock;

  useEffect(() => {
    void markReadAction(view.id);
  }, [view.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Simple, reliable delivery: poll for new messages while the conversation is open.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await pollMessagesAction(view.id, lastId);
      if (stopped || !r.ok) return;
      if (r.data.messages.length) {
        setMessages((m) => {
          const seen = new Set(m.map((x) => x.id));
          return [...m, ...r.data.messages.filter((x) => !seen.has(x.id))];
        });
        if (r.data.messages.some((x) => !x.fromMe)) {
          setAwaitingReply(false);
          void markReadAction(view.id);
        }
      }
      if (r.data.status !== view.status) router.refresh();
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [view.id, view.status, lastId, open, router]);

  function act(action: ConversationAction) {
    setError(null);
    start(async () => {
      const r = await changeConversationAction(view.id, action);
      setConfirm(null);
      if (r.ok) {
        setNotice(r.message ?? null);
        router.refresh();
      } else setError(r.message);
    });
  }

  const canSend = open && sendBlock === null;

  return (
    <section
      className="flex max-w-3xl flex-col gap-4"
      data-testid="conversation"
    >
      <header className="space-y-3">
        <Link
          href="/messages"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Messages
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl md:text-3xl">
              {view.counterpart}
            </h1>
            <p className="text-muted-foreground text-sm">
              {view.role === "owner" ? "Through your ChatCard " : "ChatCard: "}
              <span className="text-foreground">{view.card.title}</span>
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Conversation options"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {open && view.role === "owner" && (
                <DropdownMenuItem onSelect={() => setConfirm("close")}>
                  <X className="size-4" /> Close conversation
                </DropdownMenuItem>
              )}
              {open && view.role === "recipient" && (
                <DropdownMenuItem onSelect={() => setConfirm("leave")}>
                  <LogOut className="size-4" /> Leave conversation
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setConfirm("block")}>
                <Ban className="size-4" /> Block {view.counterpart}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setReporting(true)}>
                <Flag className="size-4" /> Report
              </DropdownMenuItem>
              {view.role === "owner" && view.ownerCanManage && (
                <DropdownMenuItem asChild>
                  <Link href="/chatcards">Pause the ChatCard…</Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {view.role === "owner" && (
          <p
            className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            data-testid="conversation-origin"
          >
            <span>Requested {time(view.origin.requestedAt)}</span>
            {view.origin.acceptedAt && (
              <span>Accepted {time(view.origin.acceptedAt)}</span>
            )}
            {view.origin.viaCode && (
              <span className="inline-flex items-center gap-1">
                <KeyRound aria-hidden className="size-3" /> Redeemed an
                activation code
              </span>
            )}
          </p>
        )}
      </header>

      {notice && (
        <p role="status" className="text-success text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {view.status === "requested" && view.role === "owner" && (
        <div
          className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
          data-testid="request-actions"
        >
          <p className="text-sm">
            <span className="font-medium">{view.counterpart}</span> would like
            to talk.
            {view.ownerCanManage
              ? " Accept to reply."
              : " Renew PRO to accept."}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act("decline")}
            >
              Decline
            </Button>
            <Button
              size="sm"
              pending={pending}
              disabled={!view.ownerCanManage}
              onClick={() => act("accept")}
            >
              <Check aria-hidden className="size-4" /> Accept
            </Button>
          </div>
        </div>
      )}
      {view.status === "requested" && view.role === "recipient" && (
        <p
          className="bg-muted/60 rounded-2xl px-4 py-3 text-sm"
          data-testid="request-waiting"
        >
          Your request has been sent. You can write more once {view.counterpart}{" "}
          accepts it.
        </p>
      )}

      <div className="border-border bg-card rounded-[20px] border p-3 sm:p-5">
        {hasOlder && (
          <div className="mb-3 text-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await olderMessagesAction(
                    view.id,
                    messages[0]?.id ?? 1,
                  );
                  if (r.ok) {
                    setMessages((m) => [...r.data.messages, ...m]);
                    setHasOlder(r.data.hasOlder);
                  }
                })
              }
            >
              Show earlier messages
            </Button>
          </div>
        )}
        <ol
          className="space-y-3"
          aria-label="Messages"
          aria-live="polite"
          data-testid="message-list"
        >
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5",
                  m.fromMe ? "bg-foreground text-background" : "bg-muted",
                )}
              >
                <p className="text-[15px] leading-6 break-words whitespace-pre-wrap">
                  {m.body}
                </p>
                <p
                  className={cn(
                    "mt-1 text-[11px]",
                    m.fromMe ? "text-background/70" : "text-muted-foreground",
                  )}
                >
                  <span className="sr-only">
                    {m.fromMe ? "You" : view.counterpart},{" "}
                  </span>
                  <time dateTime={m.at}>{time(m.at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      {!open ? (
        <p
          className="text-muted-foreground text-center text-sm"
          data-testid="conversation-closed"
        >
          {closedText(view)}
        </p>
      ) : canSend ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const body = draft;
            start(async () => {
              const r = await sendMessageAction(view.id, body);
              if (r.ok) {
                setDraft("");
                setMessages((m) =>
                  m.some((x) => x.id === r.data.id) ? m : [...m, r.data],
                );
              } else setError(r.message);
            });
          }}
        >
          <label htmlFor="reply" className="sr-only">
            Message
          </label>
          <Textarea
            id="reply"
            rows={3}
            value={draft}
            maxLength={LIMITS.message}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                e.currentTarget.form?.requestSubmit();
            }}
            placeholder={`Write to ${view.counterpart}`}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs tabular-nums">
              {draft.length}/{LIMITS.message}
            </p>
            <Button type="submit" pending={pending} disabled={!draft.trim()}>
              Send
            </Button>
          </div>
        </form>
      ) : sendBlock && sendBlock !== "requested" ? (
        <p
          className="text-muted-foreground text-center text-sm"
          data-testid="send-blocked"
        >
          {BLOCK_TEXT[sendBlock]}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === "block"
            ? `Block ${view.counterpart}?`
            : confirm === "leave"
              ? "Leave this conversation?"
              : "Close this conversation?"
        }
        description={
          confirm === "block"
            ? view.role === "owner"
              ? "The conversation closes and they cannot start a new one on any of your ChatCards."
              : "The conversation closes and no more messages can be sent."
            : "No more messages can be sent. The history stays here for both of you."
        }
        confirmLabel={
          confirm === "block"
            ? "Block"
            : confirm === "leave"
              ? "Leave"
              : "Close"
        }
        tone="danger"
        pending={pending}
        onConfirm={() => confirm && act(confirm)}
      />
      <ConfirmDialog
        open={reporting}
        onOpenChange={setReporting}
        title="Report this conversation"
        description="The report goes to the Folioone team, not to the other person."
        confirmLabel="Send report"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const r = await reportConversationAction(view.id, {
              reason,
              details,
            });
            setReporting(false);
            if (r.ok) {
              setNotice(r.message ?? null);
              setDetails("");
            } else setError(r.message);
          })
        }
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Reason</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="report-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </fieldset>
        <label
          htmlFor="report-details"
          className="mt-3 block text-sm font-medium"
        >
          Details (optional)
        </label>
        <Textarea
          id="report-details"
          rows={3}
          maxLength={LIMITS.reportDetails}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </ConfirmDialog>
    </section>
  );
}
