import { readFileSync } from "node:fs";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { parseBookingLink } from "@/domains/website/booking-link";
import {
  defaultConfig,
  normalizeConfig,
  websiteConfigSchema,
  type WebsiteConfig,
} from "@/domains/website/config";
import {
  buildPublishedContent,
  linksLiveOn,
  type IdentitySource,
} from "@/domains/website/build-published";
import { publishedContentSchema } from "@/domains/website/published-content";
import { LinksView, readableOn } from "@/components/links/links-view";
import { BookingBlock } from "@/components/website/booking-block";
import { DatePicker } from "@/components/ui/date-picker";
import { LinksEditor } from "@/app/website/links-editor";
import { INSIGHT_EVENTS } from "@/domains/insights/event-input";
import { aggregateInsights } from "@/domains/insights/aggregate";

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
});

const id = (n: number) =>
  `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;
const tone = {
  h2: "",
  muted: "",
  link: "",
  chip: "",
  card: "",
  strong: "",
  rule: "",
};

const source: IdentitySource = {
  profile: {
    fullName: "Alex Example",
    displayName: null,
    headline: "Product designer",
    summary: null,
    location: null,
    websiteUrl: null,
    profileImageUrl: null,
    coverImageUrl: null,
    contactEmail: null,
    phone: null,
    currentDesignation: null,
    currentOrganization: null,
    professionalSummary: null,
  },
  entries: {
    social_link: [
      {
        id: id(1),
        isVisible: true,
        data: { platform: "linkedin", url: "https://linkedin.com/in/alex" },
      },
      {
        id: id(2),
        isVisible: false,
        data: { platform: "github", url: "https://github.com/alex" },
      },
    ],
    featured_post: [
      {
        id: id(3),
        isVisible: true,
        data: { url: "https://youtu.be/dQw4w9WgXcQ", title: "My keynote" },
      },
    ],
  },
  articles: [
    {
      id: id(4),
      slug: "defaults",
      title: "The power of defaults",
      excerpt: "",
      coverImageUrl: null,
      category: null,
      publishedAt: new Date("2026-01-01"),
      readingMinutes: 4,
      version: 1,
    },
  ],
};

function config(patch: Partial<WebsiteConfig> = {}): WebsiteConfig {
  return { ...defaultConfig(), ...patch };
}

describe("booking links", () => {
  it("embeds known providers and opens others in a new tab", () => {
    expect(parseBookingLink("https://calendly.com/alex/intro#x")).toMatchObject(
      {
        provider: "calendly",
        url: "https://calendly.com/alex/intro",
        embedUrl:
          "https://calendly.com/alex/intro?embed_type=Inline&hide_gdpr_banner=1",
      },
    );
    expect(parseBookingLink("https://cal.com/alex/30min")?.embedUrl).toBe(
      "https://cal.com/alex/30min",
    );
    expect(
      parseBookingLink(
        "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1abc",
      )?.embedUrl,
    ).toBe(
      "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1abc?gv=true",
    );
    const other = parseBookingLink("https://tidycal.com/alex");
    expect(other).toMatchObject({ provider: "other" });
    expect(other?.embedUrl).toBeUndefined();
    expect(parseBookingLink("http://calendly.com/alex")).toBeNull();
    expect(parseBookingLink("javascript:alert(1)")).toBeNull();
    expect(parseBookingLink("")).toBeNull();
  });

  it("adds a 'Book a time' section only when a valid link is set", () => {
    expect(
      buildPublishedContent(source, config()).sections.some(
        (s) => s.id === "booking",
      ),
    ).toBe(false);
    const content = buildPublishedContent(
      source,
      config({
        booking: {
          url: "https://calendly.com/alex/intro",
          description: "20 minutes.",
        },
      }),
    );
    const booking = content.sections.find((s) => s.id === "booking");
    expect(booking).toMatchObject({
      heading: "Book a time",
      title: "Book a time with me",
      providerLabel: "Calendly",
      description: "20 minutes.",
    });
    expect(publishedContentSchema.safeParse(content).success).toBe(true);
    // Default position: right before contact.
    const ids = defaultConfig().sections.map((s) => s.id);
    expect(ids.indexOf("booking")).toBe(ids.indexOf("contact") - 1);
  });

  it("loads the scheduler only after the visitor clicks", async () => {
    const section = {
      id: "booking" as const,
      heading: "Book a time",
      provider: "calendly" as const,
      providerLabel: "Calendly",
      url: "https://calendly.com/alex/intro",
      embedUrl: "https://calendly.com/alex/intro?embed_type=Inline",
      title: "Intro call",
    };
    render(<BookingBlock section={section} tone={tone} />);
    expect(document.querySelector("iframe")).toBeNull();
    const button = screen.getByRole("button", { name: "Pick a time" });
    expect(button).toHaveAttribute("data-track-event", "booking_open");
    await userEvent.click(button);
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
      section.embedUrl,
    );
    expect(
      screen.getByRole("link", { name: "Open in a new tab" }),
    ).toHaveAttribute("href", section.url);
  });

  it("other providers become a tracked new-tab link", () => {
    render(
      <BookingBlock
        tone={tone}
        section={{
          id: "booking",
          heading: "B",
          provider: "other",
          providerLabel: "Booking page",
          url: "https://tidycal.com/alex",
          title: "Book",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /Book a time/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("data-track-kind", "booking");
  });
});

describe("links page content", () => {
  const items = [
    {
      id: id(5),
      source: "custom" as const,
      title: "My course",
      url: "https://course.example",
      highlight: true,
    },
    { id: id(6), source: "custom" as const, title: "No link" },
    { id: id(7), source: "entry" as const, refId: id(3) },
    { id: id(8), source: "entry" as const, refId: id(2) }, // hidden in My Identity
    { id: id(9), source: "article" as const, refId: id(4), title: "Read this" },
    {
      id: id(1),
      source: "website" as const,
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
    },
    { id: id(2), source: "booking" as const },
  ];

  it("is published only when switched on", () => {
    expect(buildPublishedContent(source, config()).links).toBeUndefined();
  });

  it("resolves each button, drops unusable ones and keeps the schedule", () => {
    const c = config({
      links: {
        enabled: true,
        buttonStyle: "soft",
        showSocialIcons: true,
        items,
      },
      booking: { url: "https://cal.com/alex/30min", title: "Talk to me" },
    });
    expect(websiteConfigSchema.safeParse(c).success).toBe(true);
    const content = buildPublishedContent(source, c);
    expect(publishedContentSchema.safeParse(content).success).toBe(true);
    const links = content.links!;
    expect(links.items.map((i) => [i.kind, i.title])).toEqual([
      ["custom", "My course"],
      ["featured", "My keynote"],
      ["article", "Read this"],
      ["website", "My website"],
      ["booking", "Talk to me"],
    ]);
    expect(links.items[0]).toMatchObject({ highlight: true });
    expect(links.items[1]?.thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(links.items[2]).toMatchObject({ articleSlug: "defaults" });
    expect(links.items[3]).toMatchObject({
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
    });
    // Only visible social profiles become icons.
    expect(links.socials.map((s) => s.url)).toEqual([
      "https://linkedin.com/in/alex",
    ]);
  });

  it("applies the schedule by day", () => {
    const list = [
      { kind: "custom" as const, title: "Always", url: "https://a.example" },
      {
        kind: "custom" as const,
        title: "December",
        url: "https://b.example",
        startsOn: "2026-12-01",
        endsOn: "2026-12-31",
      },
    ];
    expect(linksLiveOn(list, "2026-11-30").map((l) => l.title)).toEqual([
      "Always",
    ]);
    expect(linksLiveOn(list, "2026-12-01").map((l) => l.title)).toEqual([
      "Always",
      "December",
    ]);
    expect(linksLiveOn(list, "2027-01-01").map((l) => l.title)).toEqual([
      "Always",
    ]);
  });

  it("rejects a schedule that ends before it starts, and unsafe custom links", () => {
    const bad = (item: object) =>
      websiteConfigSchema.safeParse(
        config({
          links: {
            enabled: true,
            buttonStyle: "filled",
            showSocialIcons: false,
            items: [item as never],
          },
        }),
      ).success;
    expect(
      bad({
        id: id(5),
        source: "custom",
        title: "x",
        url: "https://a.example",
        startsOn: "2026-12-02",
        endsOn: "2026-12-01",
      }),
    ).toBe(false);
    expect(
      bad({
        id: id(5),
        source: "custom",
        title: "x",
        url: "javascript:alert(1)",
      }),
    ).toBe(false);
    expect(bad({ id: id(5), source: "custom", title: "x", url: "" })).toBe(
      true,
    );
  });

  it("keeps old saved configs working (links off, no booking)", () => {
    const old = { ...defaultConfig() } as Record<string, unknown>;
    delete old.links;
    delete old.booking;
    const repaired = normalizeConfig(old);
    expect(repaired.links.enabled).toBe(false);
    expect(repaired.booking.url).toBe("");
  });
});

describe("links page view", () => {
  it("renders the buttons with tracking, own-site links and a highlighted button", () => {
    const content = buildPublishedContent(
      source,
      config({
        links: {
          enabled: true,
          buttonStyle: "filled",
          showSocialIcons: true,
          items: [
            {
              id: id(5),
              source: "custom",
              title: "My course",
              url: "https://course.example",
              highlight: true,
            },
            { id: id(9), source: "article", refId: id(4) },
            { id: id(1), source: "website" },
          ],
        },
      }),
    );
    render(
      <LinksView
        content={content}
        items={content.links!.items}
        siteSlug="alex"
        colors={{ bg: "#ffffff", fg: "#111111", accent: "#ff7a59" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Alex Example" }),
    ).toBeInTheDocument();
    const course = screen.getByRole("link", { name: /My course/ });
    expect(course).toHaveAttribute("target", "_blank");
    expect(course).toHaveAttribute("data-track-kind", "custom");
    expect(within(course).getByLabelText("Featured")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /The power of defaults/ }),
    ).toHaveAttribute("href", "/alex/articles/defaults");
    expect(screen.getByRole("link", { name: /^My website/ })).toHaveAttribute(
      "href",
      "/alex",
    );
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "data-track-kind",
      "social",
    );
  });

  it("picks readable text on the accent colour", () => {
    expect(readableOn("#111111")).toBe("#ffffff");
    expect(readableOn("#f5e663")).toBe("#111111");
  });
});

describe("editors", () => {
  it("date picker picks a day and blocks days before min", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState("2026-12-10");
      return (
        <>
          <DatePicker
            aria-label="Hide after"
            value={v}
            min="2026-12-05"
            onChange={setV}
          />
          <output data-testid="v">{v}</output>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Hide after" }));
    expect(
      await screen.findByRole("menuitem", {
        name: "Thursday, December 3, 2026",
      }),
    ).toHaveAttribute("data-disabled");
    await user.click(
      screen.getByRole("menuitem", { name: "Sunday, December 20, 2026" }),
    );
    expect(screen.getByTestId("v")).toHaveTextContent("2026-12-20");
  });

  it("links editor adds a custom link and highlights it", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [c, setC] = useState(
        config({
          links: {
            enabled: true,
            buttonStyle: "filled",
            showSocialIcons: true,
            items: [],
          },
        }),
      );
      return (
        <>
          <LinksEditor
            config={c}
            onChange={setC}
            socialChoices={[]}
            featuredChoices={[
              {
                id: id(3),
                title: "My keynote",
                subtitle: "",
                masterVisible: true,
              },
            ]}
            articleChoices={[]}
            linksUrl="https://folioone.com/alex/links"
            live
          />
          <output data-testid="cfg">{JSON.stringify(c.links.items)}</output>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Add a link/ }));
    expect(
      await screen.findByRole("menuitem", { name: /Booking page/ }),
    ).toHaveAttribute("data-disabled");
    await user.click(screen.getByRole("menuitem", { name: /Custom link/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Button text" }),
      "My course",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "https://course.example",
    );
    await user.click(
      screen.getByRole("button", { name: "Highlight My course" }),
    );
    const saved = JSON.parse(screen.getByTestId("cfg").textContent!);
    expect(saved[0]).toMatchObject({
      source: "custom",
      title: "My course",
      url: "https://course.example",
      highlight: true,
    });
  });
});

describe("booking insights", () => {
  it("counts scheduler opens and booking link taps", () => {
    expect(INSIGHT_EVENTS).toContain("booking_open");
    const now = new Date("2026-11-18T12:00:00Z");
    const r = aggregateInsights(
      [
        {
          website_id: "w",
          event: "booking_open",
          occurred_at: "2026-11-17T10:00:00Z",
        },
        {
          website_id: "w",
          event: "link_click",
          target_kind: "booking",
          occurred_at: "2026-11-17T11:00:00Z",
        },
        {
          website_id: "w",
          event: "link_click",
          target_kind: "social",
          occurred_at: "2026-11-17T11:00:00Z",
        },
      ],
      { days: 7, now },
    );
    expect(r.kpis.bookingOpens.current).toBe(2);
  });

  it("the SQL allows the event and is part of local validation", () => {
    const sql = readFileSync(
      "docs/sql/milestone-12/001-booking-insights.sql",
      "utf8",
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT insight_events_event_check[\s\S]*'booking_open'/,
    );
    // Events added later (M13 video_complete) are covered by their own milestone's test.
    for (const e of INSIGHT_EVENTS.filter((e) => e !== "video_complete"))
      expect(sql).toContain(`'${e}'`);
    expect(readFileSync("scripts/validate/validate.mjs", "utf8")).toContain(
      '"docs/sql/milestone-12/001-booking-insights.sql"',
    );
  });
});
