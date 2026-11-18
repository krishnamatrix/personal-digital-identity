"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix Select cannot use "" as an item value; this one stands for "no choice". */
const NONE = "__none__";
import type { FieldDef } from "@/domains/identity/entry-kinds";

export type FieldValue = string | boolean | string[] | undefined;

/** One control per FieldDef type; used by both the profile forms and the list editors. */
export function FieldControl({
  field,
  idPrefix,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  idPrefix: string;
  value: FieldValue;
  error?: string;
  onChange: (value: FieldValue) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  const invalid = error ? true : undefined;
  const describedBy = error
    ? `${id}-error`
    : field.help
      ? `${id}-help`
      : undefined;

  let control;
  switch (field.type) {
    case "textarea":
      control = (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          maxLength={field.max}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );
    case "select":
      control = (
        <Select
          value={typeof value === "string" && value ? value : ""}
          onValueChange={(v) => onChange(v === NONE ? "" : v)}
        >
          <SelectTrigger
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            {!field.required && typeof value === "string" && value && (
              <>
                <SelectSeparator />
                <SelectItem value={NONE} className="text-muted-foreground">
                  Clear selection
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      );
      break;
    case "month":
      control = (
        <MonthPicker
          id={id}
          value={typeof value === "string" ? value : ""}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(v) => onChange(v)}
        />
      );
      break;
    case "tags":
    case "urls":
      control = (
        <ListInput
          id={id}
          field={field}
          value={Array.isArray(value) ? value : []}
          invalid={invalid}
          describedBy={describedBy}
          onChange={onChange}
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          type={field.type === "text" ? "text" : field.type}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          maxLength={field.max}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {field.help && !error && (
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

/** Tags (comma separated) and URL lists (one per line) keep their raw text while typing. */
function ListInput({
  id,
  field,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string[];
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string[]) => void;
}) {
  const separator = field.type === "tags" ? "," : "\n";
  const [raw, setRaw] = useState(
    value.join(field.type === "tags" ? ", " : "\n"),
  );
  return (
    <Textarea
      id={id}
      className="min-h-16"
      value={raw}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      placeholder={field.type === "tags" ? "React, TypeScript" : "https://…"}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(
          e.target.value
            .split(separator)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
