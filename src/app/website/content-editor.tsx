"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  SECTION_DEFS,
  type SectionId,
  type WebsiteConfig,
} from "@/domains/website/config";
import { parseBookingLink } from "@/domains/website/booking-link";
import type {
  ArticleChoice,
  EntryChoice,
} from "@/app/website/website-workspace";

type Props = {
  config: WebsiteConfig;
  onChange: (next: WebsiteConfig) => void;
  choices: Partial<Record<SectionId, EntryChoice[]>>;
  articleChoices: ArticleChoice[];
  hasContent: Record<SectionId, boolean>;
  has: { email: boolean; phone: boolean; website: boolean; name: boolean };
};

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span>
        {label}
        {hint && (
          <span className="text-muted-foreground block text-xs">{hint}</span>
        )}
      </span>
      <Switch
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

function BookingSettings({
  config,
  onChange,
}: {
  config: WebsiteConfig;
  onChange: (next: WebsiteConfig) => void;
}) {
  const b = config.booking;
  const set = (patch: Partial<WebsiteConfig["booking"]>) =>
    onChange({ ...config, booking: { ...b, ...patch } });
  const link = parseBookingLink(b.url);
  const typed = b.url.trim() !== "";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="booking-url" className="text-xs font-medium">
          Booking page link
        </label>
        <Input
          id="booking-url"
          type="url"
          value={b.url}
          maxLength={1000}
          placeholder="https://calendly.com/you/intro-call"
          aria-invalid={typed && !link ? true : undefined}
          onChange={(e) => set({ url: e.target.value })}
        />
        <p
          className={`text-xs ${typed && !link ? "text-danger" : "text-muted-foreground"}`}
        >
          {!typed
            ? "Calendly, Cal.com and Google Calendar appointment pages open right on your website. Any other https booking link opens in a new tab."
            : !link
              ? "Use a full https link to your booking page."
              : link.embedUrl
                ? `${link.providerLabel}: visitors pick a time without leaving your website. It loads only when they click.`
                : "This page will open in a new tab when visitors click “Book a time”."}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="booking-title" className="text-xs font-medium">
            Title
          </label>
          <Input
            id="booking-title"
            value={b.title ?? ""}
            maxLength={80}
            placeholder="Book a time with me"
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="booking-desc" className="text-xs font-medium">
            Description
          </label>
          <Input
            id="booking-desc"
            value={b.description ?? ""}
            maxLength={300}
            placeholder="A 20-minute intro call about your project."
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        To add it to your links page, use Links page → Add a link → Booking
        page.
      </p>
    </div>
  );
}

export function ContentEditor({
  config,
  onChange,
  choices,
  articleChoices,
  hasContent,
  has,
}: Props) {
  const [open, setOpen] = useState<SectionId | null>(null);

  const patchSection = (
    id: SectionId,
    patch: Partial<{ visible: boolean; heading: string }>,
  ) =>
    onChange({
      ...config,
      sections: config.sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 1 || target >= config.sections.length) return; // index 0 is the fixed introduction
    const next = [...config.sections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...config, sections: next });
  };

  const toggleEntry = (entryId: string, include: boolean) => {
    const set = new Set(config.excludedEntryIds);
    if (include) set.delete(entryId);
    else set.add(entryId);
    onChange({ ...config, excludedEntryIds: [...set] });
  };

  const selected = config.articles.selectedIds;
  const setSelected = (ids: string[]) =>
    onChange({ ...config, articles: { selectedIds: ids } });
  const moveArticle = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSelected(next);
  };
  const articleById = new Map(articleChoices.map((a) => [a.id, a]));

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm leading-6">
        Choose what your website shows. Everything comes from My Identity;
        nothing is copied. Items you hide in My Identity are never published.
        Contact details are off until you switch them on.
      </p>
      <ol className="space-y-2">
        {config.sections.map((s, index) => {
          const def = SECTION_DEFS[s.id];
          const empty = !hasContent[s.id] && s.id !== "intro";
          const isOpen = open === s.id;
          const list = choices[s.id];
          return (
            <li key={s.id} className="border-border bg-card rounded-lg border">
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  className="hover:bg-muted rounded p-1"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${def.label}`}
                  onClick={() => setOpen(isOpen ? null : s.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${s.visible ? "" : "opacity-60"}`}
                  >
                    {def.label}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {empty
                      ? "Nothing in My Identity yet: this section will not appear."
                      : def.hint}
                  </p>
                </div>
                {def.reorderable && (
                  <>
                    <button
                      type="button"
                      className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                      disabled={index <= 1}
                      aria-label={`Move ${def.label} up`}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                      disabled={index === config.sections.length - 1}
                      aria-label={`Move ${def.label} down`}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </>
                )}
                {s.id === "intro" ? (
                  <span className="text-muted-foreground w-9 text-center text-xs">
                    Always
                  </span>
                ) : (
                  <Switch
                    checked={s.visible}
                    aria-label={`Show ${def.label}`}
                    onChange={(e) =>
                      patchSection(s.id, { visible: e.target.checked })
                    }
                  />
                )}
              </div>

              {isOpen && (
                <div className="border-border space-y-3 border-t p-4">
                  {s.id !== "intro" && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`h-${s.id}`}
                        className="text-xs font-medium"
                      >
                        Heading
                      </label>
                      <Input
                        id={`h-${s.id}`}
                        value={s.heading ?? ""}
                        maxLength={60}
                        placeholder={def.defaultHeading}
                        onChange={(e) =>
                          patchSection(s.id, { heading: e.target.value })
                        }
                      />
                    </div>
                  )}

                  {s.id === "intro" && (
                    <div className="divide-border divide-y">
                      {!has.name && (
                        <p className="pb-2 text-xs text-amber-800">
                          Add your name in{" "}
                          <Link href="/profile" className="underline">
                            Profile → Personal
                          </Link>
                          : it is required to publish.
                        </p>
                      )}
                      <Toggle
                        label="Profile image"
                        checked={config.intro.showImage}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            intro: { ...config.intro, showImage: v },
                          })
                        }
                      />
                      <Toggle
                        label="Cover image"
                        checked={config.intro.showCover}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            intro: { ...config.intro, showCover: v },
                          })
                        }
                      />
                      <Toggle
                        label="Location"
                        checked={config.intro.showLocation}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            intro: { ...config.intro, showLocation: v },
                          })
                        }
                      />
                      <Toggle
                        label="Short biography"
                        checked={config.intro.showShortBio}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            intro: { ...config.intro, showShortBio: v },
                          })
                        }
                      />
                    </div>
                  )}

                  {s.id === "about" && (
                    <div className="divide-border divide-y">
                      <Toggle
                        label="Full biography"
                        checked={config.about.showBiography}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            about: { ...config.about, showBiography: v },
                          })
                        }
                      />
                      <Toggle
                        label="Professional summary"
                        checked={config.about.showProfessionalSummary}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            about: {
                              ...config.about,
                              showProfessionalSummary: v,
                            },
                          })
                        }
                      />
                    </div>
                  )}

                  {s.id === "contact" && (
                    <div className="divide-border divide-y">
                      <Toggle
                        label="Email address"
                        hint={
                          has.email
                            ? "Also used for the hero contact button."
                            : "No contact email in My Identity."
                        }
                        checked={config.contact.showEmail}
                        disabled={!has.email}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            contact: { ...config.contact, showEmail: v },
                          })
                        }
                      />
                      <Toggle
                        label="Phone number"
                        hint={
                          has.phone ? undefined : "No phone in My Identity."
                        }
                        checked={config.contact.showPhone}
                        disabled={!has.phone}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            contact: { ...config.contact, showPhone: v },
                          })
                        }
                      />
                      <Toggle
                        label="Personal website"
                        hint={
                          has.website ? undefined : "No website in My Identity."
                        }
                        checked={config.contact.showWebsite}
                        disabled={!has.website}
                        onChange={(v) =>
                          onChange({
                            ...config,
                            contact: { ...config.contact, showWebsite: v },
                          })
                        }
                      />
                    </div>
                  )}

                  {s.id === "booking" && (
                    <BookingSettings config={config} onChange={onChange} />
                  )}

                  {s.id === "articles" && (
                    <div>
                      <p className="mb-1 text-xs font-medium">
                        Articles on your website
                      </p>
                      <p className="text-muted-foreground mb-2 text-xs">
                        Only published articles can be featured, and only the
                        ones you tick. Drafts and archived articles never
                        appear.
                      </p>
                      {articleChoices.length === 0 && selected.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          No published articles yet. Publish one in{" "}
                          <Link href="/articles" className="underline">
                            Articles &amp; Thoughts
                          </Link>
                          .
                        </p>
                      ) : (
                        <ul className="divide-border divide-y">
                          {selected.map((id, index) => {
                            const a = articleById.get(id);
                            return (
                              <li
                                key={id}
                                className="flex items-center gap-2 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  aria-label={`Include ${a?.title || "article"}`}
                                  onChange={() =>
                                    setSelected(
                                      selected.filter((x) => x !== id),
                                    )
                                  }
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {a
                                    ? a.title || "Untitled"
                                    : "Unavailable article"}
                                  {!a && (
                                    <span className="text-muted-foreground text-xs italic">
                                      {" "}
                                      · not published; it will not appear
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                                  disabled={index === 0}
                                  aria-label={`Move article ${a?.title || "article"} up`}
                                  onClick={() => moveArticle(index, -1)}
                                >
                                  <ArrowUp className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                                  disabled={index === selected.length - 1}
                                  aria-label={`Move article ${a?.title || "article"} down`}
                                  onClick={() => moveArticle(index, 1)}
                                >
                                  <ArrowDown className="size-4" />
                                </button>
                              </li>
                            );
                          })}
                          {articleChoices
                            .filter((a) => !selected.includes(a.id))
                            .map((a) => (
                              <li key={a.id}>
                                <label className="flex items-center gap-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={false}
                                    disabled={selected.length >= 50}
                                    aria-label={`Include ${a.title || "Untitled"}`}
                                    onChange={() =>
                                      setSelected([...selected, a.id])
                                    }
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {a.title || "Untitled"}
                                    {a.subtitle && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · {a.subtitle}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {list && (
                    <div>
                      <p className="mb-1 text-xs font-medium">Items</p>
                      {list.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Nothing here yet. Add items in{" "}
                          <Link href="/profile" className="underline">
                            My Identity
                          </Link>
                          .
                        </p>
                      ) : (
                        <ul className="divide-border divide-y">
                          {list.map((c) => {
                            const checked =
                              c.masterVisible &&
                              !config.excludedEntryIds.includes(c.id);
                            return (
                              <li key={c.id}>
                                <label className="flex items-center gap-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!c.masterVisible}
                                    onChange={(e) =>
                                      toggleEntry(c.id, e.target.checked)
                                    }
                                    aria-label={`Include ${c.title}`}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {c.title}
                                    {c.subtitle && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · {c.subtitle}
                                      </span>
                                    )}
                                  </span>
                                  {!c.masterVisible && (
                                    <span className="text-muted-foreground text-xs italic">
                                      Hidden in My Identity
                                    </span>
                                  )}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
