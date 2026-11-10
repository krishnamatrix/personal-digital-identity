import type { CSSProperties, ReactNode } from "react";
import {
  Github,
  Globe,
  Link2,
  Linkedin,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { templateFonts } from "@/components/website/template-fonts";
import type { CardDesign } from "@/domains/cards/card-designs";
import {
  shortUrl,
  type CardContent,
  type CardLinkKind,
} from "@/domains/cards/card-content";

/**
 * A business card, drawn entirely from a design description and the card content. It scales
 * with its container (sizes are in container-query units), so the picker thumbnail, the live
 * preview and the public card are the same artwork. `interactive` turns details into links.
 */

type Item = { key: string; icon: ReactNode; text: string; href?: string };

const XLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-full">
    <path
      fill="currentColor"
      d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"
    />
  </svg>
);

const LINK_ICON: Record<CardLinkKind, ReactNode> = {
  linkedin: <Linkedin aria-hidden className="size-full" />,
  x: <XLogo />,
  github: <Github aria-hidden className="size-full" />,
  website: <Globe aria-hidden className="size-full" />,
  custom: <Link2 aria-hidden className="size-full" />,
};

function items(c: CardContent): Item[] {
  const out: Item[] = [];
  if (c.email)
    out.push({
      key: "email",
      icon: <Mail aria-hidden className="size-full" />,
      text: c.email,
      href: `mailto:${c.email}`,
    });
  if (c.phone)
    out.push({
      key: "phone",
      icon: <Phone aria-hidden className="size-full" />,
      text: c.phone,
      href: `tel:${c.phone.replace(/[^\d+]/g, "")}`,
    });
  for (const l of c.links)
    out.push({
      key: l.kind,
      icon: LINK_ICON[l.kind],
      text: l.kind === "custom" ? l.label : shortUrl(l.url),
      href: l.url,
    });
  if (c.location)
    out.push({
      key: "location",
      icon: <MapPin aria-hidden className="size-full" />,
      text: c.location,
    });
  return out;
}

export function cardRootStyle(design: CardDesign): {
  className: string;
  style: CSSProperties;
} {
  const fonts = templateFonts(design.display, design.body);
  const p = design.palette;
  return {
    className: fonts.className,
    style: {
      "--c-bg": p.bg,
      "--c-ink": p.ink,
      "--c-muted": p.muted,
      "--c-accent": p.accent,
      "--c-on-accent": p.onAccent,
      "--c-display": fonts.display,
      "--c-body": fonts.body,
      "--c-dw": String(design.displayWeight),
      borderRadius: `${design.radius * 100}cqw`,
    } as CSSProperties,
  };
}

/* --------------------------------- emboss -------------------------------- */

function Monogram({
  initials,
  dark,
  onAccent = false,
  className,
}: {
  initials: string;
  dark: boolean;
  onAccent?: boolean;
  className: string;
}) {
  // The letters take the surface colour; a light edge and a dark edge make them look pressed in.
  const shadow = dark
    ? "0.22cqw 0.22cqw 0.35cqw rgba(0,0,0,.55), -0.16cqw -0.16cqw 0.3cqw rgba(255,255,255,.08)"
    : "0.22cqw 0.22cqw 0.3cqw rgba(255,255,255,.85), -0.16cqw -0.16cqw 0.35cqw rgba(0,0,0,.12)";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute leading-none select-none ${className}`}
      style={{
        fontFamily: "var(--c-display)",
        fontWeight: 600,
        color: onAccent ? "var(--c-accent)" : "var(--c-bg)",
        textShadow: onAccent
          ? "0.22cqw 0.22cqw 0.35cqw rgba(0,0,0,.28), -0.16cqw -0.16cqw 0.3cqw rgba(255,255,255,.22)"
          : shadow,
      }}
    >
      {initials || "·"}
    </span>
  );
}

function Photo({
  src,
  dark,
  className,
  mask,
  strength = "soft",
}: {
  src: string;
  dark: boolean;
  className: string;
  mask: string;
  strength?: "soft" | "panel";
}) {
  const opacity = strength === "panel" ? 0.5 : dark ? 0.26 : 0.16;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`pointer-events-none absolute object-cover grayscale select-none ${className}`}
      style={{
        opacity,
        mixBlendMode: dark || strength === "panel" ? "luminosity" : "multiply",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

/** Photo watermark when the design uses one and a photo exists; otherwise the initials. */
function Emboss({
  design,
  content,
  where,
}: {
  design: CardDesign;
  content: CardContent;
  where: "right" | "center" | "panel" | "band";
}) {
  if (design.emboss === "none") return null;
  const photo = design.emboss === "photo" ? content.photoUrl : undefined;
  if (photo) {
    const geometry = {
      right: {
        className: "inset-y-0 right-0 h-full w-[58%]",
        mask: "linear-gradient(to left, black 35%, transparent)",
      },
      center: {
        className: "inset-0 size-full",
        mask: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
      },
      panel: {
        className: "inset-0 size-full",
        mask: "linear-gradient(black, black)",
      },
      band: {
        className: "inset-y-0 right-0 h-full w-1/2",
        mask: "linear-gradient(to left, black 30%, transparent)",
      },
    }[where];
    return (
      <Photo
        src={photo}
        dark={design.dark}
        strength={where === "panel" ? "panel" : "soft"}
        {...geometry}
      />
    );
  }
  const place = {
    right: "-right-[3cqw] top-1/2 -translate-y-1/2 text-[38cqw]",
    center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[44cqw]",
    panel: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[24cqw]",
    band: "right-[3cqw] top-1/2 -translate-y-1/2 text-[22cqw]",
  }[where];
  return (
    <Monogram
      initials={content.initials}
      dark={design.dark}
      onAccent={where === "panel" || where === "band"}
      className={place}
    />
  );
}

/* -------------------------------- pieces --------------------------------- */

const Name = ({
  content,
  className = "",
  style,
}: {
  content: CardContent;
  className?: string;
  style?: CSSProperties;
}) => (
  <p
    className={`leading-[1.05] tracking-[-0.01em] break-words ${className}`}
    style={{
      fontFamily: "var(--c-display)",
      fontWeight: "var(--c-dw)" as unknown as number,
      ...style,
    }}
  >
    {content.name}
  </p>
);

const Role = ({
  content,
  className = "",
}: {
  content: CardContent;
  className?: string;
}) =>
  content.role ? (
    <p className={`mt-[1.2cqw] text-[2.9cqw] leading-snug ${className}`}>
      {content.role}
    </p>
  ) : null;

function Details({
  content,
  interactive,
  align = "start",
  columns = "auto",
  className = "",
}: {
  content: CardContent;
  interactive: boolean;
  align?: "start" | "center" | "end";
  columns?: "auto" | "one";
  className?: string;
}) {
  const list = items(content);
  if (!list.length) return null;
  const two = columns === "auto" && list.length > 4;
  return (
    <ul
      className={`grid gap-x-[4cqw] gap-y-[1.1cqw] text-[2.55cqw] leading-tight ${two ? "grid-cols-2" : "grid-cols-1"} ${align === "center" ? "justify-items-center" : align === "end" ? "justify-items-end" : ""} ${className}`}
    >
      {list.map((item) => {
        const body = (
          <>
            <span className="size-[2.6cqw] shrink-0 opacity-80">
              {item.icon}
            </span>
            <span className="min-w-0 truncate">{item.text}</span>
          </>
        );
        return (
          <li key={item.key} className="flex max-w-full min-w-0">
            {interactive && item.href ? (
              <a
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer me"
                className="flex min-w-0 items-center gap-[1.3cqw] underline-offset-[0.5cqw] hover:underline"
              >
                {body}
              </a>
            ) : (
              <span className="flex min-w-0 items-center gap-[1.3cqw]">
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------- layouts -------------------------------- */

type LayoutProps = {
  design: CardDesign;
  content: CardContent;
  interactive: boolean;
};

function Classic({ design, content, interactive }: LayoutProps) {
  return (
    <>
      <Emboss design={design} content={content} where="right" />
      <div className="relative flex h-full flex-col justify-between p-[7cqw]">
        <div className="max-w-[70%]">
          <Name content={content} className="text-[6.6cqw]" />
          <Role content={content} className="text-[var(--c-muted)]" />
          <span className="mt-[2.6cqw] block h-[0.45cqw] w-[9cqw] bg-[var(--c-accent)]" />
        </div>
        <Details
          content={content}
          interactive={interactive}
          className="max-w-[86%]"
        />
      </div>
    </>
  );
}

function Centered({ design, content, interactive }: LayoutProps) {
  return (
    <>
      <Emboss design={design} content={content} where="center" />
      <div className="relative flex h-full flex-col items-center justify-center px-[7cqw] pt-[5cqw] pb-[6cqw] text-center">
        <div className="flex flex-1 flex-col items-center justify-center">
          <Name content={content} className="text-[6.8cqw]" />
          <Role content={content} className="text-[var(--c-muted)]" />
        </div>
        <span className="mb-[3cqw] block h-[0.3cqw] w-[10cqw] bg-[var(--c-accent)]" />
        <Details
          content={content}
          interactive={interactive}
          align="center"
          className="max-w-full"
        />
      </div>
    </>
  );
}

function Split({ design, content, interactive }: LayoutProps) {
  return (
    <div className="flex h-full">
      <div className="relative w-[36%] shrink-0 overflow-hidden bg-[var(--c-accent)]">
        <Emboss design={design} content={content} where="panel" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between p-[6.5cqw]">
        <div>
          <Name content={content} className="text-[6cqw]" />
          <Role content={content} className="text-[var(--c-muted)]" />
        </div>
        <Details content={content} interactive={interactive} columns="one" />
      </div>
    </div>
  );
}

function Banner({ design, content, interactive }: LayoutProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-[40%] shrink-0 flex-col justify-end overflow-hidden bg-[var(--c-accent)] px-[7cqw] pb-[4cqw] text-[var(--c-on-accent)]">
        <Emboss design={design} content={content} where="band" />
        <Name content={content} className="relative text-[6.2cqw]" />
      </div>
      <div className="flex flex-1 flex-col justify-between px-[7cqw] pt-[3.4cqw] pb-[6cqw]">
        <Role content={content} className="!mt-0 text-[var(--c-muted)]" />
        <Details content={content} interactive={interactive} />
      </div>
    </div>
  );
}

function Edge({ design, content, interactive }: LayoutProps) {
  return (
    <>
      <span className="absolute inset-y-0 left-0 w-[1.8cqw] bg-[var(--c-accent)]" />
      <Emboss design={design} content={content} where="right" />
      <div className="relative flex h-full flex-col justify-between py-[6.5cqw] pr-[7cqw] pl-[9cqw]">
        <Details
          content={content}
          interactive={interactive}
          align="end"
          columns="one"
          className="self-end"
        />
        <div>
          <Name content={content} className="text-[7.6cqw]" />
          <Role content={content} className="text-[var(--c-muted)]" />
        </div>
      </div>
    </>
  );
}

function Frame({ design, content, interactive }: LayoutProps) {
  return (
    <>
      <span className="pointer-events-none absolute inset-[3.2cqw] border-[0.25cqw] border-[var(--c-accent)] opacity-60" />
      <Emboss design={design} content={content} where="center" />
      <div className="relative flex h-full flex-col items-center justify-center px-[10cqw] py-[8cqw] text-center">
        <p className="text-[2.2cqw] tracking-[0.35em] text-[var(--c-muted)] uppercase">
          {content.initials}
        </p>
        <Name content={content} className="mt-[1.5cqw] text-[6.4cqw]" />
        <Role content={content} className="text-[var(--c-muted)]" />
        <Details
          content={content}
          interactive={interactive}
          align="center"
          className="mt-[4cqw] max-w-full"
        />
      </div>
    </>
  );
}

function Terminal({ design, content, interactive }: LayoutProps) {
  return (
    <>
      <Emboss design={design} content={content} where="right" />
      <div className="relative flex h-full flex-col justify-between p-[6.5cqw]">
        <div className="flex gap-[1.2cqw]">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span
              key={c}
              className="size-[1.6cqw] rounded-full"
              style={{ background: c }}
            />
          ))}
        </div>
        <div>
          <p className="text-[2.6cqw] text-[var(--c-accent)]">$ whoami</p>
          <Name content={content} className="mt-[1cqw] text-[5.6cqw]" />
          {content.role && (
            <p className="mt-[1cqw] text-[2.7cqw] text-[var(--c-muted)]">
              # {content.role}
            </p>
          )}
        </div>
        <Details content={content} interactive={interactive} />
      </div>
    </>
  );
}

const LAYOUTS = {
  classic: Classic,
  centered: Centered,
  split: Split,
  banner: Banner,
  edge: Edge,
  frame: Frame,
  terminal: Terminal,
} as const;

export function BusinessCard({
  design,
  content,
  interactive = false,
  className = "",
  cardClassName = "",
}: {
  design: CardDesign;
  content: CardContent;
  interactive?: boolean;
  /** Classes for the sizing wrapper. */
  className?: string;
  /** Classes for the card face itself (e.g. a shadow that follows its corners). */
  cardClassName?: string;
}) {
  const root = cardRootStyle(design);
  const Layout = LAYOUTS[design.layout];
  return (
    <div className={`@container w-full ${className}`}>
      <div
        data-card-design={design.id}
        className={`relative isolate aspect-[1.75/1] w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-ink)] ${root.className} ${cardClassName}`}
        style={{ ...root.style, fontFamily: "var(--c-body)" }}
      >
        {design.glow && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-[30%] -right-[20%] -z-10 size-[80%] rounded-full opacity-40 blur-[6cqw]"
            style={{ background: "var(--c-accent)" }}
          />
        )}
        <Layout design={design} content={content} interactive={interactive} />
      </div>
    </div>
  );
}
