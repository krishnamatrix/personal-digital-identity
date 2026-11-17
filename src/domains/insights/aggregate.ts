import type { StoredInsightEvent } from "@/lib/db/queries/insights";

/** Turns raw events into the Insights dashboard. Pure; unit-tested. */

export type Count = { name: string; value: number };
export type Kpi = { current: number; previous: number };

export type InsightsReport = {
  days: number;
  kpis: {
    views: Kpi;
    visitors: Kpi;
    linkClicks: Kpi;
    /** Link clicks per 100 views (current period). */
    clickRate: number;
    contactClicks: Kpi;
    cardSaves: Kpi;
    qrOpens: Kpi;
    videoPlays: Kpi;
  };
  /** One entry per day, oldest first, for the current period. */
  daily: { date: string; views: number; clicks: number }[];
  bySurface: { website: number; card: number };
  topLinks: {
    label: string;
    kind: string;
    url: string | null;
    clicks: number;
  }[];
  featured: {
    label: string;
    url: string | null;
    clicks: number;
    plays: number;
  }[];
  sources: Count[];
  campaigns: Count[];
  pages: Count[];
  devices: Count[];
  browsers: Count[];
  systems: Count[];
  languages: Count[];
  regions: Count[];
  recent: {
    at: string;
    event: string;
    surface: "website" | "card";
    detail: string;
    source: string | null;
    device: string | null;
    region: string | null;
  }[];
};

const DAY = 86_400_000;

function top(map: Map<string, number>, limit = 8): Count[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}
const bump = (
  map: Map<string, number>,
  key: string | null | undefined,
  by = 1,
) => {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
};

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export function languageName(tag: string): string {
  try {
    return LANGUAGE_NAMES.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Country when the host sends one, otherwise the visitor's time-zone city ("Asia/Kolkata" → "Kolkata"). */
export function regionName(
  e: Pick<StoredInsightEvent, "country" | "time_zone">,
): string | null {
  if (e.country) {
    try {
      return REGION_NAMES.of(e.country) ?? e.country;
    } catch {
      return e.country;
    }
  }
  if (e.time_zone) {
    const city = e.time_zone.split("/").pop()!.replace(/_/g, " ");
    return city === "UTC" ? null : city;
  }
  return null;
}

const KIND_LABEL: Record<string, string> = {
  social: "Social profile",
  featured: "Featured post",
  project: "Project",
  certification: "Certification",
  article: "Article",
  contact: "Contact",
  website: "Website",
  card_link: "Card link",
  link: "Link",
};
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? "Link";

const EVENT_LABEL: Record<string, string> = {
  view: "Viewed",
  link_click: "Clicked",
  contact_click: "Contact tapped",
  video_play: "Played video",
  qr_open: "Opened QR code",
  vcard_save: "Saved contact",
  share: "Shared",
};
export const eventLabel = (event: string) => EVENT_LABEL[event] ?? event;

export function aggregateInsights(
  events: StoredInsightEvent[],
  options: { days: number; now: Date },
): InsightsReport {
  const end = options.now.getTime();
  const start = end - options.days * DAY;
  const previousStart = start - options.days * DAY;
  const current = events.filter((e) => {
    const t = Date.parse(e.occurred_at);
    return t > start && t <= end;
  });
  const previous = events.filter((e) => {
    const t = Date.parse(e.occurred_at);
    return t > previousStart && t <= start;
  });

  const count = (list: StoredInsightEvent[], event: string) =>
    list.filter((e) => e.event === event).length;
  const visitors = (list: StoredInsightEvent[]) =>
    new Set(
      list
        .filter((e) => e.event === "view" && e.visitor_hash)
        .map((e) => `${e.occurred_at.slice(0, 10)}|${e.visitor_hash}`),
    ).size;
  const kpi = (event: string): Kpi => ({
    current: count(current, event),
    previous: count(previous, event),
  });

  // Daily series (UTC days), oldest first.
  const daily = new Map<string, { views: number; clicks: number }>();
  for (let i = options.days - 1; i >= 0; i--)
    daily.set(new Date(end - i * DAY).toISOString().slice(0, 10), {
      views: 0,
      clicks: 0,
    });

  const links = new Map<
    string,
    { label: string; kind: string; url: string | null; clicks: number }
  >();
  const featured = new Map<
    string,
    { label: string; url: string | null; clicks: number; plays: number }
  >();
  const sources = new Map<string, number>();
  const campaigns = new Map<string, number>();
  const pages = new Map<string, number>();
  const devices = new Map<string, number>();
  const browsers = new Map<string, number>();
  const systems = new Map<string, number>();
  const languages = new Map<string, number>();
  const regions = new Map<string, number>();
  const bySurface = { website: 0, card: 0 };

  for (const e of current) {
    const day = daily.get(e.occurred_at.slice(0, 10));
    if (e.event === "view") {
      if (day) day.views++;
      bySurface[e.website_id ? "website" : "card"]++;
      // A tagged link (utm_source) names the source better than the referrer.
      bump(sources, e.utm_source ?? e.referrer_host ?? "Direct");
      if (e.utm_source || e.utm_campaign)
        bump(
          campaigns,
          [e.utm_campaign, e.utm_source, e.utm_medium]
            .filter(Boolean)
            .join(" · "),
        );
      if (e.website_id) bump(pages, e.path ?? "/");
      bump(
        devices,
        e.device ? e.device[0]!.toUpperCase() + e.device.slice(1) : null,
      );
      bump(browsers, e.browser);
      bump(systems, e.os);
      bump(languages, e.language ? languageName(e.language) : null);
      bump(regions, regionName(e));
    }
    if (e.event === "link_click" || e.event === "video_play") {
      if (day && e.event === "link_click") day.clicks++;
      const label = e.target_label || e.target_url || "Link";
      const kind = e.target_kind ?? "link";
      if (e.event === "link_click") {
        const key = `${kind}|${label}`;
        const entry = links.get(key) ?? {
          label,
          kind,
          url: e.target_url ?? null,
          clicks: 0,
        };
        entry.clicks++;
        links.set(key, entry);
      }
      if (kind === "featured") {
        const f = featured.get(label) ?? {
          label,
          url: e.target_url ?? null,
          clicks: 0,
          plays: 0,
        };
        if (e.event === "video_play") f.plays++;
        else f.clicks++;
        if (!f.url && e.target_url) f.url = e.target_url;
        featured.set(label, f);
      }
    }
  }

  const views = count(current, "view");
  const linkClicks = count(current, "link_click");

  return {
    days: options.days,
    kpis: {
      views: kpi("view"),
      visitors: { current: visitors(current), previous: visitors(previous) },
      linkClicks: kpi("link_click"),
      clickRate: views ? Math.round((linkClicks / views) * 1000) / 10 : 0,
      contactClicks: kpi("contact_click"),
      cardSaves: kpi("vcard_save"),
      qrOpens: kpi("qr_open"),
      videoPlays: kpi("video_play"),
    },
    daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
    bySurface,
    topLinks: [...links.values()]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10),
    featured: [...featured.values()]
      .sort((a, b) => b.clicks + b.plays - (a.clicks + a.plays))
      .slice(0, 12),
    sources: top(sources),
    campaigns: top(campaigns, 6),
    pages: top(pages, 6),
    devices: top(devices, 3),
    browsers: top(browsers, 6),
    systems: top(systems, 6),
    languages: top(languages, 6),
    regions: top(regions, 8),
    recent: current.slice(0, 25).map((e) => ({
      at: e.occurred_at,
      event: e.event,
      surface: e.website_id ? "website" : "card",
      detail:
        e.event === "view"
          ? e.website_id
            ? (e.path ?? "/")
            : "Card"
          : (e.target_label ?? e.target_kind ?? ""),
      source:
        e.event === "view"
          ? (e.referrer_host ?? e.utm_source ?? "Direct")
          : null,
      device: e.device ?? null,
      region: regionName(e),
    })),
  };
}
