import { WithIntro } from "@/components/website/with-intro";
import type { CSSProperties, ReactNode } from "react";
import type { PublishedContent } from "@/domains/website/published-content";
import type { TemplateSpec } from "@/domains/website/templates";
import {
  contactTarget,
  Img,
  initialsOf,
  SectionBody,
  type Tone,
} from "@/components/website/sections";
import { templateFonts } from "@/components/website/template-fonts";

/*
 * Renders any portfolio template from its spec (src/domains/website/templates.ts).
 * Colours, faces and radii arrive as CSS variables on the root element, so every class
 * below is static (Tailwind can see it) and one component serves all templates.
 */

const tone: Tone = {
  h2: "t-display text-3xl",
  muted: "text-[var(--t-muted)]",
  link: "text-[var(--t-ink)] underline decoration-[var(--t-accent)] decoration-1 underline-offset-4 transition-colors hover:text-[var(--t-accent)]",
  chip: "rounded-[var(--t-radius)] border border-[var(--t-rule)] bg-[var(--t-surface)] px-3 py-1 text-sm",
  card: "rounded-[var(--t-card-radius)] border border-[var(--t-rule)] bg-[var(--t-surface)] p-6 transition-transform duration-300 hover:-translate-y-0.5",
  strong: "font-semibold text-[var(--t-ink)]",
  rule: "border-[var(--t-rule)]",
};

type Props = { spec: TemplateSpec; content: PublishedContent };
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function templateRootStyle(spec: TemplateSpec): {
  className: string;
  style: CSSProperties;
} {
  const fonts = templateFonts(spec.display, spec.body);
  const p = spec.palette;
  return {
    className: fonts.className,
    style: {
      "--t-bg": p.bg,
      "--t-surface": p.surface,
      "--t-ink": p.ink,
      "--t-muted": p.muted,
      "--t-accent": p.accent,
      "--t-on-accent": p.onAccent,
      "--t-rule": p.rule,
      "--t-radius": `${spec.radius}px`,
      "--t-card-radius": `${Math.min(spec.radius, 28)}px`,
      "--t-display": fonts.display,
      "--t-body": fonts.body,
      "--t-dw": String(spec.displayWeight),
      "--t-dt": spec.displayTracking,
      "--t-ds": spec.displayItalic ? "italic" : "normal",
    } as CSSProperties,
  };
}

/* --------------------------------- pieces -------------------------------- */

function Cta({
  content,
  className = "",
}: {
  content: PublishedContent;
  className?: string;
}) {
  const cta = contactTarget(content);
  if (!cta) return null;
  return (
    <a
      href={cta.href}
      className={`inline-flex items-center rounded-[var(--t-radius)] bg-[var(--t-accent)] px-6 py-3 text-sm font-medium text-[var(--t-on-accent)] transition-opacity hover:opacity-90 ${className}`}
    >
      {cta.label}
    </a>
  );
}

function Portrait({
  content,
  shape,
  className,
}: {
  content: PublishedContent;
  shape: "circle" | "arch" | "square" | "rounded";
  className: string;
}) {
  const p = content.person;
  const radius =
    shape === "circle"
      ? "rounded-full"
      : shape === "arch"
        ? "rounded-t-full"
        : shape === "rounded"
          ? "rounded-[var(--t-card-radius)]"
          : "";
  const portrait = p.imageUrl ? (
    <Img
      src={p.imageUrl}
      alt={p.name}
      className={`${p.intro ? "size-full" : className} ${radius} object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${p.intro ? "size-full" : className} ${radius} t-display flex items-center justify-center bg-[var(--t-surface)] text-[var(--t-accent)] ring-1 ring-[var(--t-rule)]`}
    >
      <span className="text-[clamp(2.5rem,6vw,4.5rem)]">
        {initialsOf(p.name)}
      </span>
    </span>
  );
  if (!p.intro) return portrait;
  return (
    <WithIntro content={content} className={`${className} ${radius}`}>
      {portrait}
    </WithIntro>
  );
}

function Nav({
  content,
  className = "",
  vertical = false,
}: {
  content: PublishedContent;
  className?: string;
  vertical?: boolean;
}) {
  if (content.sections.length === 0) return null;
  return (
    <nav
      aria-label="Sections"
      className={
        vertical
          ? `flex flex-col gap-2 text-sm ${className}`
          : `hidden gap-6 text-sm md:flex ${className}`
      }
    >
      {content.sections.slice(0, vertical ? 12 : 6).map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="text-[var(--t-muted)] transition-colors hover:text-[var(--t-ink)]"
        >
          {s.heading}
        </a>
      ))}
    </nav>
  );
}

function Heading({
  spec,
  text,
  index,
  id,
}: {
  spec: TemplateSpec;
  text: string;
  index: number;
  id: string;
}) {
  switch (spec.heading) {
    case "eyebrow":
      return (
        <h2
          id={id}
          className="text-xs font-semibold tracking-[.22em] text-[var(--t-accent)] uppercase"
        >
          {text}
        </h2>
      );
    case "numbered":
      return (
        <h2 id={id} className="flex items-baseline gap-4">
          <span className="font-mono text-sm text-[var(--t-accent)]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="t-display text-3xl md:text-5xl">{text}</span>
        </h2>
      );
    case "centered":
      return (
        <h2
          id={id}
          className="flex items-center gap-5 text-xs tracking-[.3em] text-[var(--t-muted)] uppercase"
        >
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--t-rule)]" />
          {text}
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--t-rule)]" />
        </h2>
      );
    case "mono":
      return (
        <h2 id={id} className="font-mono text-sm text-[var(--t-accent)]">
          {"## "}
          {text.toLowerCase()}
        </h2>
      );
    default:
      return (
        <h2 id={id} className="t-display text-4xl md:text-6xl">
          {text}
        </h2>
      );
  }
}

/** All published sections. Short labels sit beside the content; display headings sit above. */
function Sections({
  spec,
  content,
  narrow = false,
}: Props & { narrow?: boolean }) {
  const beside =
    !narrow &&
    (spec.heading === "eyebrow" || spec.heading === "mono") &&
    spec.layout !== "centered";
  return (
    <>
      {content.sections.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`h-${s.id}`}
          className={`site-reveal scroll-mt-24 border-t border-[var(--t-rule)] py-14 md:py-20 ${beside ? "grid gap-6 md:grid-cols-[12rem_1fr] md:gap-12" : ""}`}
          style={delay(Math.min(i, 6) * 60)}
        >
          <div className={beside ? "" : "mb-8 md:mb-10"}>
            <Heading spec={spec} text={s.heading} index={i} id={`h-${s.id}`} />
          </div>
          <div className="min-w-0">
            <SectionBody section={s} variant={spec.sections} tone={tone} />
          </div>
        </section>
      ))}
    </>
  );
}

function Footer({ name }: { name: string }) {
  return (
    <footer className="site-reveal flex flex-wrap items-center justify-between gap-3 border-t border-[var(--t-rule)] py-10 text-xs text-[var(--t-muted)]">
      <span>
        © {new Date().getUTCFullYear()} {name}
      </span>
      <span>
        Made with{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/signup" className="underline underline-offset-4">
          Folioone
        </a>
      </span>
    </footer>
  );
}

function Role({
  content,
  className = "",
}: {
  content: PublishedContent;
  className?: string;
}) {
  const role = content.person.role;
  if (!role) return null;
  return (
    <p
      className={`text-xs font-semibold tracking-[.22em] text-[var(--t-accent)] uppercase ${className}`}
    >
      {role}
    </p>
  );
}

function Shell({
  spec,
  children,
}: {
  spec: TemplateSpec;
  children: ReactNode;
}) {
  const root = templateRootStyle(spec);
  return (
    <div
      data-theme={spec.id}
      className={`t-body min-h-screen bg-[var(--t-bg)] text-[var(--t-ink)] antialiased selection:bg-[var(--t-accent)] selection:text-[var(--t-on-accent)] ${root.className}`}
      style={root.style}
    >
      {children}
    </div>
  );
}

function TopBar({
  content,
  centered = false,
  overlay = false,
}: {
  content: PublishedContent;
  centered?: boolean;
  overlay?: boolean;
}) {
  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-10"
          : "sticky top-0 z-10 border-b border-[var(--t-rule)] bg-[var(--t-bg)]/85 backdrop-blur-md"
      }
    >
      <div
        className={`mx-auto flex h-16 max-w-6xl items-center px-5 md:px-8 ${centered ? "justify-center" : "justify-between"}`}
      >
        {!centered && (
          <a href="#top" className="t-display text-xl">
            {content.person.name}
          </a>
        )}
        <Nav content={content} />
      </div>
    </header>
  );
}

/* --------------------------------- layouts -------------------------------- */

function Split({ spec, content }: Props) {
  const p = content.person;
  return (
    <Shell spec={spec}>
      <TopBar content={content} />
      <main id="top" className="mx-auto max-w-6xl px-5 md:px-8">
        <section className="site-reveal grid items-center gap-12 py-16 md:grid-cols-[1.25fr_1fr] md:py-24">
          <div>
            <Role content={content} className="mb-6" />
            <h1 className="t-display text-5xl leading-[1.02] md:text-7xl">
              {p.name}
            </h1>
            {p.headline && (
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-[var(--t-muted)]">
                {p.headline}
              </p>
            )}
            {p.shortBio && (
              <p className="mt-6 max-w-xl leading-8">{p.shortBio}</p>
            )}
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Cta content={content} />
              {p.location && (
                <span className="text-sm text-[var(--t-muted)]">
                  {p.location}
                </span>
              )}
            </div>
          </div>
          <Portrait
            content={content}
            shape={
              spec.heading === "centered"
                ? "arch"
                : spec.radius >= 12
                  ? "rounded"
                  : "circle"
            }
            className="mx-auto aspect-[4/5] w-full max-w-sm md:ml-auto"
          />
        </section>
        {p.coverUrl && (
          <Img
            src={p.coverUrl}
            className="site-reveal mb-4 aspect-[21/8] w-full rounded-[var(--t-card-radius)] object-cover"
          />
        )}
        <Sections spec={spec} content={content} />
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

function Centered({ spec, content }: Props) {
  const p = content.person;
  return (
    <Shell spec={spec}>
      <TopBar content={content} centered />
      <main id="top" className="mx-auto max-w-3xl px-5 text-center md:px-8">
        <section className="site-reveal flex flex-col items-center py-16 md:py-24">
          <Portrait
            content={content}
            shape="circle"
            className="size-32 md:size-40"
          />
          <Role content={content} className="mt-10" />
          <h1 className="t-display mt-5 text-5xl leading-[1.05] md:text-7xl">
            {p.name}
          </h1>
          {p.headline && (
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-[var(--t-muted)]">
              {p.headline}
            </p>
          )}
          <span
            aria-hidden="true"
            className="my-9 h-px w-16 bg-[var(--t-accent)]"
          />
          {p.shortBio && <p className="max-w-xl leading-8">{p.shortBio}</p>}
          <div className="mt-9 flex flex-col items-center gap-4">
            <Cta content={content} />
            {p.location && (
              <span className="text-sm text-[var(--t-muted)]">
                {p.location}
              </span>
            )}
          </div>
        </section>
        <div className="text-left">
          <Sections spec={spec} content={content} narrow />
        </div>
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

function Masthead({ spec, content }: Props) {
  const p = content.person;
  return (
    <Shell spec={spec}>
      <main id="top" className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="site-reveal flex items-center justify-between gap-4 py-4 text-xs tracking-[.18em] text-[var(--t-muted)] uppercase">
          <span>{p.location ?? "Portfolio"}</span>
          <Nav content={content} className="tracking-normal normal-case" />
          <span>Portfolio</span>
        </div>
        <header className="site-reveal border-y-4 border-double border-[var(--t-rule)] py-6 text-center md:py-10">
          <h1 className="t-display text-[clamp(3rem,10vw,8.5rem)] leading-[.9]">
            {p.name}
          </h1>
        </header>
        <section
          className="site-reveal grid gap-8 border-b border-[var(--t-rule)] py-10 md:grid-cols-3 md:gap-10"
          style={delay(80)}
        >
          <div className="md:border-r md:border-[var(--t-rule)] md:pr-10">
            <Role content={content} />
            {p.headline && (
              <p className="t-display mt-4 text-2xl leading-snug">
                {p.headline}
              </p>
            )}
            <Cta content={content} className="mt-7" />
          </div>
          <div className="leading-8 md:border-r md:border-[var(--t-rule)] md:pr-10">
            {p.shortBio && (
              <p className="first-letter:t-display first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:leading-[.8]">
                {p.shortBio}
              </p>
            )}
          </div>
          <Portrait
            content={content}
            shape="square"
            className="aspect-[4/5] w-full grayscale-[35%]"
          />
        </section>
        {p.coverUrl && (
          <Img
            src={p.coverUrl}
            className="site-reveal mt-10 aspect-[21/8] w-full object-cover"
          />
        )}
        <Sections spec={spec} content={content} />
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

function Sidebar({ spec, content }: Props) {
  const p = content.person;
  return (
    <Shell spec={spec}>
      <div className="md:grid md:grid-cols-[19rem_1fr] lg:grid-cols-[22rem_1fr]">
        <aside className="site-reveal border-b border-[var(--t-rule)] bg-[var(--t-surface)] px-6 py-10 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-r md:border-b-0 md:px-8 md:py-12">
          <Portrait
            content={content}
            shape={spec.radius >= 8 ? "rounded" : "circle"}
            className="size-28"
          />
          <h1 className="t-display mt-8 text-4xl leading-tight">{p.name}</h1>
          <Role content={content} className="mt-4" />
          {p.headline && (
            <p className="mt-4 leading-7 text-[var(--t-muted)]">{p.headline}</p>
          )}
          {p.location && (
            <p className="mt-4 text-sm text-[var(--t-muted)]">{p.location}</p>
          )}
          <Cta content={content} className="mt-7" />
          <Nav
            content={content}
            vertical
            className="mt-10 hidden border-t border-[var(--t-rule)] pt-8 md:flex"
          />
        </aside>
        <main id="top" className="px-5 md:px-12 lg:px-16">
          {p.coverUrl && (
            <Img
              src={p.coverUrl}
              className="site-reveal mt-10 aspect-[21/8] w-full rounded-[var(--t-card-radius)] object-cover"
            />
          )}
          {p.shortBio && (
            <p className="site-reveal t-display max-w-3xl py-14 text-2xl leading-snug md:py-20 md:text-3xl">
              {p.shortBio}
            </p>
          )}
          <Sections spec={spec} content={content} narrow />
          <Footer name={p.name} />
        </main>
      </div>
    </Shell>
  );
}

function Cover({ spec, content }: Props) {
  const p = content.person;
  const image = Boolean(p.coverUrl);
  return (
    <Shell spec={spec}>
      <section
        id="top"
        className={`relative isolate flex min-h-[82vh] items-end overflow-hidden ${image ? "text-white" : ""}`}
      >
        {image ? (
          <>
            <Img
              src={p.coverUrl!}
              className="absolute inset-0 -z-20 size-full object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/10"
            />
          </>
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_10%,var(--t-accent)_0%,transparent_55%),radial-gradient(ellipse_at_90%_80%,var(--t-surface)_0%,transparent_60%)] opacity-60"
          />
        )}
        <TopBar content={content} overlay />
        <div className="site-reveal mx-auto grid w-full max-w-6xl items-end gap-10 px-5 pt-28 pb-14 md:grid-cols-[1fr_auto] md:px-8 md:pb-20">
          <div>
            <Role
              content={content}
              className={`mb-5 ${image ? "!text-white/85" : ""}`}
            />
            <h1 className="t-display text-[clamp(3rem,9vw,7.5rem)] leading-[.92]">
              {p.name}
            </h1>
            {p.headline && (
              <p
                className={`mt-6 max-w-2xl text-xl leading-relaxed ${image ? "text-white/85" : "text-[var(--t-muted)]"}`}
              >
                {p.headline}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Cta content={content} />
              {p.location && (
                <span
                  className={`text-sm ${image ? "text-white/75" : "text-[var(--t-muted)]"}`}
                >
                  {p.location}
                </span>
              )}
            </div>
          </div>
          {p.imageUrl && (
            <Portrait
              content={content}
              shape="rounded"
              className="hidden size-40 ring-4 ring-white/20 md:block"
            />
          )}
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-5 md:px-8">
        {p.shortBio && (
          <p className="site-reveal t-display max-w-4xl py-16 text-2xl leading-snug md:py-24 md:text-4xl">
            {p.shortBio}
          </p>
        )}
        <Sections spec={spec} content={content} />
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

function Poster({ spec, content }: Props) {
  const p = content.person;
  return (
    <Shell spec={spec}>
      <TopBar content={content} />
      <main id="top" className="mx-auto max-w-6xl overflow-x-clip px-5 md:px-8">
        <section className="site-reveal relative pt-16 pb-14 md:pt-24 md:pb-20">
          <Role content={content} className="mb-6" />
          <h1 className="t-display relative text-[clamp(3.5rem,13vw,11rem)] leading-[.86] break-words">
            {p.name}
          </h1>
          <div
            className="mt-12 grid items-end gap-10 md:grid-cols-[1.4fr_1fr]"
            style={delay(100)}
          >
            <div>
              {p.headline && (
                <p className="t-display text-2xl leading-snug md:text-3xl">
                  {p.headline}
                </p>
              )}
              {p.shortBio && (
                <p className="mt-6 max-w-xl leading-8 text-[var(--t-muted)]">
                  {p.shortBio}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <Cta content={content} />
                {p.location && (
                  <span className="text-sm text-[var(--t-muted)]">
                    {p.location}
                  </span>
                )}
              </div>
            </div>
            <div className="relative isolate w-full max-w-xs md:ml-auto">
              {/* Accent disc peeking out behind the portrait: decoration only. */}
              <span
                aria-hidden="true"
                className="absolute -top-8 -right-6 -z-10 size-36 rounded-full bg-[var(--t-accent)] md:size-52"
              />
              <Portrait
                content={content}
                shape={spec.radius >= 12 ? "rounded" : "square"}
                className="aspect-square w-full"
              />
            </div>
          </div>
        </section>
        {p.coverUrl && (
          <Img
            src={p.coverUrl}
            className="site-reveal aspect-[21/8] w-full rounded-[var(--t-card-radius)] object-cover"
          />
        )}
        <Sections spec={spec} content={content} />
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

function Terminal({ spec, content }: Props) {
  const p = content.person;
  const handle = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <Shell spec={spec}>
      <TopBar content={content} />
      <main id="top" className="mx-auto max-w-5xl px-5 md:px-8">
        <section className="site-reveal py-14 md:py-20">
          <div className="overflow-hidden rounded-[var(--t-card-radius)] border border-[var(--t-rule)] bg-[var(--t-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--t-rule)] px-4 py-3">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-xs text-[var(--t-muted)]">
                ~/{handle}
              </span>
            </div>
            <div className="space-y-5 p-6 text-sm leading-7 md:p-10 md:text-base">
              <p className="text-[var(--t-muted)]">
                <span className="text-[var(--t-accent)]">$</span> whoami
              </p>
              <h1 className="t-display text-4xl leading-tight md:text-6xl">
                {p.name}
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block h-[.9em] w-[.5em] translate-y-[.1em] animate-pulse bg-[var(--t-accent)]"
                />
              </h1>
              {p.role && <p>{p.role}</p>}
              {p.headline && (
                <p className="text-[var(--t-muted)]">{`// ${p.headline}`}</p>
              )}
              {p.shortBio && (
                <>
                  <p className="text-[var(--t-muted)]">
                    <span className="text-[var(--t-accent)]">$</span> cat
                    about.md
                  </p>
                  <p className="max-w-3xl">{p.shortBio}</p>
                </>
              )}
              <div className="flex flex-wrap items-center gap-5 pt-2">
                <Cta content={content} />
                {p.location && (
                  <span className="text-[var(--t-muted)]">@ {p.location}</span>
                )}
              </div>
            </div>
          </div>
        </section>
        <Sections spec={spec} content={content} />
        <Footer name={p.name} />
      </main>
    </Shell>
  );
}

const LAYOUTS = {
  split: Split,
  centered: Centered,
  masthead: Masthead,
  sidebar: Sidebar,
  cover: Cover,
  poster: Poster,
  terminal: Terminal,
} as const;

export function TemplateSite({ spec, content }: Props) {
  const Layout = LAYOUTS[spec.layout];
  return <Layout spec={spec} content={content} />;
}
