"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BusinessCard } from "@/components/cards/business-card";
import { CardWithQr } from "@/components/cards/card-with-qr";
import {
  CARD_FIELDS,
  CARD_INITIALS_MAX,
  CARD_NAME_MAX,
  CARD_TYPES,
  CUSTOM_LABEL_MAX,
  TYPE_DEFAULT_FIELDS,
  initialsOf,
  type CardConfig,
  type CardField,
  type CardStatus,
  type CardType,
} from "@/domains/cards/card-config";
import {
  CARD_CATEGORIES,
  CARD_DESIGNS,
  cardDesign,
  type CardCategory,
} from "@/domains/cards/card-designs";
import {
  cardProblems,
  cardVCard,
  composeCardContent,
  shortUrl,
} from "@/domains/cards/card-content";
import type { CardState } from "@/domains/cards/card-service";
import { SLUG_MESSAGES } from "@/domains/website/slug";
import {
  checkCardSlugAction,
  publishCardAction,
  saveCardAction,
  saveCardSlugAction,
  unpublishCardAction,
} from "@/app/cards/actions";

type Step = "details" | "design" | "share";
const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "design", label: "Design" },
  { id: "share", label: "Share" },
];

const STATUS_LABEL: Record<CardStatus, string> = {
  not_created: "Not created",
  draft: "Draft",
  published: "Live",
  unpublished: "Unpublished",
};

const TYPE_CATEGORY: Record<CardType, CardCategory> = {
  professional: "Professional",
  personal: "Personal",
  social: "Social",
  creative: "Creative",
};

/** Where each field comes from, for the "add it in your profile" hint. */
const FIELD_SOURCE: Record<Exclude<CardField, "custom">, string> = {
  role: "/profile?section=professional",
  email: "/profile",
  phone: "/profile",
  location: "/profile",
  linkedin: "/profile?section=social",
  x: "/profile?section=social",
  github: "/profile?section=social",
  website: "/profile?section=social",
};

export function CardsWorkspace({
  initial,
  origin,
}: {
  initial: CardState;
  origin: string;
}) {
  const [step, setStep] = useState<Step>("details");
  const [config, setConfig] = useState<CardConfig>(initial.config);
  const [saved, setSaved] = useState<CardConfig>(initial.config);
  const [status, setStatus] = useState<CardStatus>(initial.status);
  const [slug, setSlug] = useState<string | null>(initial.slug);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<"Suggested" | CardCategory>(
    "Suggested",
  );

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const content = useMemo(
    () =>
      composeCardContent(
        {
          values: initial.values,
          profileName: initial.profileName,
          photoUrl: initial.photoUrl,
        },
        config,
      ),
    [config, initial.values, initial.profileName, initial.photoUrl],
  );
  // Thumbnails and preview never show an empty name.
  const shown = content.name
    ? content
    : { ...content, name: "Your Name", initials: "YN" };
  const design = cardDesign(config.design);
  const cardUrl = slug ? `${origin}/social/${slug}` : null;
  const problems = cardProblems(content);

  const update = (patch: Partial<CardConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));
  const toggleField = (f: CardField, on: boolean) =>
    setConfig((c) => ({
      ...c,
      fields: CARD_FIELDS.map((x) => x.id).filter((x) =>
        x === f ? on : c.fields.includes(x),
      ),
    }));
  const chooseType = (type: CardType) =>
    setConfig((c) => ({
      ...c,
      type,
      // The usual details for this kind of card, limited to what the profile holds.
      fields: TYPE_DEFAULT_FIELDS[type].filter((f) =>
        f === "custom" ? Boolean(c.customLink.url) : Boolean(initial.values[f]),
      ),
    }));

  function save(next?: Step) {
    start(async () => {
      const result = await saveCardAction(config);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setSaved(config);
        if (status === "not_created") setStatus("draft");
        if (next) setStep(next);
      }
    });
  }

  const designs = useMemo(() => {
    if (category !== "Suggested")
      return CARD_DESIGNS.filter((d) => d.category === category);
    const lead = TYPE_CATEGORY[config.type];
    return [
      ...CARD_DESIGNS.filter((d) => d.category === lead),
      ...CARD_DESIGNS.filter((d) => d.category !== lead),
    ];
  }, [category, config.type]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="eyebrow">My presence</p>
          <h1 className="font-display mt-3 text-3xl md:text-[2.5rem] md:leading-tight">
            Digital Cards
          </h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            A business card that lives at its own link. Choose what to show from
            your profile, pick a design, and share it, or let someone scan its
            QR code to save your details.
          </p>
        </div>
        <Badge>{STATUS_LABEL[status]}</Badge>
      </header>

      <nav aria-label="Card steps" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={step === s.id ? "step" : undefined}
            onClick={() => setStep(s.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${step === s.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-black/5"}`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[11px] ${step === s.id ? "bg-background/20" : "bg-muted"}`}
            >
              {i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="min-w-0 space-y-6">
          {step === "details" && (
            <>
              <section className="border-border bg-card rounded-lg border p-6">
                <h2 className="text-base font-semibold">Type of card</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Sets the usual details and suggests designs. You can change
                  every detail below.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Type of card"
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  {CARD_TYPES.map((t) => {
                    const active = config.type === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => chooseType(t.id)}
                        className={`rounded-md border p-4 text-left transition-colors ${active ? "border-foreground bg-background ring-foreground ring-1" : "border-border hover:border-foreground/40"}`}
                      >
                        <span className="flex items-center justify-between text-sm font-medium">
                          {t.label}
                          {active && <Check aria-hidden className="size-4" />}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                          {t.blurb}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border-border bg-card rounded-lg border p-6">
                <h2 className="text-base font-semibold">Name on the card</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
                  <label className="block text-sm">
                    <span className="font-medium">Display name</span>
                    <Input
                      className="mt-1.5"
                      value={config.displayName}
                      maxLength={CARD_NAME_MAX}
                      placeholder={initial.profileName || "Your name"}
                      onChange={(e) => update({ displayName: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Initials</span>
                    <Input
                      className="mt-1.5 uppercase"
                      value={config.initials}
                      maxLength={CARD_INITIALS_MAX}
                      placeholder={
                        initialsOf(config.displayName || initial.profileName) ||
                        "AB"
                      }
                      onChange={(e) =>
                        update({ initials: e.target.value.toUpperCase() })
                      }
                    />
                  </label>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  Leave empty to use the name from your profile. Initials are
                  embossed on designs without a photo.
                </p>
              </section>

              <section className="border-border bg-card rounded-lg border p-6">
                <h2 className="text-base font-semibold">What to show</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Only details already in your profile can be shown. Anything
                  switched off stays private.
                </p>
                <ul className="divide-border mt-4 divide-y">
                  {CARD_FIELDS.filter((f) => f.id !== "custom").map((f) => {
                    const value = initial.values[f.id];
                    const id = `field-${f.id}`;
                    return (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <label htmlFor={id} className="text-sm font-medium">
                            {f.label}
                          </label>
                          <p className="text-muted-foreground truncate text-xs">
                            {value ? (
                              /^https?:/.test(value) ? (
                                shortUrl(value)
                              ) : (
                                value
                              )
                            ) : (
                              <>
                                Not in your profile.{" "}
                                <Link
                                  href={FIELD_SOURCE[f.id]}
                                  className="text-foreground underline underline-offset-2"
                                >
                                  Add it
                                </Link>
                              </>
                            )}
                          </p>
                        </div>
                        <Switch
                          id={id}
                          checked={
                            Boolean(value) && config.fields.includes(f.id)
                          }
                          disabled={!value}
                          onChange={(e) => toggleField(f.id, e.target.checked)}
                        />
                      </li>
                    );
                  })}
                  <li className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <label
                          htmlFor="field-custom"
                          className="text-sm font-medium"
                        >
                          Custom link
                        </label>
                        <p className="text-muted-foreground text-xs">
                          Anything else: a photography portfolio, a booking
                          page, a showreel.
                        </p>
                      </div>
                      <Switch
                        id="field-custom"
                        checked={config.fields.includes("custom")}
                        onChange={(e) =>
                          toggleField("custom", e.target.checked)
                        }
                      />
                    </div>
                    {config.fields.includes("custom") && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
                        <Input
                          aria-label="Custom link label"
                          placeholder="Label, e.g. Photography"
                          maxLength={CUSTOM_LABEL_MAX}
                          value={config.customLink.label}
                          onChange={(e) =>
                            update({
                              customLink: {
                                ...config.customLink,
                                label: e.target.value,
                              },
                            })
                          }
                        />
                        <Input
                          aria-label="Custom link URL"
                          type="url"
                          inputMode="url"
                          placeholder="https://"
                          maxLength={500}
                          value={config.customLink.url}
                          onChange={(e) =>
                            update({
                              customLink: {
                                ...config.customLink,
                                url: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                  </li>
                  <li className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <label
                        htmlFor="field-photo"
                        className="text-sm font-medium"
                      >
                        Profile photo emboss
                      </label>
                      <p className="text-muted-foreground text-xs">
                        {initial.photoUrl
                          ? "Some designs fade your photo softly into the card."
                          : "No profile photo yet, so designs use your initials."}
                      </p>
                    </div>
                    <Switch
                      id="field-photo"
                      checked={Boolean(initial.photoUrl) && config.usePhoto}
                      disabled={!initial.photoUrl}
                      onChange={(e) => update({ usePhoto: e.target.checked })}
                    />
                  </li>
                </ul>
              </section>

              <StepActions
                pending={pending}
                dirty={dirty}
                onSave={() => save()}
                onNext={() => save("design")}
              />
            </>
          )}

          {step === "design" && (
            <section className="border-border bg-card rounded-lg border p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">Choose a design</h2>
                <p className="text-muted-foreground text-xs">
                  {CARD_DESIGNS.length} designs
                </p>
              </div>
              <div
                role="group"
                aria-label="Filter designs"
                className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1"
              >
                {(["Suggested", ...CARD_CATEGORIES] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${category === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {designs.map((d) => {
                  const active = config.design === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${d.label} design`}
                        onClick={() => update({ design: d.id })}
                        className={`w-full rounded-lg p-2 text-left transition ${active ? "ring-foreground bg-background ring-2" : "hover:bg-background ring-1 ring-black/5"}`}
                      >
                        <BusinessCard
                          design={d}
                          content={shown}
                          cardClassName="shadow-sm"
                        />
                        <span className="flex items-center justify-between px-1 pt-2.5 pb-0.5 text-sm">
                          <span className="font-medium">{d.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {active ? "Selected" : d.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6">
                <StepActions
                  pending={pending}
                  dirty={dirty}
                  onBack={() => setStep("details")}
                  onSave={() => save()}
                  onNext={() => save("share")}
                />
              </div>
            </section>
          )}

          {step === "share" && (
            <SharePanel
              origin={origin}
              slug={slug}
              suggested={initial.suggestedSlug}
              status={status}
              dirty={dirty}
              problems={problems}
              hasUnpublishedChanges={initial.hasUnpublishedChanges}
              onSaveFirst={() => save()}
              onSlug={(s) => {
                setSlug(s);
                if (status === "not_created") setStatus("draft");
              }}
              onStatus={setStatus}
              onBack={() => setStep("design")}
            />
          )}

          <p role="status" aria-live="polite" className="text-sm">
            {message && (
              <span className={message.ok ? "text-success" : "text-danger"}>
                {message.text}
              </span>
            )}
          </p>
        </div>

        <aside className="lg:sticky lg:top-6">
          <p className="eyebrow mb-3">Preview</p>
          <CardWithQr
            value={cardVCard(shown, cardUrl ?? undefined)}
            radius={design.radius}
          >
            <BusinessCard
              design={design}
              content={shown}
              interactive
              cardClassName="shadow-[0_24px_50px_-24px_rgba(0,0,0,.4)]"
            />
          </CardWithQr>
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            {design.label} ·{" "}
            {CARD_TYPES.find((t) => t.id === config.type)?.label} card. Tap the
            QR icon to see the code a phone can scan to save your contact.
          </p>
          {status === "published" && cardUrl && (
            <a
              href={cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden className="size-4" /> Open live card
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

function StepActions({
  pending,
  dirty,
  onBack,
  onSave,
  onNext,
}: {
  pending: boolean;
  dirty: boolean;
  onBack?: () => void;
  onSave: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onBack && (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={pending}>
        Save and continue <ArrowRight aria-hidden className="size-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onSave}
        disabled={pending || !dirty}
      >
        Save
      </Button>
      {dirty && (
        <span className="text-muted-foreground text-xs">Unsaved changes</span>
      )}
    </div>
  );
}

type SlugState =
  | "idle"
  | "checking"
  | "available"
  | "yours"
  | "taken"
  | "invalid"
  | "error";

function SharePanel({
  origin,
  slug,
  suggested,
  status,
  dirty,
  problems,
  hasUnpublishedChanges,
  onSaveFirst,
  onSlug,
  onStatus,
  onBack,
}: {
  origin: string;
  slug: string | null;
  suggested: string;
  status: CardStatus;
  dirty: boolean;
  problems: ReturnType<typeof cardProblems>;
  hasUnpublishedChanges: boolean;
  onSaveFirst: () => void;
  onSlug: (slug: string) => void;
  onStatus: (status: CardStatus) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(slug ?? suggested);
  const [check, setCheck] = useState<{ state: SlugState; text?: string }>({
    state: "idle",
  });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const live = status === "published";
  const url = slug ? `${origin}/social/${slug}` : null;

  useEffect(() => {
    const v = value.trim().toLowerCase();
    if (!v || v === slug) {
      setCheck({ state: v ? "yours" : "idle" });
      return;
    }
    setCheck({ state: "checking" });
    const t = setTimeout(async () => {
      const r = await checkCardSlugAction(v);
      if (r.ok) setCheck({ state: r.state });
      else if (r.state === "invalid")
        setCheck({ state: "invalid", text: SLUG_MESSAGES[r.problem] });
      else setCheck({ state: r.state });
    }, 400);
    return () => clearTimeout(t);
  }, [value, slug]);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setNote({ ok: r.ok, text: r.message });
    });

  return (
    <section className="border-border bg-card space-y-6 rounded-lg border p-6">
      <div>
        <h2 className="text-base font-semibold">Your card&apos;s address</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The link people open, and the one in your QR code.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <label className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-black/10">
            <span className="text-muted-foreground bg-muted shrink-0 px-3 py-2.5 font-mono text-xs">
              {origin.replace(/^https?:\/\//, "")}/social/
            </span>
            <input
              aria-label="Card address"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm outline-none"
              value={value}
              maxLength={40}
              onChange={(e) => setValue(e.target.value)}
              placeholder="your-name"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={
              pending ||
              !value.trim() ||
              value.trim().toLowerCase() === slug ||
              check.state === "taken" ||
              check.state === "invalid"
            }
            onClick={() =>
              run(async () => {
                const r = await saveCardSlugAction(value);
                if (r.ok && r.slug) onSlug(r.slug);
                return r;
              })
            }
          >
            Save address
          </Button>
        </div>
        <p className="mt-2 text-xs" aria-live="polite">
          {check.state === "checking" && (
            <span className="text-muted-foreground">Checking…</span>
          )}
          {check.state === "available" && (
            <span className="text-success">Available</span>
          )}
          {check.state === "yours" && slug && (
            <span className="text-muted-foreground">This is your address.</span>
          )}
          {check.state === "taken" && (
            <span className="text-danger">That address is already taken.</span>
          )}
          {check.state === "invalid" && (
            <span className="text-danger">{check.text}</span>
          )}
          {check.state === "error" && (
            <span className="text-danger">
              We could not check that address right now.
            </span>
          )}
        </p>
      </div>

      <div className="border-border border-t pt-6">
        <h2 className="text-base font-semibold">
          {live ? "Your card is live" : "Publish"}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {live
            ? hasUnpublishedChanges || dirty
              ? "You have changes that are not on the live card yet. Save, then update it."
              : "Anyone with the link or QR code can see the details you chose."
            : "Your card stays private until you publish it. Only the details you switched on are published."}
        </p>
        {problems.length > 0 && (
          <p className="text-danger mt-2 text-sm">
            {problems.includes("no_name")
              ? "Add a display name first."
              : "Switch on at least one detail in step 1."}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {dirty && (
            <Button type="button" variant="secondary" onClick={onSaveFirst}>
              Save changes
            </Button>
          )}
          <Button
            type="button"
            disabled={pending || dirty || !slug || problems.length > 0}
            onClick={() =>
              run(async () => {
                const r = await publishCardAction();
                if (r.ok) onStatus("published");
                return r;
              })
            }
          >
            {live ? "Update live card" : "Publish card"}
          </Button>
          {live && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await unpublishCardAction();
                  if (r.ok) onStatus("unpublished");
                  return r;
                })
              }
            >
              Unpublish
            </Button>
          )}
          {!slug && (
            <span className="text-muted-foreground text-xs">
              Save an address first.
            </span>
          )}
        </div>
      </div>

      {live && url && (
        <div className="bg-muted flex flex-wrap items-center gap-3 rounded-md p-3">
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm"
            data-testid="card-url"
          >
            {url}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy aria-hidden className="size-3.5" />{" "}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden className="size-3.5" /> Open
            </a>
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Button>
        {note && (
          <p
            role="status"
            className={`text-sm ${note.ok ? "text-success" : "text-danger"}`}
          >
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
