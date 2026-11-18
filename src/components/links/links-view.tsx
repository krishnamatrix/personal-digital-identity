import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Dribbble,
  Facebook,
  FileText,
  Github,
  Globe,
  Instagram,
  Link2,
  Linkedin,
  Star,
  Youtube,
} from "lucide-react";
import type {
  PublishedContent,
  PublishedLinks,
} from "@/domains/website/published-content";
import { initialsOf } from "@/components/website/sections";
import { WithIntro } from "@/components/website/with-intro";

/**
 * The public links page: a single mobile-first column of large buttons in the owner's website
 * colours. Server component; clicks are recorded by the page's PageTracker through the
 * data-track-* attributes.
 */

const XLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-full">
    <path
      fill="currentColor"
      d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"
    />
  </svg>
);

const SOCIAL_ICON: Record<string, ReactNode> = {
  linkedin: <Linkedin aria-hidden className="size-full" />,
  github: <Github aria-hidden className="size-full" />,
  instagram: <Instagram aria-hidden className="size-full" />,
  facebook: <Facebook aria-hidden className="size-full" />,
  x: <XLogo />,
  youtube: <Youtube aria-hidden className="size-full" />,
  dribbble: <Dribbble aria-hidden className="size-full" />,
};
const socialIcon = (platform?: string) =>
  (platform && SOCIAL_ICON[platform]) ?? (
    <Globe aria-hidden className="size-full" />
  );

function kindIcon(item: PublishedLinks["items"][number]): ReactNode {
  if (item.kind === "booking")
    return <CalendarDays aria-hidden className="size-full" />;
  if (item.kind === "article")
    return <FileText aria-hidden className="size-full" />;
  if (item.kind === "website")
    return <Globe aria-hidden className="size-full" />;
  if (item.kind === "social") return socialIcon(item.platform);
  return <Link2 aria-hidden className="size-full" />;
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin(n >> 16) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

export function LinksView({
  content,
  items,
  siteSlug,
  colors,
}: {
  content: PublishedContent;
  /** Already filtered for today's schedule. */
  items: PublishedLinks["items"];
  siteSlug: string;
  colors: { bg: string; fg: string; accent: string };
}) {
  const links = content.links!;
  const p = content.person;
  const onAccent = readableOn(colors.accent);
  const style = {
    "--l-bg": colors.bg,
    "--l-fg": colors.fg,
    "--l-accent": colors.accent,
    "--l-on-accent": onAccent,
    background: colors.bg,
    color: colors.fg,
  } as CSSProperties;

  const base =
    "group relative flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--l-bg)]";
  const variant = {
    filled: "bg-[var(--l-accent)] text-[var(--l-on-accent)] shadow-sm",
    outline:
      "border-2 border-[color-mix(in_srgb,var(--l-fg)_22%,transparent)] hover:border-[var(--l-accent)]",
    soft: "bg-[color-mix(in_srgb,var(--l-fg)_7%,transparent)] hover:bg-[color-mix(in_srgb,var(--l-fg)_11%,transparent)]",
  }[links.buttonStyle];
  const highlighted =
    "bg-[var(--l-accent)] text-[var(--l-on-accent)] shadow-md ring-2 ring-[var(--l-accent)] ring-offset-2 ring-offset-[var(--l-bg)]";

  const hrefOf = (item: PublishedLinks["items"][number]) =>
    item.kind === "website"
      ? `/${siteSlug}`
      : item.kind === "article"
        ? `/${siteSlug}/articles/${item.articleSlug}`
        : item.url!;

  return (
    <main style={style} className="min-h-dvh px-4 py-12 sm:py-16">
      <div className="mx-auto flex w-full max-w-[34rem] flex-col items-center text-center">
        <WithIntro
          content={content}
          badge="dot"
          className="size-24 rounded-full"
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imageUrl}
              alt={p.name}
              className="size-24 rounded-full object-cover shadow-sm ring-4 ring-[color-mix(in_srgb,var(--l-fg)_8%,transparent)]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-24 items-center justify-center rounded-full bg-[var(--l-accent)] text-3xl font-semibold text-[var(--l-on-accent)]"
            >
              {initialsOf(p.name)}
            </span>
          )}
        </WithIntro>
        {p.intro && (
          <p className="mt-3 text-xs opacity-70">
            Tap my photo to watch my intro
          </p>
        )}
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{p.name}</h1>
        {(p.headline || p.role) && (
          <p className="mt-1.5 max-w-sm text-sm leading-6 opacity-75">
            {p.headline ?? p.role}
          </p>
        )}

        {links.socials.length > 0 && (
          <ul
            className="mt-5 flex flex-wrap justify-center gap-2"
            aria-label="Profiles"
          >
            {links.socials.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer me"
                  aria-label={s.label}
                  title={s.label}
                  data-track-kind="social"
                  data-track-label={s.label}
                  className="flex size-10 items-center justify-center rounded-full p-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--l-fg)_9%,transparent)]"
                >
                  {socialIcon(s.platform)}
                </a>
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-8 w-full space-y-3">
          {items.map((item, i) => {
            const href = hrefOf(item);
            const external = /^https?:\/\//.test(href);
            return (
              <li key={`${item.kind}-${i}`}>
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer nofollow" : undefined}
                  data-track-kind={
                    item.kind === "custom" ? "custom" : item.kind
                  }
                  data-track-label={item.title}
                  className={`${base} ${item.highlight ? highlighted : variant}`}
                >
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="size-5 shrink-0 opacity-80">
                      {kindIcon(item)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-center leading-snug">
                    {item.title}
                  </span>
                  {item.highlight ? (
                    <Star
                      aria-label="Featured"
                      className="size-4 shrink-0 fill-current"
                    />
                  ) : (
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        {items.length === 0 && (
          <p className="mt-8 text-sm opacity-70">
            Links will appear here soon.
          </p>
        )}

        <footer className="mt-12 flex flex-col items-center gap-2 text-xs opacity-70">
          <a href={`/${siteSlug}`} className="underline underline-offset-4">
            View full profile
          </a>
          <span>
            Made with{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/signup" className="underline underline-offset-4">
              Folioone
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
