"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "@/domains/identity/entry-kinds";

export type FieldValue = string | boolean | string[] | undefined;

const selectClass =
  "border-border bg-card focus-visible:ring-accent h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2";

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
        <select
          id={id}
          className={selectClass}
          value={typeof value === "string" ? value : ""}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
          type={
            field.type === "month"
              ? "month"
              : field.type === "text"
                ? "text"
                : field.type
          }
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
        <p id={`${id}-error`} className="text-xs text-red-700">
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
