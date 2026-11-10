import type { ReactNode } from "react";
import type {
  PublishedContent,
  PublishedSection,
  SectionOf,
} from "@/domains/website/published-content";
import type { ThemeId } from "@/domains/website/config";

/** Section bodies shared by all themes. Each theme passes its own tone + variant. */
export type Tone = {
  h2: string;
  muted: string;
  link: string;
  chip: string;
  card: string;
  strong: string;
  rule: string;
};

const HTTP = /^https?:\/\//;
export const safeHref = (v?: string) => (v && HTTP.test(v) ? v : undefined);

export function monthLabel(v?: string) {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return "";
  const [y, m] = v.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString(
    "en",
    {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}
const range = (start?: string, end?: string, current?: boolean) =>
  [monthLabel(start), current ? "Present" : monthLabel(end)]
    .filter(Boolean)
    .join(" – ");

function Ext({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
    >
      {children}
    </a>
  );
}

const Img = ({
  src,
  className,
  alt = "",
}: {
  src: string;
  className: string;
  alt?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={src}
    alt={alt}
    loading="lazy"
    referrerPolicy="no-referrer"
    className={className}
  />
);

export function SectionBlock({
  section,
  variant,
  tone,
  index,
}: {
  section: PublishedSection;
  variant: ThemeId;
  tone: Tone;
  index: number;
}) {
  const layout =
    variant === "professional"
      ? "grid gap-6 md:grid-cols-[11rem_1fr] md:gap-12 py-12 border-t " +
        tone.rule
      : variant === "creative"
        ? "py-14"
        : "py-9";
  const headingClass =
    variant === "minimal"
      ? "mb-4 text-xs font-medium tracking-[.18em] uppercase " + tone.muted
      : tone.h2;
  return (
    <section
      id={section.id}
      aria-labelledby={`h-${section.id}`}
      className={`site-reveal scroll-mt-20 ${layout}`}
      style={{ "--d": `${Math.min(index, 6) * 60}ms` } as React.CSSProperties}
    >
      <h2 id={`h-${section.id}`} className={headingClass}>
        {section.heading}
      </h2>
      <div className="min-w-0">{body(section, variant, tone)}</div>
    </section>
  );
}

function body(section: PublishedSection, v: ThemeId, t: Tone): ReactNode {
  switch (section.id) {
    case "about":
      return (
        <div
          className={`space-y-4 ${v === "creative" ? "max-w-3xl text-xl leading-9" : "max-w-2xl leading-8"}`}
        >
          {section.paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      );
    case "experience":
      return <Experience section={section} v={v} t={t} />;
    case "education":
      return (
        <ul
          className={
            v === "creative" ? "grid gap-4 md:grid-cols-2" : "space-y-5"
          }
        >
          {section.items.map((e, i) => (
            <li key={i} className={v === "creative" ? t.card : ""}>
              <p className={t.strong}>{e.institution}</p>
              <p className={t.muted}>
                {[e.qualification, e.specialization]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {range(e.start, e.end) && (
                <p className={`text-sm ${t.muted}`}>{range(e.start, e.end)}</p>
              )}
              {e.description && (
                <p className="mt-2 text-sm leading-7">{e.description}</p>
              )}
            </li>
          ))}
        </ul>
      );
    case "skills":
      return (
        <div className="space-y-5">
          {section.groups.map((g, i) => (
            <div key={i}>
              {g.category && (
                <p className={`mb-2 text-sm ${t.muted}`}>{g.category}</p>
              )}
              <ul className="flex flex-wrap gap-2">
                {g.skills.map((s, j) => (
                  <li key={j} title={s.description} className={t.chip}>
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    case "projects":
      return <Projects section={section} v={v} t={t} />;
    case "articles":
      return <Articles section={section} v={v} t={t} />;
    case "achievements":
      return (
        <ul className="space-y-3">
          {section.items.map((a, i) => (
            <li key={i}>
              <p className={t.strong}>
                {a.title}
                {a.date && (
                  <span className={`ml-2 text-sm font-normal ${t.muted}`}>
                    {monthLabel(a.date)}
                  </span>
                )}
              </p>
              {a.description && (
                <p className="text-sm leading-7">{a.description}</p>
              )}
            </li>
          ))}
        </ul>
      );
    case "certifications":
      return (
        <ul className="space-y-3">
          {section.items.map((c, i) => (
            <li key={i}>
              <p className={t.strong}>
                <Ext href={c.url} className={t.link}>
                  {c.name}
                </Ext>
              </p>
              <p className={`text-sm ${t.muted}`}>
                {[c.issuer, monthLabel(c.date)].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      );
    case "social":
      return (
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {section.items.map((s, i) => (
            <li key={i}>
              <Ext href={s.url} className={t.link}>
                {s.label}
              </Ext>
            </li>
          ))}
        </ul>
      );
    case "contact":
      return (
        <ul className="space-y-2">
          {section.email && (
            <li>
              <a href={`mailto:${section.email}`} className={t.link}>
                {section.email}
              </a>
            </li>
          )}
          {section.phone && (
            <li>
              <a
                href={`tel:${section.phone.replace(/[^+\d]/g, "")}`}
                className={t.link}
              >
                {section.phone}
              </a>
            </li>
          )}
          {section.website && (
            <li>
              <Ext href={section.website} className={t.link}>
                {section.website.replace(/^https?:\/\//, "")}
              </Ext>
            </li>
          )}
        </ul>
      );
  }
}

function Experience({
  section,
  v,
  t,
}: {
  section: SectionOf<"experience">;
  v: ThemeId;
  t: Tone;
}) {
  if (v === "minimal") {
    return (
      <ul className="space-y-3">
        {section.items.map((e, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-4">
            <span>
              <span className={t.strong}>{e.title}</span>, {e.organization}
            </span>
            <span className={`text-sm ${t.muted}`}>
              {range(e.start, e.end, e.current)}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol
      className={
        v === "professional"
          ? `relative space-y-8 border-l pl-6 ${t.rule}`
          : "space-y-4"
      }
    >
      {section.items.map((e, i) => (
        <li key={i} className={v === "creative" ? t.card : "relative"}>
          {v === "professional" && (
            <span
              aria-hidden="true"
              className="absolute top-2 -left-[1.9rem] size-2.5 rounded-full bg-current opacity-70"
            />
          )}
          <p className={t.strong}>{e.title}</p>
          <p className={t.muted}>
            {[e.organization, e.location].filter(Boolean).join(" · ")}
          </p>
          {range(e.start, e.end, e.current) && (
            <p className={`text-sm ${t.muted}`}>
              {range(e.start, e.end, e.current)}
            </p>
          )}
          {e.description && (
            <p className="mt-2 max-w-2xl text-sm leading-7 whitespace-pre-line">
              {e.description}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function Projects({
  section,
  v,
  t,
}: {
  section: SectionOf<"projects">;
  v: ThemeId;
  t: Tone;
}) {
  if (v === "minimal") {
    return (
      <ul className="space-y-4">
        {section.items.map((p, i) => (
          <li key={i}>
            <p className={t.strong}>
              <Ext href={p.url} className={t.link}>
                {p.name}
              </Ext>
              {p.role && (
                <span className={`ml-2 text-sm font-normal ${t.muted}`}>
                  {p.role}
                </span>
              )}
            </p>
            {p.description && (
              <p className="text-sm leading-7">{p.description}</p>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul
      className={v === "creative" ? "grid gap-6 md:grid-cols-2" : "space-y-8"}
    >
      {section.items.map((p, i) => (
        <li
          key={i}
          className={v === "creative" ? `${t.card} overflow-hidden !p-0` : ""}
        >
          {p.images?.[0] && (
            <Img
              src={p.images[0]}
              className={
                v === "creative"
                  ? "aspect-[16/10] w-full object-cover"
                  : "mb-3 aspect-[16/7] w-full rounded-md object-cover"
              }
            />
          )}
          <div className={v === "creative" ? "space-y-2 p-5" : "space-y-1.5"}>
            <p className={`${t.strong} ${v === "creative" ? "text-xl" : ""}`}>
              <Ext href={p.url} className={t.link}>
                {p.name}
              </Ext>
            </p>
            {p.role && <p className={`text-sm ${t.muted}`}>{p.role}</p>}
            {p.description && (
              <p className="text-sm leading-7">{p.description}</p>
            )}
            {p.technologies && (
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {p.technologies.map((x) => (
                  <li key={x} className={t.chip}>
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Articles({
  section,
  v,
  t,
}: {
  section: SectionOf<"articles">;
  v: ThemeId;
  t: Tone;
}) {
  return (
    <ul
      className={v === "creative" ? "grid gap-5 md:grid-cols-2" : "space-y-6"}
    >
      {section.items.map((a) => {
        const date = new Date(a.publishedAt).toLocaleDateString("en", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
        const title = a.href ? (
          <a href={a.href} className={`${t.strong} hover:underline`}>
            {a.title}
          </a>
        ) : (
          <span className={t.strong}>{a.title}</span>
        );
        return (
          <li key={a.slug} className={v === "creative" ? t.card : ""}>
            {a.coverUrl && v === "creative" && (
              <Img
                src={a.coverUrl}
                className="mb-3 aspect-[16/9] w-full rounded-md object-cover"
              />
            )}
            <p className={`text-xs ${t.muted}`}>
              {[
                a.category,
                date,
                a.readingMinutes > 0 && `${a.readingMinutes} min read`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-lg">{title}</p>
            {a.excerpt && (
              <p className={`mt-1 max-w-2xl text-sm leading-7 ${t.muted}`}>
                {a.excerpt}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function contactTarget(
  content: PublishedContent,
): { href: string; label: string } | null {
  if (content.person.contactEmail)
    return {
      href: `mailto:${content.person.contactEmail}`,
      label: "Get in touch",
    };
  if (content.sections.some((s) => s.id === "contact"))
    return { href: "#contact", label: "Contact" };
  return null;
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

export { Img };
