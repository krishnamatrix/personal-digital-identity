"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  KeyRound,
  Lock,
  MessageSquareText,
  PauseCircle,
  TimerOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LIMITS,
  type AccessPolicy,
  type Availability,
} from "@/domains/chatcards/chat-card-schema";
import type { LandingViewer } from "@/domains/chatcards/conversation-service";
import { redeemCodeAction, startConversationAction } from "@/app/chat/actions";

const UNAVAILABLE: Record<
  Exclude<Availability, "open">,
  { icon: typeof Lock; title: string; text: string }
> = {
  paused: {
    icon: PauseCircle,
    title: "Paused for now",
    text: "This ChatCard is not taking new conversations at the moment. Existing conversations continue in Messages.",
  },
  expired: {
    icon: TimerOff,
    title: "This invitation has expired",
    text: "It no longer accepts new conversations.",
  },
  closed: {
    icon: Lock,
    title: "Not taking new conversations",
    text: "The host has turned off new conversations for this card.",
  },
  unavailable: {
    icon: Lock,
    title: "Not available right now",
    text: "This ChatCard cannot take new conversations at the moment.",
  },
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="border-border bg-card space-y-4 rounded-[20px] border p-6 sm:p-7"
      data-testid="chat-landing-panel"
    >
      {children}
    </section>
  );
}

export function ChatLandingPanel({
  publicId,
  hostName,
  accessPolicy,
  autoAccept,
  availability,
  viewer,
  linkPath,
}: {
  publicId: string;
  hostName: string;
  accessPolicy: AccessPolicy;
  autoAccept: boolean;
  availability: Availability;
  viewer: LandingViewer;
  linkPath: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [hasCode, setHasCode] = useState(viewer.signedIn && viewer.hasCode);
  const [name, setName] = useState(viewer.signedIn ? viewer.suggestedName : "");
  const [message, setMessage] = useState("");
  const here = `/chat/${publicId}`;
  const more = linkPath ? (
    <Link
      href={linkPath}
      className="text-muted-foreground text-sm underline underline-offset-4"
    >
      More about {hostName}
    </Link>
  ) : null;

  if (viewer.signedIn && viewer.isOwner)
    return (
      <Panel>
        <p className="text-sm leading-6">
          This is your ChatCard. Visitors see the card above and, below it, the
          steps to start a conversation with you.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/chatcards">Manage ChatCards</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/messages">Open Messages</Link>
          </Button>
        </div>
      </Panel>
    );

  const open = viewer.signedIn
    ? viewer.conversations.find(
        (c) => c.status === "active" || c.status === "requested",
      )
    : undefined;
  if (open)
    return (
      <Panel>
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareText aria-hidden className="size-4" />
          {open.status === "requested"
            ? "Your request is waiting for approval"
            : "You already have a conversation here"}
        </p>
        <Button asChild>
          <Link href={`/messages/${open.id}`}>Open the conversation</Link>
        </Button>
        {more}
      </Panel>
    );

  if (availability !== "open") {
    const u = UNAVAILABLE[availability];
    const Icon = u.icon;
    return (
      <Panel>
        <p className="flex items-center gap-2 text-base font-medium">
          <Icon aria-hidden className="size-5" />
          {u.title}
        </p>
        <p className="text-muted-foreground text-sm leading-6">{u.text}</p>
        {more}
      </Panel>
    );
  }

  const steps =
    accessPolicy === "verified"
      ? [
          "Sign in or create a free account",
          "Enter your activation code",
          "Send your message",
        ]
      : ["Sign in or create a free account", "Send your message"];

  if (!viewer.signedIn)
    return (
      <Panel>
        <h2 className="text-base font-semibold">
          Start a private conversation
        </h2>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm leading-6">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {accessPolicy === "verified" && (
          <p className="text-muted-foreground text-sm leading-6">
            You need the unique activation code that came with your copy, ticket
            or invitation.
          </p>
        )}
        <p className="text-muted-foreground text-sm leading-6">
          A free account is all you need. {hostName} sees only the name you
          choose, never your email address.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>
              Create a free account
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>
              Sign in
            </Link>
          </Button>
        </div>
        {more}
      </Panel>
    );

  if (accessPolicy === "verified" && !hasCode)
    return (
      <Panel>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound aria-hidden className="size-4" />
          Enter your activation code
        </h2>
        <p className="text-muted-foreground text-sm leading-6">
          Each code works once. It links access to this card with your account.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await redeemCodeAction(publicId, code);
              if (r.ok) {
                setHasCode(true);
                setCode("");
                setNotice(
                  "Code accepted. You can now write to " + hostName + ".",
                );
              } else setError(r.message);
            });
          }}
        >
          <label htmlFor="activation-code" className="text-sm font-medium">
            Activation code
          </label>
          <Input
            id="activation-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            className="font-mono tracking-wider uppercase"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "code-error" : undefined}
          />
          {error && (
            <p id="code-error" role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <Button type="submit" pending={pending} disabled={!code.trim()}>
            Redeem code
          </Button>
        </form>
        {more}
      </Panel>
    );

  return (
    <Panel>
      {notice && (
        <p
          role="status"
          className="text-success flex items-center gap-2 text-sm font-medium"
        >
          <CheckCircle2 aria-hidden className="size-4" />
          {notice}
        </p>
      )}
      <h2 className="text-base font-semibold">
        {autoAccept
          ? `Write to ${hostName}`
          : `Ask ${hostName} for a conversation`}
      </h2>
      <p className="text-muted-foreground text-sm leading-6">
        {autoAccept
          ? "Your message starts a private conversation."
          : `${hostName} reads your request first. If they accept, you can talk here.`}
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await startConversationAction(publicId, {
              name,
              message,
            });
            if (r.ok) router.push(`/messages/${r.data.id}`);
            else setError(r.message);
          });
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="recipient-name" className="text-sm font-medium">
            Your name, as {hostName} will see it
          </label>
          <Input
            id="recipient-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.recipientName}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="opening-message" className="text-sm font-medium">
            Message
          </label>
          <Textarea
            id="opening-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={LIMITS.message}
            rows={5}
          />
          <p className="text-muted-foreground text-right text-xs tabular-nums">
            {message.length}/{LIMITS.message}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <Button
          type="submit"
          pending={pending}
          disabled={!name.trim() || !message.trim()}
        >
          {autoAccept ? "Send message" : "Send request"}
        </Button>
      </form>
      {more}
    </Panel>
  );
}
