import Link from "next/link";
import {
  BookOpen,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/** What a Free account sees instead of the ChatCards tools. */
export function ChatCardsUpgrade() {
  const points = [
    {
      icon: ShieldCheck,
      title: "Your details stay private",
      text: "People reach you through Folioone. They never see your email, phone or social accounts.",
    },
    {
      icon: KeyRound,
      title: "You decide who gets in",
      text: "Open invitations, requests you approve, or unique activation codes for readers, attendees and customers.",
    },
    {
      icon: MessageSquareText,
      title: "One calm inbox",
      text: "Accept, reply, close, block or report, all in Messages.",
    },
  ];
  return (
    <section className="max-w-3xl space-y-8" data-testid="chatcards-upgrade">
      <header>
        <p className="eyebrow">My connections</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          ChatCards
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-[15px] leading-7">
          Share access to a conversation, not your personal information. Put a
          ChatCard on a slide, a website or inside a book, and talk with the
          people who use it.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {points.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="border-border bg-card rounded-[20px] border p-5"
          >
            <Icon aria-hidden className="size-5" />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {text}
            </p>
          </div>
        ))}
      </div>
      <div className="border-border bg-card flex flex-col gap-4 rounded-[20px] border p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              Creating ChatCards is part of Folioone PRO
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Anyone can reply to a ChatCard for free. You need PRO to create
              your own. If your PRO period ended, your cards and conversations
              are kept: renew to continue where you left off.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/pricing?from=chatcards">See PRO plans</Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Someone invited you to talk? Your conversations are in{" "}
        <Link href="/messages" className="underline underline-offset-4">
          Messages
        </Link>
        .
      </p>
    </section>
  );
}
