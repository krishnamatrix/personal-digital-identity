import Link from "next/link";
import { ArrowRight, FileText, Globe, Lock, UsersRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeThumb } from "@/components/website/theme-thumb";
import { THEMES, type ThemeId } from "@/domains/website/config";

const SHOWCASE: ThemeId[] = [
  "atelier",
  "noir",
  "gazette",
  "linen",
  "console",
  "bauhaus",
  "aurora",
  "vellum",
];

const STEPS = [
  {
    icon: FileText,
    title: "Write it down once",
    body: "Keep your experience, education, skills and projects in one private Master Identity. Start from your resume or from a blank page.",
  },
  {
    icon: UsersRound,
    title: "Shape it for each audience",
    body: "Personas choose what to emphasise for hiring managers, clients or a conference stage, without copying or changing the original.",
  },
  {
    icon: Globe,
    title: "Publish when you are ready",
    body: "Turn it into a personal website in a design that suits you. Nothing goes public until you press publish.",
  },
];

const PRIVACY = [
  "Your workspace is private by default. Only you can see it.",
  "Publishing creates a separate, versioned copy of just the parts you chose.",
  "Unpublish at any time; your private identity is never exposed directly.",
];

const label = (id: ThemeId) => THEMES.find((t) => t.id === id)?.label ?? id;

/** Public landing page shown at / to visitors who are not signed in. */
export function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-clip">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-full" aria-label="Folioone home">
          <BrandMark />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Create account</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 md:pt-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="eyebrow">Private by default</p>
            <h1 className="font-display mt-5 text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl">
              One identity.
              <br />
              Every way you present it.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
              Folioone keeps your professional story in one private place and
              turns it into a portfolio website you are proud to share, in the
              design and voice that fits each audience.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild className="h-12 px-6 text-[15px]">
                <Link href="/signup">
                  Start for free <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="h-12 px-6 text-[15px]"
              >
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
          </div>

          <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[#ececf0] to-[#dcdde3] sm:-inset-6 sm:rounded-[2.5rem]" />
            <div className="relative grid grid-cols-2 gap-3">
              {(["atelier", "noir", "linen", "console"] as ThemeId[]).map(
                (id, i) => (
                  <div
                    key={id}
                    className={`bg-card rounded-2xl p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,.25)] ${i % 2 ? "translate-y-6" : ""}`}
                  >
                    <ThemeThumb id={id} />
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="how-heading"
          className="border-border bg-card border-y"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="eyebrow">How it works</p>
            <h2
              id="how-heading"
              className="font-display mt-4 max-w-2xl text-3xl sm:text-4xl"
            >
              Your story, composed once and told well.
            </h2>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li
                  key={title}
                  className="border-border bg-background rounded-lg border p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="bg-card flex size-10 items-center justify-center rounded-full ring-1 ring-black/5">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="font-display mt-6 text-xl">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="designs-heading"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Portfolio designs</p>
              <h2
                id="designs-heading"
                className="font-display mt-4 text-3xl sm:text-4xl"
              >
                {THEMES.length} designs. Switch any time.
              </h2>
            </div>
            <p className="text-muted-foreground max-w-sm text-[15px]">
              Editorial, classic, minimal, bold, creative and technical. Your
              content stays the same; only the presentation changes.
            </p>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {SHOWCASE.map((id) => (
              <li
                key={id}
                className="border-border bg-card rounded-lg border p-2"
              >
                <ThemeThumb id={id} />
                <p className="px-1.5 pt-2.5 pb-1 text-sm font-medium">
                  {label(id)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy-heading" className="px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 rounded-[1.75rem] bg-[#1d1d1f] px-6 py-14 text-white sm:px-12 md:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
                <Lock aria-hidden className="size-[18px]" />
              </span>
              <h2
                id="privacy-heading"
                className="font-display mt-6 text-3xl sm:text-4xl"
              >
                Yours until you say otherwise.
              </h2>
            </div>
            <ul className="space-y-5 self-center">
              {PRIVACY.map((line) => (
                <li
                  key={line}
                  className="flex gap-3 text-[15px] leading-relaxed text-white/80"
                >
                  <span className="bg-success mt-2 size-2 shrink-0 rounded-full" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl">
            Compose your identity.
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-md text-[15px]">
            Create a private workspace in a minute. Publish only when it feels
            right.
          </p>
          <Button asChild className="mt-8 h-12 px-6 text-[15px]">
            <Link href="/signup">
              Create your account <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm sm:px-6">
          <BrandMark />
          <p>Private by default. Published only by you.</p>
        </div>
      </footer>
    </div>
  );
}
