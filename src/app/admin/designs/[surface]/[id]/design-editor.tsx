"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TemplateSite } from "@/components/website/template-site";
import { BusinessCard } from "@/components/cards/business-card";
import {
  CARD_EMBOSSES,
  CARD_LAYOUTS,
  FONT_KEYS,
  FONT_LABELS,
  HEADING_STYLES,
  SECTION_STYLES,
  WEBSITE_LAYOUTS,
  cardSpecSchema,
  toCardDesign,
  toTemplateSpec,
  websiteSpecSchema,
  type CardSpec,
  type DesignSurface,
  type WebsiteSpec,
} from "@/domains/designs/design-spec";
import {
  designProblems,
  type DesignProblem,
} from "@/domains/designs/design-checks";
import type { PublishedContent } from "@/domains/website/published-content";
import type { CardContent } from "@/domains/cards/card-content";
import type { AdminDesign } from "@/domains/designs/design-admin-service";
import {
  deleteDesignAction,
  generateVersionAction,
  publishDesignAction,
  retireDesignAction,
  saveVersionAction,
  updateDetailsAction,
} from "../../actions";
import { ChoiceSelect, asOptions } from "../../choice-select";

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};
type DesignProps = Serialized<AdminDesign>;

type Samples =
  | { kind: "website"; sample: PublishedContent; own: PublishedContent | null }
  | { kind: "card"; sample: CardContent; own: CardContent | null };

const WEIGHTS = [300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: String(w),
  label: String(w),
}));
const FONTS = FONT_KEYS.map((f) => ({ value: f, label: FONT_LABELS[f] }));

const WEBSITE_COLOURS: [keyof WebsiteSpec["palette"], string][] = [
  ["bg", "Background"],
  ["surface", "Panels"],
  ["ink", "Main text"],
  ["muted", "Secondary text"],
  ["accent", "Accent"],
  ["onAccent", "Text on accent"],
  ["rule", "Lines"],
];
const CARD_COLOURS: [keyof CardSpec["palette"], string][] = [
  ["bg", "Card"],
  ["ink", "Name"],
  ["muted", "Details"],
  ["accent", "Accent"],
  ["onAccent", "Text on accent"],
];

export function DesignEditor({
  surface,
  design,
  categories,
  aiAvailable,
  samples,
}: {
  surface: DesignSurface;
  design: DesignProps;
  categories: string[];
  aiAvailable: boolean;
  samples: Samples;
}) {
  const router = useRouter();
  const newest = design.versions[0];
  const [selected, setSelected] = useState<number>(newest?.version ?? 0);
  const selectedVersion = design.versions.find((v) => v.version === selected);
  const [spec, setSpec] = useState<WebsiteSpec | CardSpec | null>(
    newest?.spec ?? null,
  );
  const [baseline, setBaseline] = useState(JSON.stringify(newest?.spec));
  const [prompt, setPrompt] = useState("");
  const [who, setWho] = useState<"sample" | "me">("sample");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [serverProblems, setServerProblems] = useState<DesignProblem[]>([]);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"delete" | "retire" | null>(null);
  const [pendingSelect, setPendingSelect] = useState<number | null>(null);

  // After a save / generate, the page reloads with the new version: show it in the editor.
  useEffect(() => {
    if (pendingSelect === null) return;
    const v = design.versions.find((x) => x.version === pendingSelect);
    if (v?.spec) {
      setSelected(v.version);
      setSpec(v.spec);
      setBaseline(JSON.stringify(v.spec));
      setPendingSelect(null);
    }
  }, [design.versions, pendingSelect]);

  const schema = surface === "website" ? websiteSpecSchema : cardSpecSchema;
  const valid = spec ? schema.safeParse(spec) : null;
  const problems = useMemo(
    () => (valid?.success ? designProblems(surface, valid.data) : []),
    [surface, valid?.success, valid?.data],
  );
  const dirty = JSON.stringify(spec) !== baseline;
  const live = design.status === "published" ? design.currentVersion : null;

  function run(
    action: () => Promise<{
      ok: boolean;
      message?: string;
      problems?: DesignProblem[];
      version?: number;
    }>,
    after?: (version?: number) => void,
  ) {
    setMessage(null);
    start(async () => {
      const r = await action();
      setServerProblems(r.problems ?? []);
      setMessage({ ok: r.ok, text: r.message ?? (r.ok ? "Done." : "") });
      if (r.ok) {
        after?.(r.version);
        router.refresh();
      }
    });
  }

  const load = (version: number) => {
    const v = design.versions.find((x) => x.version === version);
    if (!v?.spec) return;
    setSelected(version);
    setSpec(v.spec);
    setBaseline(JSON.stringify(v.spec));
    setServerProblems([]);
  };

  const set = (patch: Partial<WebsiteSpec> | Partial<CardSpec>) =>
    setSpec((s) => (s ? ({ ...s, ...patch } as WebsiteSpec | CardSpec) : s));
  const setColour = (key: string, value: string) =>
    setSpec((s) =>
      s
        ? ({
            ...s,
            palette: { ...s.palette, [key]: value.toLowerCase() },
          } as WebsiteSpec | CardSpec)
        : s,
    );

  const previewUrl = `/admin/designs/${surface}/${design.id}/preview?v=${selected}&with=${who}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="eyebrow">
            {surface === "website" ? "Website design" : "Digital card design"}
          </p>
          <h1 className="font-display mt-3 text-3xl md:text-[2.5rem] md:leading-tight">
            {design.label}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {design.status === "draft"
              ? "Draft: only platform admins can see it."
              : design.status === "published"
                ? `Live: version ${design.currentVersion} is offered to everyone${design.tier === "pro" ? " on PRO" : ""}.`
                : `Retired: no longer offered. Sites that use it keep version ${design.currentVersion}.`}
          </p>
        </div>
        <Badge data-testid="design-status">
          {design.status[0]!.toUpperCase() + design.status.slice(1)}
        </Badge>
      </header>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-md px-4 py-3 text-sm ${message.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ controls */}
        <div className="space-y-6">
          <Panel title="Ask the AI">
            <Textarea
              aria-label="Describe a change"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={!aiAvailable}
              placeholder={
                aiAvailable
                  ? "e.g. Make it warmer, swap the accent for terracotta and use a sidebar layout."
                  : "AI is not configured on this server. Edit the values below."
              }
            />
            <Button
              type="button"
              className="mt-3"
              disabled={!aiAvailable || pending || prompt.trim().length < 3}
              onClick={() =>
                run(
                  () => generateVersionAction(surface, design.id, prompt, spec),
                  (v) => {
                    setPrompt("");
                    if (v) setPendingSelect(v);
                  },
                )
              }
            >
              <Sparkles className="size-4" aria-hidden />
              {pending ? "Working…" : "Generate a new version"}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              The AI starts from the values in the editor and returns design
              values only (never code). Each result is saved as a new draft
              version.
            </p>
          </Panel>

          {spec && (
            <Panel title="Design values">
              {surface === "website" ? (
                <WebsiteFields
                  spec={spec as WebsiteSpec}
                  set={set}
                  setColour={setColour}
                />
              ) : (
                <CardFields
                  spec={spec as CardSpec}
                  set={set}
                  setColour={setColour}
                />
              )}
              {valid && !valid.success && (
                <p role="alert" className="text-danger mt-3 text-xs">
                  {valid.error.issues[0]?.path.join(".")}:{" "}
                  {valid.error.issues[0]?.message}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!dirty || pending || !valid?.success}
                  onClick={() =>
                    run(
                      () => saveVersionAction(surface, design.id, spec),
                      (v) => v && setPendingSelect(v),
                    )
                  }
                >
                  Save as new version
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!dirty || pending}
                  onClick={() => load(selected)}
                >
                  <RotateCcw className="size-4" aria-hidden /> Undo changes
                </Button>
              </div>
            </Panel>
          )}

          <Checks
            problems={
              dirty ? problems : (selectedVersion?.problems ?? problems)
            }
            extra={serverProblems}
          />

          <DetailsForm
            surface={surface}
            design={design}
            categories={categories}
            pending={pending}
            onSave={(input) =>
              run(() => updateDetailsAction(surface, design.id, input))
            }
          />

          <Panel title="Publishing">
            <p className="text-muted-foreground text-sm">
              {dirty
                ? "Save your changes as a version before publishing."
                : `Editing version ${selected}.${live === selected ? " This is the live version." : ""}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  pending ||
                  dirty ||
                  !selectedVersion?.spec ||
                  (selectedVersion?.problems.length ?? 0) > 0 ||
                  (live === selected && design.status === "published")
                }
                onClick={() =>
                  run(() => publishDesignAction(surface, design.id, selected))
                }
              >
                {design.status === "draft"
                  ? `Publish version ${selected}`
                  : `Make version ${selected} live`}
              </Button>
              {design.status === "published" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setConfirm("retire")}
                >
                  Retire
                </Button>
              )}
              {design.status === "retired" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => retireDesignAction(surface, design.id, false))
                  }
                >
                  Offer again
                </Button>
              )}
              {design.status === "draft" && !design.publishedAt && (
                <Button
                  type="button"
                  variant="destructive-outline"
                  disabled={pending}
                  onClick={() => setConfirm("delete")}
                >
                  Delete draft
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Sites and cards keep the version they were published with. After
              you make a new version live, owners see it the next time they
              publish.
            </p>
          </Panel>

          <Panel title="Versions">
            <ol className="divide-border divide-y" aria-label="Versions">
              {design.versions.map((v) => (
                <li
                  key={v.version}
                  className="flex items-start justify-between gap-3 py-2.5"
                  data-testid="design-version"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      Version {v.version}
                      {v.version === design.currentVersion &&
                        design.status !== "draft" && (
                          <span className="text-success ml-2 text-xs">
                            live
                          </span>
                        )}
                      {v.problems.length > 0 && (
                        <span className="text-danger ml-2 text-xs">
                          {v.problems.length} contrast{" "}
                          {v.problems.length === 1 ? "problem" : "problems"}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {v.origin === "ai" ? "AI" : "Edited by hand"} ·{" "}
                      {v.createdAt.slice(0, 16).replace("T", " ")}
                      {v.prompt ? ` · “${v.prompt}”` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={v.version === selected ? "secondary" : "outline"}
                    disabled={!v.spec || v.version === selected}
                    onClick={() => load(v.version)}
                  >
                    {v.version === selected ? "Open" : "Load"}
                  </Button>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* ------------------------------------------------------------- preview */}
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Preview content"
              className="bg-muted flex gap-1 rounded-full p-1"
            >
              {(
                [
                  ["sample", "Sample person"],
                  ["me", "My profile"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={who === id}
                  disabled={id === "me" && !samples.own}
                  onClick={() => setWho(id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium disabled:opacity-40 ${who === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Full preview of version {selected}
              {dirty ? " (saved values)" : ""}
            </a>
          </div>
          <div
            className="border-border overflow-hidden rounded-lg border bg-white"
            data-testid="design-preview"
          >
            {spec && valid?.success ? (
              samples.kind === "website" ? (
                <Scaled width={1280} maxHeight={720}>
                  <TemplateSite
                    spec={toTemplateSpec(design, valid.data as WebsiteSpec)}
                    content={(who === "me" && samples.own) || samples.sample}
                  />
                </Scaled>
              ) : (
                <div
                  className={`grid gap-6 p-6 md:p-10 ${(valid.data as CardSpec).dark ? "bg-[#111113]" : "bg-[#f0f0f2]"}`}
                >
                  <BusinessCard
                    design={toCardDesign(design, valid.data as CardSpec)}
                    content={(who === "me" && samples.own) || samples.sample}
                    cardClassName="shadow-[0_30px_60px_-25px_rgba(0,0,0,.45)]"
                  />
                </div>
              )
            ) : (
              <p className="text-muted-foreground p-6 text-sm">
                Fix the values to see a preview.
              </p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "retire"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Retire this design?"
        description="It stops being offered in the design pickers. Sites and cards already using it keep it, and can still republish with it."
        confirmLabel="Retire design"
        pending={pending}
        onConfirm={() =>
          run(
            () => retireDesignAction(surface, design.id, true),
            () => setConfirm(null),
          )
        }
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft?"
        description="The design and all its versions are deleted. This cannot be undone."
        confirmLabel="Delete draft"
        tone="danger"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const r = await deleteDesignAction(surface, design.id);
            if (r.ok) router.push(`/admin/designs?surface=${surface}`);
            else {
              setConfirm(null);
              setMessage({ ok: false, text: r.message });
            }
          })
        }
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card rounded-lg border p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Checks({
  problems,
  extra,
}: {
  problems: DesignProblem[];
  extra: DesignProblem[];
}) {
  const all = problems.length ? problems : extra;
  return (
    <section
      aria-label="Readability checks"
      data-testid="design-checks"
      className={`rounded-lg border p-4 text-sm ${all.length ? "border-danger/30 bg-danger-soft" : "border-success/30 bg-success-soft"}`}
    >
      {all.length ? (
        <>
          <p className="text-danger flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Not readable enough
            to publish (WCAG AA)
          </p>
          <ul className="text-danger mt-2 list-disc space-y-1 pl-5 text-xs">
            {all.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-success flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4" aria-hidden /> Text contrast passes
          WCAG AA
        </p>
      )}
    </section>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground block text-xs font-medium">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="border-border h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          aria-label={`${label} hex`}
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value))
              onChange(e.target.value);
          }}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}

type Setter = (patch: Partial<WebsiteSpec> | Partial<CardSpec>) => void;

function WebsiteFields({
  spec,
  set,
  setColour,
}: {
  spec: WebsiteSpec;
  set: Setter;
  setColour: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceSelect
          label="Layout"
          value={spec.layout}
          options={asOptions(WEBSITE_LAYOUTS)}
          onChange={(v) => set({ layout: v as WebsiteSpec["layout"] })}
        />
        <ChoiceSelect
          label="Sections"
          value={spec.sections}
          options={asOptions(SECTION_STYLES)}
          onChange={(v) => set({ sections: v as WebsiteSpec["sections"] })}
        />
        <ChoiceSelect
          label="Headings"
          value={spec.heading}
          options={asOptions(HEADING_STYLES)}
          onChange={(v) => set({ heading: v as WebsiteSpec["heading"] })}
        />
        <ChoiceSelect
          label="Headline weight"
          value={String(spec.displayWeight)}
          options={WEIGHTS}
          onChange={(v) => set({ displayWeight: Number(v) })}
        />
        <ChoiceSelect
          label="Headline typeface"
          value={spec.display}
          options={FONTS}
          onChange={(v) => set({ display: v as WebsiteSpec["display"] })}
        />
        <ChoiceSelect
          label="Body typeface"
          value={spec.body}
          options={FONTS}
          onChange={(v) => set({ body: v as WebsiteSpec["body"] })}
        />
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Letter spacing (em)
          </span>
          <Input
            value={spec.displayTracking}
            onChange={(e) => set({ displayTracking: e.target.value })}
            className="font-mono text-xs"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Corner radius (px; 999 = pills)
          </span>
          <Input
            type="number"
            min={0}
            max={999}
            value={spec.radius}
            onChange={(e) => set({ radius: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={spec.displayItalic}
          onChange={(e) => set({ displayItalic: e.target.checked })}
        />
        Italic headlines
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {WEBSITE_COLOURS.map(([key, label]) => (
          <ColourField
            key={key}
            label={label}
            value={spec.palette[key]}
            onChange={(v) => setColour(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function CardFields({
  spec,
  set,
  setColour,
}: {
  spec: CardSpec;
  set: Setter;
  setColour: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceSelect
          label="Layout"
          value={spec.layout}
          options={asOptions(CARD_LAYOUTS)}
          onChange={(v) => set({ layout: v as CardSpec["layout"] })}
        />
        <ChoiceSelect
          label="Emboss"
          value={spec.emboss}
          options={asOptions(CARD_EMBOSSES)}
          onChange={(v) => set({ emboss: v as CardSpec["emboss"] })}
        />
        <ChoiceSelect
          label="Name typeface"
          value={spec.display}
          options={FONTS}
          onChange={(v) => set({ display: v as CardSpec["display"] })}
        />
        <ChoiceSelect
          label="Details typeface"
          value={spec.body}
          options={FONTS}
          onChange={(v) => set({ body: v as CardSpec["body"] })}
        />
        <ChoiceSelect
          label="Name weight"
          value={String(spec.displayWeight)}
          options={WEIGHTS}
          onChange={(v) => set({ displayWeight: Number(v) })}
        />
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Corner radius (0 to 0.08)
          </span>
          <Input
            type="number"
            min={0}
            max={0.08}
            step={0.005}
            value={spec.radius}
            onChange={(e) => set({ radius: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-3">
          <Switch
            checked={spec.dark}
            onChange={(e) => set({ dark: e.target.checked })}
          />
          Dark card
        </label>
        <label className="flex items-center gap-3">
          <Switch
            checked={spec.glow}
            onChange={(e) => set({ glow: e.target.checked })}
          />
          Accent glow
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CARD_COLOURS.map(([key, label]) => (
          <ColourField
            key={key}
            label={label}
            value={spec.palette[key]}
            onChange={(v) => setColour(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function DetailsForm({
  surface,
  design,
  categories,
  pending,
  onSave,
}: {
  surface: DesignSurface;
  design: DesignProps;
  categories: string[];
  pending: boolean;
  onSave: (input: {
    label: string;
    category: string;
    blurb: string;
    tier: string;
  }) => void;
}) {
  const [label, setLabel] = useState(design.label);
  const [category, setCategory] = useState(design.category);
  const [blurb, setBlurb] = useState(design.blurb);
  const [tier, setTier] = useState<string>(design.tier);
  const dirty =
    label !== design.label ||
    category !== design.category ||
    blurb !== design.blurb ||
    tier !== design.tier;
  return (
    <Panel title="Details">
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Name
          </span>
          <Input
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceSelect
            label="Category"
            value={category}
            options={categories.map((c) => ({ value: c, label: c }))}
            onChange={setCategory}
          />
          <ChoiceSelect
            label="Plan"
            value={tier}
            options={[
              { value: "pro", label: "PRO only" },
              { value: "free", label: "Free for everyone" },
            ]}
            onChange={setTier}
          />
        </div>
        {surface === "website" && (
          <label className="block space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Description shown in the picker
            </span>
            <Textarea
              value={blurb}
              rows={2}
              maxLength={300}
              onChange={(e) => setBlurb(e.target.value)}
            />
          </label>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending || !label.trim()}
          onClick={() => onSave({ label, category, blurb, tier })}
        >
          Save details
        </Button>
      </div>
    </Panel>
  );
}

/** Renders a full-width page at `width` px and scales it down to fit its column. */
function Scaled({
  width,
  maxHeight,
  children,
}: {
  width: number;
  maxHeight: number;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [full, setFull] = useState(maxHeight);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const s = Math.min(1, o.clientWidth / width);
      setScale(s);
      setFull(i.scrollHeight * s);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, [width, maxHeight]);
  return (
    <div
      ref={outer}
      className="relative overflow-x-hidden overflow-y-auto"
      style={{ height: Math.min(maxHeight, full) }}
    >
      {/* The transform does not change layout size, so a sizer holds the scaled height. */}
      <div style={{ height: full, overflow: "hidden" }}>
        <div
          ref={inner}
          aria-hidden="true"
          style={{
            width,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
