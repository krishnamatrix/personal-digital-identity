"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Day picker ("YYYY-MM-DD") in the workspace style, replacing the browser's native
 * <input type="date">. Same construction as MonthPicker: a Radix dropdown menu holding a
 * month calendar (weeks start on Monday). Dates are calendar days, not instants.
 */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const LONG = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const utc = (value: string) => new Date(`${value}T00:00:00Z`);

export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = utc(value);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? null
    : d;
}

export function dayLabel(value: string): string {
  const d = parseDay(value);
  return d ? LONG.format(d) : "";
}

const cell =
  "flex h-8 cursor-pointer items-center justify-center rounded-lg text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-30";
const navButton =
  "text-muted-foreground flex size-8 cursor-pointer items-center justify-center rounded-lg outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground";

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  min,
  invalid,
  describedBy,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest selectable day (YYYY-MM-DD). */
  min?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const selected = parseDay(value);
  const today = new Date().toISOString().slice(0, 10);
  const start = selected ?? utc(today);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({
    y: start.getUTCFullYear(),
    m: start.getUTCMonth(),
  });

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const shift = (delta: number) =>
    setView(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  const keepOpen = (fn: () => void) => (event: Event) => {
    event.preventDefault();
    fn();
  };

  return (
    <Menu.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const s = parseDay(value) ?? utc(today);
          setView({ y: s.getUTCFullYear(), m: s.getUTCMonth() });
        }
      }}
    >
      <Menu.Trigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-label={ariaLabel ?? (selected ? undefined : placeholder)}
        className={cn(
          "group border-border bg-card hover:border-foreground/25 focus-visible:ring-foreground/15 data-[state=open]:border-foreground/30 data-[state=open]:ring-foreground/10 aria-[invalid=true]:border-danger flex h-10 w-full min-w-0 items-center gap-2 rounded-md border px-3.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:ring-2",
          className,
        )}
      >
        <CalendarDays
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? dayLabel(value) : placeholder}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          aria-label="Choose a date"
          className="border-border bg-card text-foreground z-50 w-72 rounded-xl border p-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,.25)]"
        >
          <div className="mb-1 flex items-center justify-between">
            <Menu.Item
              className={navButton}
              aria-label="Previous month"
              onSelect={keepOpen(() => shift(-1))}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Menu.Item>
            <span className="text-sm font-medium" aria-live="polite">
              {MONTH.format(first)}
            </span>
            <Menu.Item
              className={navButton}
              aria-label="Next month"
              onSelect={keepOpen(() => shift(1))}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Menu.Item>
          </div>
          <div
            className="text-muted-foreground grid grid-cols-7 pb-1 text-center text-[11px]"
            aria-hidden="true"
          >
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = iso(view.y, view.m, i + 1);
              const isSelected = day === value;
              const isToday = day === today;
              const blocked = Boolean(min && day < min);
              return (
                <Menu.Item
                  key={day}
                  disabled={blocked}
                  aria-label={FULL.format(utc(day))}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    cell,
                    isSelected &&
                      "bg-foreground text-background data-[highlighted]:bg-foreground/90",
                    !isSelected && isToday && "ring-border ring-1 ring-inset",
                  )}
                  onSelect={() => onChange(day)}
                >
                  {i + 1}
                </Menu.Item>
              );
            })}
          </div>
          <div className="border-border mt-2 flex items-center justify-between border-t pt-2 text-xs">
            <Menu.Item
              className="text-muted-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground cursor-pointer rounded-lg px-2.5 py-1.5 outline-none"
              onSelect={() => onChange("")}
            >
              Clear
            </Menu.Item>
            <Menu.Item
              disabled={Boolean(min && today < min)}
              className="data-[highlighted]:bg-muted cursor-pointer rounded-lg px-2.5 py-1.5 font-medium outline-none data-[disabled]:opacity-40"
              onSelect={() => onChange(today)}
            >
              Today
            </Menu.Item>
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
