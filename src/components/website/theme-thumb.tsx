import type { ThemeId } from "@/domains/website/config";
import { templateSpec, type TemplateSpec } from "@/domains/website/templates";
import { templateRootStyle } from "@/components/website/template-site";

/**
 * A miniature of a theme for the picker: the template's real palette and display face,
 * arranged like its layout. Decorative (aria-hidden); the card's text names the theme.
 */
export function ThemeThumb({
  id,
  spec: given,
}: {
  id: ThemeId;
  /** A Folio Designer design's spec (code designs are looked up by id). */
  spec?: TemplateSpec;
}) {
  const spec = given ?? templateSpec(id);
  if (!spec) return <BuiltInThumb id={id} />;
  const root = templateRootStyle(spec);
  return (
    <div
      aria-hidden="true"
      className={`relative h-32 overflow-hidden rounded-xl bg-[var(--t-bg)] text-[var(--t-ink)] ring-1 ring-black/5 ${root.className}`}
      style={root.style}
    >
      <Sketch spec={spec} />
    </div>
  );
}

const Line = ({ w, strong = false }: { w: string; strong?: boolean }) => (
  <span
    className={`block h-1.5 rounded-full ${strong ? "bg-[var(--t-ink)]/70" : "bg-[var(--t-muted)]/35"}`}
    style={{ width: w }}
  />
);
const Word = ({ className = "" }: { className?: string }) => (
  <span className={`t-display block leading-none ${className}`}>Aa</span>
);
const Accent = ({ className = "" }: { className?: string }) => (
  <span
    className={`block rounded-[var(--t-radius)] bg-[var(--t-accent)] ${className}`}
  />
);

function Sketch({ spec }: { spec: TemplateSpec }) {
  switch (spec.layout) {
    case "split":
      return (
        <div className="flex h-full items-center gap-3 p-4">
          <div className="flex-1 space-y-2">
            <Word className="text-3xl" />
            <Line w="80%" />
            <Line w="60%" />
            <Accent className="mt-2 h-3 w-10" />
          </div>
          <span className="h-20 w-14 rounded-t-full bg-[var(--t-surface)] ring-1 ring-[var(--t-rule)]" />
        </div>
      );
    case "centered":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4">
          <span className="size-8 rounded-full bg-[var(--t-surface)] ring-1 ring-[var(--t-rule)]" />
          <Word className="text-2xl" />
          <span className="h-px w-6 bg-[var(--t-accent)]" />
          <Line w="50%" />
        </div>
      );
    case "masthead":
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-4">
          <span className="block border-t-2 border-double border-[var(--t-rule)]" />
          <Word className="text-center text-4xl" />
          <span className="block border-t border-[var(--t-rule)]" />
          <div className="grid grid-cols-3 gap-2">
            <Line w="100%" strong />
            <Line w="100%" />
            <Line w="100%" />
          </div>
        </div>
      );
    case "sidebar":
      return (
        <div className="flex h-full">
          <div className="w-1/3 space-y-2 border-r border-[var(--t-rule)] bg-[var(--t-surface)] p-3">
            <span className="block size-6 rounded-[var(--t-radius)] bg-[var(--t-accent)]/80" />
            <Word className="text-lg" />
            <Line w="80%" />
          </div>
          <div className="flex-1 space-y-2 p-4">
            <Line w="90%" strong />
            <Line w="70%" strong />
            <Line w="80%" />
            <Line w="60%" />
          </div>
        </div>
      );
    case "cover":
      return (
        <div className="relative flex h-full items-end p-4">
          <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_15%,var(--t-accent)_0%,transparent_60%)] opacity-60" />
          <div className="relative space-y-2">
            <Word className="text-4xl" />
            <Line w="5rem" />
          </div>
        </div>
      );
    case "poster":
      return (
        <div className="relative h-full p-4">
          <span className="absolute -top-4 -right-4 size-16 rounded-full bg-[var(--t-accent)]" />
          <span className="t-display relative block text-5xl leading-[.85]">
            Aa
          </span>
          <div className="relative mt-3 space-y-1.5">
            <Line w="55%" strong />
            <Line w="40%" />
          </div>
        </div>
      );
    default:
      return (
        <div className="m-3 h-[calc(100%-1.5rem)] rounded-[var(--t-card-radius)] border border-[var(--t-rule)] bg-[var(--t-surface)]">
          <div className="flex gap-1 border-b border-[var(--t-rule)] px-2 py-1.5">
            <span className="size-1.5 rounded-full bg-[#ff5f57]" />
            <span className="size-1.5 rounded-full bg-[#febc2e]" />
            <span className="size-1.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="space-y-1.5 p-2.5 font-mono text-[10px]">
            <p>
              <span className="text-[var(--t-accent)]">$</span> whoami
            </p>
            <Word className="text-lg" />
          </div>
        </div>
      );
  }
}

function BuiltInThumb({ id }: { id: ThemeId }) {
  if (id === "creative")
    return (
      <div aria-hidden="true" className="h-32 rounded-xl bg-[#12101a] p-4">
        <div className="h-3 w-2/3 rounded bg-gradient-to-r from-[#ff7a59] to-[#b66dff]" />
        <div className="mt-2 h-2 w-1/2 rounded bg-white/30" />
        <div className="mt-4 flex gap-2">
          <div className="h-12 w-1/2 rounded bg-white/10" />
          <div className="h-12 w-1/2 rounded bg-white/10" />
        </div>
      </div>
    );
  if (id === "minimal")
    return (
      <div
        aria-hidden="true"
        className="h-32 rounded-xl bg-white p-5 ring-1 ring-black/5"
      >
        <div className="h-2.5 w-1/3 rounded bg-neutral-900" />
        <div className="mt-2 h-1.5 w-1/2 rounded bg-neutral-300" />
        <div className="mt-5 h-1.5 w-full rounded bg-neutral-200" />
        <div className="mt-1.5 h-1.5 w-5/6 rounded bg-neutral-200" />
      </div>
    );
  return (
    <div
      aria-hidden="true"
      className="h-32 rounded-xl bg-[#faf8f4] p-4 ring-1 ring-[#e2ddd1]"
    >
      <div className="h-3 w-1/2 rounded bg-[#1f2328]" />
      <div className="mt-2 h-2 w-2/3 rounded bg-[#2f4a5a]/50" />
      <div className="mt-4 ml-1 space-y-1.5 border-l-2 border-[#d9d4c8] pl-3">
        <div className="h-1.5 w-3/4 rounded bg-[#d9d4c8]" />
        <div className="h-1.5 w-2/3 rounded bg-[#d9d4c8]" />
        <div className="h-1.5 w-1/2 rounded bg-[#d9d4c8]" />
      </div>
    </div>
  );
}
