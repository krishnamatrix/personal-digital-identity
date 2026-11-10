import type { ThemeId } from "@/domains/website/config";
import type { PublishedContent } from "@/domains/website/published-content";
import {
  contactTarget,
  Img,
  initialsOf,
  SectionBlock,
  type Tone,
} from "@/components/website/sections";

const attribution = (cls: string) => (
  <footer className={`site-reveal py-10 text-center text-xs ${cls}`}>
    Made with {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a href="/signup" className="underline underline-offset-4">
      Folioone
    </a>
  </footer>
);

function NavLinks({
  content,
  cls,
}: {
  content: PublishedContent;
  cls: string;
}) {
  return (
    <nav aria-label="Sections" className="hidden gap-5 text-sm md:flex">
      {content.sections.slice(0, 6).map((s) => (
        <a key={s.id} href={`#${s.id}`} className={cls}>
          {s.heading}
        </a>
      ))}
    </nav>
  );
}

/* ----------------------------- Professional ----------------------------- */
const professional: Tone = {
  h2: "font-serif text-sm font-semibold tracking-[.16em] uppercase text-[#2f4a5a]",
  muted: "text-[#6a6f73]",
  link: "text-[#2f4a5a] underline underline-offset-4 decoration-[#2f4a5a]/30 hover:decoration-[#2f4a5a]",
  chip: "rounded-full border border-[#d9d4c8] bg-white px-3 py-1 text-sm",
  card: "rounded-lg border border-[#e2ddd1] bg-white p-5",
  strong: "font-semibold text-[#1f2328]",
  rule: "border-[#e2ddd1]",
};

function Professional({ content }: { content: PublishedContent }) {
  const p = content.person;
  const cta = contactTarget(content);
  return (
    <div
      className="min-h-screen bg-[#faf8f4] text-[#2a2e33]"
      data-theme="professional"
    >
      <header className="sticky top-0 z-10 border-b border-[#e2ddd1] bg-[#faf8f4]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <a href="#top" className="font-serif text-lg">
            {p.name}
          </a>
          <NavLinks
            content={content}
            cls="text-[#6a6f73] hover:text-[#1f2328]"
          />
        </div>
      </header>
      <main id="top" className="mx-auto max-w-5xl px-5">
        <div
          className="site-reveal overflow-hidden rounded-b-xl bg-[#e8e3d6]"
          style={{ height: p.coverUrl ? undefined : 0 }}
        >
          {p.coverUrl && (
            <Img
              src={p.coverUrl}
              className="h-40 w-full object-cover md:h-60"
            />
          )}
        </div>
        <section
          className="site-reveal grid items-center gap-8 py-14 md:grid-cols-[1fr_auto]"
          style={{ "--d": "80ms" } as React.CSSProperties}
        >
          <div>
            {p.role && (
              <p className="mb-3 text-sm tracking-wide text-[#2f4a5a] uppercase">
                {p.role}
              </p>
            )}
            <h1 className="font-serif text-4xl leading-tight md:text-6xl">
              {p.name}
            </h1>
            {p.headline && (
              <p className="mt-4 max-w-2xl text-xl text-[#51565b]">
                {p.headline}
              </p>
            )}
            {p.shortBio && (
              <p className="mt-5 max-w-2xl leading-8">{p.shortBio}</p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-4 text-sm">
              {cta && (
                <a
                  href={cta.href}
                  className="rounded-md bg-[#2f4a5a] px-5 py-2.5 text-white hover:bg-[#263d4a]"
                >
                  {cta.label}
                </a>
              )}
              {p.location && (
                <span className="text-[#6a6f73]">{p.location}</span>
              )}
            </div>
          </div>
          {p.imageUrl ? (
            <Img
              src={p.imageUrl}
              alt={p.name}
              className="size-36 rounded-full border-4 border-white object-cover shadow-md md:size-52"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-36 items-center justify-center rounded-full bg-[#e8e3d6] font-serif text-5xl text-[#2f4a5a] md:size-52"
            >
              {initialsOf(p.name)}
            </span>
          )}
        </section>
        {content.sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            variant="professional"
            tone={professional}
            index={i}
          />
        ))}
        {attribution("text-[#6a6f73]")}
      </main>
    </div>
  );
}

/* ------------------------------- Creative ------------------------------- */
const creative: Tone = {
  h2: "mb-8 text-4xl font-black tracking-tight md:text-6xl bg-gradient-to-r from-[#ff7a59] to-[#c07bff] bg-clip-text text-transparent",
  muted: "text-[#a9a3c4]",
  link: "text-[#ffb199] underline underline-offset-4 hover:text-white",
  chip: "rounded-full bg-gradient-to-r from-[#ff7a59]/20 to-[#b66dff]/25 px-3.5 py-1.5 text-sm text-[#f3eeff] ring-1 ring-white/10",
  card: "rounded-2xl bg-white/[.05] p-5 ring-1 ring-white/10 transition hover:bg-white/[.08]",
  strong: "font-bold text-white",
  rule: "border-white/10",
};

function Creative({ content }: { content: PublishedContent }) {
  const p = content.person;
  const cta = contactTarget(content);
  return (
    <div
      className="min-h-screen bg-[#12101a] text-[#e6e1f5]"
      data-theme="creative"
    >
      <div className="relative overflow-hidden">
        {p.coverUrl ? (
          <Img
            src={p.coverUrl}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute -top-40 -right-40 size-[34rem] rounded-full bg-gradient-to-br from-[#ff7a59]/40 to-[#b66dff]/40 blur-3xl"
          />
        )}
        <div className="relative mx-auto max-w-6xl px-5 pt-6 pb-20 md:pb-32">
          <div className="flex items-center justify-between text-sm">
            <a href="#top" className="font-black tracking-tight">
              {p.name.split(" ")[0]}
              <span className="text-[#ff7a59]">.</span>
            </a>
            <NavLinks content={content} cls="text-[#a9a3c4] hover:text-white" />
          </div>
          <div
            id="top"
            className="site-reveal mt-16 grid items-end gap-10 md:mt-28 md:grid-cols-[1fr_auto]"
          >
            <div>
              {p.role && (
                <p className="mb-4 text-sm font-semibold tracking-[.2em] text-[#ff9b80] uppercase">
                  {p.role}
                </p>
              )}
              <h1 className="text-5xl leading-[.95] font-black tracking-tight md:text-8xl">
                {p.name}
              </h1>
              {p.headline && (
                <p className="mt-6 max-w-2xl text-xl text-[#cfc8ea] md:text-2xl">
                  {p.headline}
                </p>
              )}
              {p.shortBio && (
                <p className="mt-4 max-w-2xl leading-8 text-[#a9a3c4]">
                  {p.shortBio}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
                {cta && (
                  <a
                    href={cta.href}
                    className="rounded-full bg-gradient-to-r from-[#ff7a59] to-[#b66dff] px-6 py-3 font-semibold text-white transition hover:scale-[1.03]"
                  >
                    {cta.label}
                  </a>
                )}
                {p.location && (
                  <span className="text-[#a9a3c4]">{p.location}</span>
                )}
              </div>
            </div>
            {p.imageUrl ? (
              <Img
                src={p.imageUrl}
                alt={p.name}
                className="size-44 rotate-3 rounded-3xl object-cover ring-4 ring-white/10 md:size-64"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-44 rotate-3 items-center justify-center rounded-3xl bg-gradient-to-br from-[#ff7a59] to-[#b66dff] text-6xl font-black text-white md:size-64"
              >
                {initialsOf(p.name)}
              </span>
            )}
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-5">
        {content.sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            variant="creative"
            tone={creative}
            index={i}
          />
        ))}
        {attribution("text-[#a9a3c4]")}
      </main>
    </div>
  );
}

/* ------------------------------- Minimal -------------------------------- */
const minimal: Tone = {
  h2: "",
  muted: "text-neutral-500",
  link: "underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-900",
  chip: "rounded border border-neutral-200 px-2 py-0.5 text-sm",
  card: "",
  strong: "font-medium text-neutral-950",
  rule: "border-neutral-200",
};

function Minimal({ content }: { content: PublishedContent }) {
  const p = content.person;
  const cta = contactTarget(content);
  return (
    <div
      className="min-h-screen bg-white text-neutral-800"
      data-theme="minimal"
    >
      <main id="top" className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <header className="site-reveal">
          {p.imageUrl && (
            <Img
              src={p.imageUrl}
              alt={p.name}
              className="mb-8 size-20 rounded-full object-cover"
            />
          )}
          <h1 className="font-serif text-4xl tracking-tight text-neutral-950 md:text-5xl">
            {p.name}
          </h1>
          {p.headline && (
            <p className="mt-3 text-lg text-neutral-600">{p.headline}</p>
          )}
          <p className="mt-1 text-sm text-neutral-500">
            {[p.role, p.location].filter(Boolean).join(" · ")}
          </p>
          {p.shortBio && <p className="mt-6 leading-8">{p.shortBio}</p>}
          {cta && (
            <a
              href={cta.href}
              className="mt-6 inline-block text-sm underline underline-offset-4"
            >
              {cta.label} →
            </a>
          )}
        </header>
        <div className="mt-12">
          {content.sections.map((s, i) => (
            <SectionBlock
              key={s.id}
              section={s}
              variant="minimal"
              tone={minimal}
              index={i}
            />
          ))}
        </div>
        {attribution("text-neutral-400")}
      </main>
    </div>
  );
}

export function SiteView({
  theme,
  content,
}: {
  theme: ThemeId;
  content: PublishedContent;
}) {
  if (theme === "creative") return <Creative content={content} />;
  if (theme === "minimal") return <Minimal content={content} />;
  return <Professional content={content} />;
}
