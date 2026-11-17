import Link from "next/link";
import type { ReactNode } from "react";
import type { Count, InsightsReport, Kpi } from "@/domains/insights/aggregate";
import { eventLabel, kindLabel } from "@/domains/insights/aggregate";
import { DailyChart } from "@/app/insights/daily-chart";

const RANGES = [7, 30, 90] as const;

function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border-border bg-card min-w-0 rounded-lg border p-5 ${className}`}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Delta({ kpi, days }: { kpi: Kpi; days: number }) {
  if (kpi.previous === 0 && kpi.current === 0)
    return <span className="text-muted-foreground">No activity yet</span>;
  if (kpi.previous === 0)
    return (
      <span className="text-muted-foreground">New in the last {days} days</span>
    );
  const change = Math.round(
    ((kpi.current - kpi.previous) / kpi.previous) * 100,
  );
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "■";
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">{arrow} </span>
      {change > 0 ? "+" : ""}
      {change}% vs previous {days} days
    </span>
  );
}

function Tile({
  label,
  kpi,
  days,
  extra,
}: {
  label: string;
  kpi: Kpi;
  days: number;
  extra?: string;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-display mt-1 text-3xl tabular-nums">
        {kpi.current.toLocaleString("en")}
      </p>
      <p className="mt-1 text-[11px] leading-4">
        <Delta kpi={kpi} days={days} />
      </p>
      {extra && (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{extra}</p>
      )}
    </div>
  );
}

/** Ranked list with a thin single-hue meter; values and labels stay in text colours. */
function Meter({
  items,
  empty,
  unit,
}: {
  items: Count[];
  empty: string;
  unit: string;
}) {
  if (items.length === 0)
    return <p className="text-muted-foreground text-xs">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate" title={item.name}>
              {item.name}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {item.value.toLocaleString("en")} {unit}
            </span>
          </div>
          <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-accent/80 h-full rounded-full"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const host = (url: string | null) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function InsightsDashboard({
  report,
  has,
  range,
  websiteUrl,
}: {
  report: InsightsReport;
  has: { website: boolean; card: boolean };
  range: number;
  websiteUrl: string | null;
}) {
  const k = report.kpis;
  const nothing = k.views.current === 0 && k.linkClicks.current === 0;
  const tagged = websiteUrl
    ? `${websiteUrl}?utm_source=linkedin&utm_campaign=profile`
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My presence</p>
          <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
            Insights
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            How people find and use your {has.website ? "website" : ""}
            {has.website && has.card ? " and " : ""}
            {has.card ? "digital card" : ""}: visits, the links they click, and
            where they come from. Your own visits are not counted.
          </p>
        </div>
        <nav
          aria-label="Time range"
          className="bg-muted flex rounded-md p-1 text-sm"
        >
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/insights?range=${r}`}
              aria-current={r === range ? "page" : undefined}
              className={`rounded px-3 py-1.5 ${r === range ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r} days
            </Link>
          ))}
        </nav>
      </header>

      {nothing && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No visits recorded in the last {range} days. Share your{" "}
          {has.website ? "website" : "card"} link on LinkedIn, in your email
          signature or on your CV, and visits will appear here.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Views" kpi={k.views} days={range} />
        <Tile
          label="Unique visitors"
          kpi={k.visitors}
          days={range}
          extra="Counted per day"
        />
        <Tile
          label="Link clicks"
          kpi={k.linkClicks}
          days={range}
          extra={`${k.clickRate}% of views`}
        />
        <Tile label="Email / phone taps" kpi={k.contactClicks} days={range} />
        <Tile
          label="Contacts saved"
          kpi={k.cardSaves}
          days={range}
          extra="From your card"
        />
        <Tile
          label="Video plays"
          kpi={k.videoPlays}
          days={range}
          extra={`QR opened ${k.qrOpens.current}×`}
        />
      </div>

      <Panel
        title="Views per day"
        hint={
          has.website && has.card
            ? `Website ${report.bySurface.website.toLocaleString("en")} · Card ${report.bySurface.card.toLocaleString("en")} views`
            : undefined
        }
      >
        <DailyChart days={report.daily} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Links people clicked"
          hint="Your social profiles, featured posts, projects and card links."
        >
          {report.topLinks.length === 0 ? (
            <p className="text-muted-foreground text-xs">No link clicks yet.</p>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="pb-2 font-medium">Link</th>
                  <th className="w-28 pb-2 font-medium">Type</th>
                  <th className="w-14 pb-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {report.topLinks.map((l) => (
                  <tr
                    key={`${l.kind}|${l.label}`}
                    className="border-border border-t"
                  >
                    <td className="py-2 pr-3">
                      <p className="truncate" title={l.label}>
                        {l.label}
                      </p>
                      {l.url && (
                        <p className="text-muted-foreground truncate text-xs">
                          {host(l.url)}
                        </p>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-xs whitespace-nowrap">
                      {kindLabel(l.kind)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{l.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Featured posts"
          hint="Clicks to the post, and video plays on your website."
        >
          {report.featured.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No activity yet.{" "}
              <Link href="/profile?section=featured" className="underline">
                Add featured posts
              </Link>{" "}
              and tick them in My Website → Content.
            </p>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="pb-2 font-medium">Post</th>
                  <th className="w-14 pb-2 text-right font-medium">Clicks</th>
                  <th className="w-14 pb-2 text-right font-medium">Plays</th>
                </tr>
              </thead>
              <tbody>
                {report.featured.map((f) => (
                  <tr key={f.label} className="border-border border-t">
                    <td className="py-2 pr-3">
                      <p className="truncate" title={f.label}>
                        {f.label}
                      </p>
                      {f.url && (
                        <p className="text-muted-foreground truncate text-xs">
                          {host(f.url)}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{f.clicks}</td>
                    <td className="py-2 text-right tabular-nums">
                      {f.plays || "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Where visitors come from"
          hint="The site that linked to you, or the source you tagged."
        >
          <Meter items={report.sources} empty="No visits yet." unit="visits" />
        </Panel>
        <Panel
          title="Campaigns"
          hint="Visits from links you tagged with utm_ parameters."
        >
          <Meter
            items={report.campaigns}
            empty="No tagged visits yet."
            unit="visits"
          />
          {tagged && (
            <p className="text-muted-foreground mt-4 text-xs leading-5">
              Tag the links you share to see which ones work, for example:
              <code className="bg-muted mt-1 block rounded px-2 py-1 break-all">
                {tagged}
              </code>
            </p>
          )}
        </Panel>
        <Panel title="Regions" hint="From the visitor's time zone or country.">
          <Meter items={report.regions} empty="No visits yet." unit="visits" />
        </Panel>
        <Panel title="Devices">
          <Meter items={report.devices} empty="No visits yet." unit="visits" />
        </Panel>
        <Panel title="Languages">
          <Meter
            items={report.languages}
            empty="No visits yet."
            unit="visits"
          />
        </Panel>
        <Panel
          title="Browsers & apps"
          hint="Including in-app browsers such as LinkedIn's."
        >
          <Meter items={report.browsers} empty="No visits yet." unit="visits" />
        </Panel>
        {has.website && (
          <Panel title="Pages" hint="Your website home and article pages.">
            <Meter items={report.pages} empty="No visits yet." unit="views" />
          </Panel>
        )}
      </div>

      <Panel
        title="Recent activity"
        hint="The latest 25 events. Visitors are never identified."
      >
        {report.recent.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nothing yet.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">What</th>
                  <th className="pb-2 font-medium">Detail</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Device</th>
                  <th className="pb-2 font-medium">Region</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((r, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {time(r.at)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {eventLabel(r.event)}
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {r.surface === "website" ? "Website" : "Card"}
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate py-2 pr-3">
                      {r.detail}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {r.source ?? "–"}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 capitalize">
                      {r.device ?? "–"}
                    </td>
                    <td className="text-muted-foreground py-2">
                      {r.region ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
