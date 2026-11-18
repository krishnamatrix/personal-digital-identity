"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Month picker ("YYYY-MM") in the workspace style, replacing the browser's native
 * <input type="month">. A month grid with year paging; click the year to jump between years
 * (12 at a time). Built on the Radix dropdown menu: focus, Escape, outside click and arrow-key
 * navigation come from Radix. Value is "" when empty.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parse(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}
const format = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export function monthLabel(value: string): string {
  const p = parse(value);
  return p ? LONG.format(new Date(Date.UTC(p.year, p.month - 1, 1))) : "";
}

const cell =
  "flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm outline-none select-none data-[highlighted]:bg-muted";
const navButton =
  "text-muted-foreground flex size-8 cursor-pointer items-center justify-center rounded-lg outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground";

export function MonthPicker({
  id,
  value,
  onChange,
  placeholder = "Select month",
  invalid,
  describedBy,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}) {
  const selected = parse(value);
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selected?.year ?? thisYear);
  const [view, setView] = useState<"months" | "years">("months");
  const pageStart = year - (year % 12);

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
          setYear(selected?.year ?? thisYear);
          setView("months");
        }
      }}
    >
      <Menu.Trigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-label={selected ? undefined : placeholder}
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
          {selected ? monthLabel(value) : placeholder}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          aria-label="Choose a month"
          className="border-border bg-card text-foreground z-50 w-72 rounded-xl border p-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,.25)]"
        >
          <div className="mb-1 flex items-center justify-between">
            <Menu.Item
              className={navButton}
              aria-label={
                view === "months" ? "Previous year" : "Previous years"
              }
              onSelect={keepOpen(() =>
                setYear((y) => y - (view === "months" ? 1 : 12)),
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Menu.Item>
            <Menu.Item
              className="data-[highlighted]:bg-muted cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
              aria-label={
                view === "months"
                  ? `${year}, choose another year`
                  : "Back to months"
              }
              onSelect={keepOpen(() =>
                setView((v) => (v === "months" ? "years" : "months")),
              )}
            >
              {view === "months" ? year : `${pageStart} – ${pageStart + 11}`}
            </Menu.Item>
            <Menu.Item
              className={navButton}
              aria-label={view === "months" ? "Next year" : "Next years"}
              onSelect={keepOpen(() =>
                setYear((y) => y + (view === "months" ? 1 : 12)),
              )}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Menu.Item>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {view === "months"
              ? MONTHS.map((name, index) => {
                  const month = index + 1;
                  const isSelected =
                    selected?.year === year && selected.month === month;
                  const isCurrent = year === thisYear && month === thisMonth;
                  return (
                    <Menu.Item
                      key={name}
                      aria-label={LONG.format(
                        new Date(Date.UTC(year, index, 1)),
                      )}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        cell,
                        isSelected &&
                          "bg-foreground text-background data-[highlighted]:bg-foreground/90",
                        !isSelected &&
                          isCurrent &&
                          "ring-border ring-1 ring-inset",
                      )}
                      onSelect={() => onChange(format(year, month))}
                    >
                      {name}
                    </Menu.Item>
                  );
                })
              : Array.from({ length: 12 }, (_, i) => pageStart + i).map((y) => (
                  <Menu.Item
                    key={y}
                    className={cn(
                      cell,
                      y === selected?.year &&
                        "bg-foreground text-background data-[highlighted]:bg-foreground/90",
                      y !== selected?.year &&
                        y === thisYear &&
                        "ring-border ring-1 ring-inset",
                    )}
                    onSelect={keepOpen(() => {
                      setYear(y);
                      setView("months");
                    })}
                  >
                    {y}
                  </Menu.Item>
                ))}
          </div>

          <div className="border-border mt-2 flex items-center justify-between border-t pt-2 text-xs">
            <Menu.Item
              className="text-muted-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground cursor-pointer rounded-lg px-2.5 py-1.5 outline-none"
              onSelect={() => onChange("")}
            >
              Clear
            </Menu.Item>
            <Menu.Item
              className="data-[highlighted]:bg-muted cursor-pointer rounded-lg px-2.5 py-1.5 font-medium outline-none"
              onSelect={() => onChange(format(thisYear, thisMonth))}
            >
              This month
            </Menu.Item>
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
