"use client";

import { useState } from "react";

type Day = { date: string; views: number; clicks: number };

const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    ...(long ? { weekday: "short" } : {}),
    timeZone: "UTC",
  });

/**
 * Views per day: one series, so one accent colour and no legend (the title names it).
 * Thin bars with 4 px rounded tops on a shared baseline, recessive gridlines, a hover /
 * focus tooltip per day (views and link clicks), and a table view for screen readers.
 */
export function DailyChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.views));
  const ticks = [max, Math.round(max / 2)].filter(
    (v, i, a) => v > 0 && a.indexOf(v) === i,
  );
  const step = Math.max(1, Math.ceil(days.length / 6));
  const shown = active === null ? null : days[active];

  return (
    <figure className="space-y-3">
      <div className="relative">
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 flex flex-col justify-between text-[10px]"
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="border-border/70 flex items-start border-t"
              style={{ height: 0 }}
            >
              <span className="bg-card -mt-2 pr-1">{t}</span>
            </div>
          ))}
          <div className="border-border border-t" />
        </div>
        <div
          className="relative flex h-44 items-end gap-[2px] pl-7"
          role="img"
          aria-label={`Views per day over the last ${days.length} days, up to ${max} a day.`}
          onMouseLeave={() => setActive(null)}
        >
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              className="group relative flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${dayLabel(d.date, true)}: ${d.views} views, ${d.clicks} link clicks`}
            >
              <span
                className={`w-full rounded-t-[4px] transition-opacity ${d.views ? "bg-accent" : "bg-transparent"} ${active === null || active === i ? "opacity-100" : "opacity-45"} group-focus-visible:ring-accent group-focus-visible:ring-2`}
                style={{
                  height: `${(d.views / max) * 100}%`,
                  minHeight: d.views ? 3 : 0,
                }}
              />
            </button>
          ))}
        </div>
        {shown && active !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 left-7"
            aria-hidden="true"
          >
            <div
              className="border-border bg-card absolute top-0 z-10 -translate-x-1/2 rounded-md border px-3 py-2 text-xs whitespace-nowrap shadow-md"
              style={{
                left: `${Math.min(90, Math.max(10, ((active + 0.5) / days.length) * 100))}%`,
              }}
            >
              <p className="font-medium">{dayLabel(shown.date, true)}</p>
              <p>
                <span className="tabular-nums">{shown.views}</span> views
              </p>
              <p className="text-muted-foreground">
                <span className="tabular-nums">{shown.clicks}</span> link clicks
              </p>
            </div>
          </div>
        )}
      </div>
      <div
        className="text-muted-foreground flex pl-7 text-[10px]"
        aria-hidden="true"
      >
        {days.map((d, i) => (
          <span
            key={d.date}
            className="min-w-0 flex-1 text-center whitespace-nowrap"
          >
            {i % step === 0 ? dayLabel(d.date) : ""}
          </span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer">
          Show as table
        </summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Views</th>
              <th className="py-1 text-right font-medium">Link clicks</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-border border-t">
                <td className="py-1">{dayLabel(d.date, true)}</td>
                <td className="py-1 text-right tabular-nums">{d.views}</td>
                <td className="py-1 text-right tabular-nums">{d.clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
