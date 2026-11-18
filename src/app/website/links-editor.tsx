"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import {
  BUTTON_STYLES,
  type ButtonStyle,
  type LinkItem,
  type WebsiteConfig,
} from "@/domains/website/config";
import { parseBookingLink } from "@/domains/website/booking-link";
import type {
  ArticleChoice,
  EntryChoice,
} from "@/app/website/website-workspace";

const STYLE_LABEL: Record<ButtonStyle, string> = {
  filled: "Filled",
  outline: "Outline",
  soft: "Soft",
};
const STYLE_SAMPLE: Record<ButtonStyle, string> = {
  filled: "bg-foreground text-background",
  outline: "border-2 border-foreground/25",
  soft: "bg-foreground/[.07]",
};

const menuItem =
  "data-[highlighted]:bg-muted flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45";
const menuLabel =
  "text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase";

function KindIcon({ source }: { source: LinkItem["source"] }) {
  const cls = "text-muted-foreground size-4 shrink-0";
  if (source === "booking") return <CalendarDays aria-hidden className={cls} />;
  if (source === "article") return <FileText aria-hidden className={cls} />;
  if (source === "website") return <Globe aria-hidden className={cls} />;
  if (source === "entry") return <Sparkles aria-hidden className={cls} />;
  return <Link2 aria-hidden className={cls} />;
}

export function LinksEditor({
  config,
  onChange,
  socialChoices,
  featuredChoices,
  articleChoices,
  linksUrl,
  live,
}: {
  config: WebsiteConfig;
  onChange: (next: WebsiteConfig) => void;
  socialChoices: EntryChoice[];
  featuredChoices: EntryChoice[];
  articleChoices: ArticleChoice[];
  /** Public address of the links page (null until the website has an address). */
  linksUrl: string | null;
  /** The website is published (so the links page is reachable once enabled and published). */
  live: boolean;
}) {
  const links = config.links;
  const [scheduling, setScheduling] = useState<string | null>(null);
  const booking = parseBookingLink(config.booking.url);
  const set = (patch: Partial<WebsiteConfig["links"]>) =>
    onChange({ ...config, links: { ...links, ...patch } });
  const setItems = (items: LinkItem[]) => set({ items });
  const patch = (id: string, p: Partial<LinkItem>) =>
    setItems(links.items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= links.items.length) return;
    const next = [...links.items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
  };
  const add = (item: Omit<LinkItem, "id">) =>
    setItems([...links.items, { id: crypto.randomUUID(), ...item }]);

  const entryTitle = new Map(
    [...socialChoices, ...featuredChoices].map((c) => [c.id, c.title]),
  );
  const articleTitle = new Map(articleChoices.map((a) => [a.id, a.title]));
  const used = new Set(links.items.map((i) => i.refId).filter(Boolean));
  const hasWebsite = links.items.some((i) => i.source === "website");
  const hasBooking = links.items.some((i) => i.source === "booking");
  const full = links.items.length >= 50;

  const defaultTitle = (i: LinkItem): string => {
    if (i.source === "entry")
      return (i.refId && entryTitle.get(i.refId)) || "Unavailable item";
    if (i.source === "article")
      return (i.refId && articleTitle.get(i.refId)) || "Unavailable article";
    if (i.source === "website") return "My website";
    if (i.source === "booking")
      return config.booking.title || "Book a time with me";
    return "";
  };
  const missing = (i: LinkItem) =>
    (i.source === "entry" && !(i.refId && entryTitle.has(i.refId))) ||
    (i.source === "article" && !(i.refId && articleTitle.has(i.refId))) ||
    (i.source === "booking" && !booking);

  const group = (label: string, rows: ReactNode[]) =>
    rows.length > 0 && (
      <>
        <Menu.Separator className="bg-border -mx-1 my-1 h-px" />
        <Menu.Label className={menuLabel}>{label}</Menu.Label>
        {rows}
      </>
    );

  return (
    <div className="space-y-6">
      <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Links page</p>
          <p className="text-muted-foreground text-xs leading-5">
            One page of big buttons for your Instagram, LinkedIn or TikTok bio.
            It uses your website&apos;s colours and is published with your
            website.
          </p>
          {linksUrl && (
            <p className="text-xs">
              {live && links.enabled ? (
                <a
                  href={linksUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-accent inline-flex items-center gap-1 break-all underline underline-offset-4"
                >
                  {linksUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-muted-foreground break-all">
                  {linksUrl.replace(/^https?:\/\//, "")}
                </span>
              )}
            </p>
          )}
        </div>
        <Switch
          className="shrink-0"
          checked={links.enabled}
          aria-label="Publish a links page"
          onChange={(e) => set({ enabled: e.target.checked })}
        />
      </div>

      {links.enabled && (
        <>
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Button style</legend>
              <div className="flex flex-wrap gap-2">
                {BUTTON_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={links.buttonStyle === s}
                    onClick={() => set({ buttonStyle: s })}
                    className={`flex w-28 flex-col items-center gap-2 rounded-xl border p-3 text-xs transition ${links.buttonStyle === s ? "border-foreground ring-foreground/10 ring-4" : "border-border hover:border-foreground/30"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-6 w-full rounded-lg ${STYLE_SAMPLE[s]}`}
                    />
                    {STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center justify-between gap-4 self-end text-sm md:flex-col md:items-start">
              <span>
                Social icons at the top
                <span className="text-muted-foreground block text-xs">
                  From My Identity → Social &amp; Web.
                </span>
              </span>
              <Switch
                checked={links.showSocialIcons}
                aria-label="Show social icons at the top"
                onChange={(e) => set({ showSocialIcons: e.target.checked })}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Buttons{" "}
                <span className="text-muted-foreground font-normal">
                  ({links.items.length}/50)
                </span>
              </p>
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={full}
                  >
                    <Plus aria-hidden className="size-4" /> Add a link
                  </Button>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content
                    align="end"
                    sideOffset={6}
                    className="border-border bg-card z-50 max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] w-72 overflow-y-auto rounded-xl border p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,.25)]"
                  >
                    <Menu.Item
                      className={menuItem}
                      onSelect={() =>
                        add({ source: "custom", title: "", url: "" })
                      }
                    >
                      <Link2 aria-hidden className="size-4" /> Custom link
                    </Menu.Item>
                    <Menu.Item
                      className={menuItem}
                      disabled={hasWebsite}
                      onSelect={() => add({ source: "website" })}
                    >
                      <Globe aria-hidden className="size-4" /> My website
                    </Menu.Item>
                    <Menu.Item
                      className={menuItem}
                      disabled={!booking || hasBooking}
                      onSelect={() => add({ source: "booking" })}
                    >
                      <CalendarDays aria-hidden className="size-4" />
                      <span>
                        Booking page
                        {!booking && (
                          <span className="text-muted-foreground block text-xs">
                            Set it up in Content → Book a time
                          </span>
                        )}
                      </span>
                    </Menu.Item>
                    {group(
                      "Featured posts",
                      featuredChoices
                        .filter((c) => c.masterVisible && !used.has(c.id))
                        .map((c) => (
                          <Menu.Item
                            key={c.id}
                            className={menuItem}
                            onSelect={() =>
                              add({ source: "entry", refId: c.id })
                            }
                          >
                            <span className="truncate">{c.title}</span>
                          </Menu.Item>
                        )),
                    )}
                    {group(
                      "Social profiles",
                      socialChoices
                        .filter((c) => c.masterVisible && !used.has(c.id))
                        .map((c) => (
                          <Menu.Item
                            key={c.id}
                            className={menuItem}
                            onSelect={() =>
                              add({ source: "entry", refId: c.id })
                            }
                          >
                            <span className="truncate">{c.title}</span>
                          </Menu.Item>
                        )),
                    )}
                    {group(
                      "Published articles",
                      articleChoices
                        .filter((a) => !used.has(a.id))
                        .map((a) => (
                          <Menu.Item
                            key={a.id}
                            className={menuItem}
                            onSelect={() =>
                              add({ source: "article", refId: a.id })
                            }
                          >
                            <span className="truncate">
                              {a.title || "Untitled"}
                            </span>
                          </Menu.Item>
                        )),
                    )}
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            </div>

            {links.items.length === 0 ? (
              <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                <p className="text-foreground font-medium">No buttons yet</p>
                <p className="mt-1">
                  Add your featured posts, profiles, articles, your booking page
                  or any link.
                </p>
              </div>
            ) : (
              <ol className="space-y-2">
                {links.items.map((item, index) => {
                  const custom = item.source === "custom";
                  const badUrl =
                    custom && !!item.url && !/^https?:\/\/\S+$/.test(item.url);
                  const scheduleOpen =
                    scheduling === item.id || !!item.startsOn || !!item.endsOn;
                  return (
                    <li
                      key={item.id}
                      className={`bg-card rounded-lg border p-3 ${item.highlight ? "border-foreground/40" : "border-border"}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-3">
                          <KindIcon source={item.source} />
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            aria-label="Button text"
                            className="h-10"
                            value={item.title ?? ""}
                            maxLength={100}
                            placeholder={
                              custom ? "Button text" : defaultTitle(item)
                            }
                            onChange={(e) =>
                              patch(item.id, { title: e.target.value })
                            }
                          />
                          {custom && (
                            <Input
                              aria-label="Link"
                              className="h-10"
                              value={item.url ?? ""}
                              type="url"
                              placeholder="https://…"
                              aria-invalid={badUrl || undefined}
                              onChange={(e) =>
                                patch(item.id, { url: e.target.value })
                              }
                            />
                          )}
                          {badUrl && (
                            <p className="text-danger text-xs">
                              Use a full link starting with https://
                            </p>
                          )}
                          {custom && (!item.title || !item.url) && !badUrl && (
                            <p className="text-muted-foreground text-xs">
                              Needs button text and a link, or it will not be
                              shown.
                            </p>
                          )}
                          {missing(item) && (
                            <p className="text-xs text-amber-800">
                              {item.source === "booking"
                                ? "No booking page set: add one in Content → Book a time."
                                : "No longer available in My Identity; it will not be shown."}
                            </p>
                          )}
                          {scheduleOpen && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-xs">
                                  Show from
                                </p>
                                <DatePicker
                                  aria-label="Show from"
                                  value={item.startsOn ?? ""}
                                  placeholder="Right away"
                                  onChange={(v) =>
                                    patch(item.id, { startsOn: v || undefined })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-xs">
                                  Hide after
                                </p>
                                <DatePicker
                                  aria-label="Hide after"
                                  value={item.endsOn ?? ""}
                                  placeholder="Never"
                                  min={item.startsOn}
                                  onChange={(v) =>
                                    patch(item.id, { endsOn: v || undefined })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end">
                          <button
                            type="button"
                            className={`hover:bg-muted rounded p-1.5 ${item.highlight ? "text-amber-600" : ""}`}
                            aria-pressed={!!item.highlight}
                            aria-label={`Highlight ${item.title || defaultTitle(item) || "link"}`}
                            title="Highlight"
                            onClick={() =>
                              patch(item.id, { highlight: !item.highlight })
                            }
                          >
                            <Star
                              aria-hidden
                              className={`size-4 ${item.highlight ? "fill-current" : ""}`}
                            />
                          </button>
                          <button
                            type="button"
                            className={`hover:bg-muted rounded p-1.5 ${scheduleOpen ? "text-foreground" : ""}`}
                            aria-expanded={scheduleOpen}
                            aria-label="Schedule"
                            title="Schedule"
                            onClick={() => {
                              if (scheduleOpen) {
                                patch(item.id, {
                                  startsOn: undefined,
                                  endsOn: undefined,
                                });
                                setScheduling(null);
                              } else setScheduling(item.id);
                            }}
                          >
                            <CalendarClock aria-hidden className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                            disabled={index === 0}
                            aria-label="Move up"
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp aria-hidden className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="hover:bg-muted rounded p-1.5 disabled:opacity-30"
                            disabled={index === links.items.length - 1}
                            aria-label="Move down"
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown aria-hidden className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="hover:bg-muted text-danger rounded p-1.5"
                            aria-label="Remove"
                            onClick={() =>
                              setItems(
                                links.items.filter((i) => i.id !== item.id),
                              )
                            }
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="text-muted-foreground text-xs leading-5">
              Highlighted buttons stand out in your accent colour. Scheduled
              buttons appear and disappear on their own (UTC days); everything
              else changes when you publish again. Clicks show in Insights.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
