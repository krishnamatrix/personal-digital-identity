"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldControl } from "@/app/profile/field-controls";
import { saveProfileFieldsAction } from "@/app/profile/actions";
import { PROFILE_SECTIONS } from "@/domains/identity/profile-sections";

type Values = Record<string, string>;

export function ProfileFieldsForm({
  section,
  initial,
  onDirtyChange,
}: {
  section: keyof typeof PROFILE_SECTIONS;
  initial: Values;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const def = PROFILE_SECTIONS[section];
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const dirty = def.fields.some(
    (f) => (values[f.key] ?? "") !== (saved[f.key] ?? ""),
  );

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function save() {
    setStatus(null);
    setErrors({});
    startTransition(async () => {
      const result = await saveProfileFieldsAction(section, values);
      if (result.status === "success") {
        setSaved(values);
        setStatus({ ok: true, text: result.message });
      } else {
        setErrors(result.fieldErrors ?? {});
        setStatus({ ok: false, text: result.message });
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        {def.fields.map((field) => (
          <div
            key={field.key}
            className={field.type === "textarea" ? "md:col-span-2" : undefined}
          >
            <FieldControl
              field={field}
              idPrefix={section}
              value={values[field.key] ?? ""}
              error={errors[field.key]}
              onChange={(v) =>
                setValues((cur) => ({ ...cur, [field.key]: String(v ?? "") }))
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button pending={pending} type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : def.saveLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => {
            setValues(saved);
            setErrors({});
            setStatus(null);
          }}
        >
          Cancel
        </Button>
        {dirty && (
          <span className="text-xs text-amber-700">Unsaved changes</span>
        )}
        {status && (
          <p
            role={status.ok ? "status" : "alert"}
            className={
              status.ok ? "text-sm text-green-800" : "text-danger text-sm"
            }
          >
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}
