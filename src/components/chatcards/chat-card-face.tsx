import { KeyRound, MessageSquareText, ShieldCheck } from "lucide-react";
import type { AccessPolicy } from "@/domains/chatcards/chat-card-schema";
import { cn } from "@/lib/utils";

/**
 * The card as a visitor sees it. Takes only public fields (title, host name, texts, an
 * optional https cover image): it has no way to show an email, phone or any profile field.
 */
export type ChatCardFaceProps = {
  title: string;
  hostName: string;
  description: string | null;
  welcomeMessage: string | null;
  coverImageUrl: string | null;
  accessPolicy: AccessPolicy;
  autoAccept: boolean;
  className?: string;
};

const ACCESS_NOTE: Record<
  AccessPolicy,
  { icon: typeof KeyRound; text: string }
> = {
  open: { icon: MessageSquareText, text: "Open to anyone with this link" },
  approval: { icon: ShieldCheck, text: "Requests are approved by the host" },
  verified: { icon: KeyRound, text: "Activation code required" },
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "·"
  );
}

export function ChatCardFace({
  title,
  hostName,
  description,
  welcomeMessage,
  coverImageUrl,
  accessPolicy,
  autoAccept,
  className,
}: ChatCardFaceProps) {
  const note = ACCESS_NOTE[accessPolicy];
  const Icon = note.icon;
  return (
    <article
      className={cn(
        "border-border bg-card overflow-hidden rounded-[20px] border shadow-[0_1px_2px_rgba(0,0,0,.04)]",
        className,
      )}
      data-testid="chat-card-face"
    >
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-supplied https URL, no optimisation
        <img
          src={coverImageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-40 w-full object-cover sm:h-48"
        />
      ) : (
        <div
          aria-hidden
          className="h-24 bg-[radial-gradient(120%_140%_at_0%_0%,#f3efe7_0%,#ece8e1_45%,#e4e1dc_100%)]"
        />
      )}
      <div className="space-y-4 p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="bg-foreground text-background flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          >
            {initials(hostName)}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">ChatCard</p>
            <p className="truncate text-sm font-medium">{hostName}</p>
          </div>
        </div>
        <h1 className="font-display text-2xl leading-tight break-words sm:text-[1.9rem]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-[15px] leading-7 break-words whitespace-pre-line">
            {description}
          </p>
        )}
        {welcomeMessage && (
          <blockquote className="bg-muted/60 rounded-2xl px-4 py-3 text-[15px] leading-7 break-words whitespace-pre-line">
            {welcomeMessage}
          </blockquote>
        )}
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Icon aria-hidden className="size-3.5" />
          {note.text}
          <span aria-hidden>·</span>
          {autoAccept
            ? "Conversations start at once"
            : "The host replies when they can"}
        </p>
      </div>
    </article>
  );
}
