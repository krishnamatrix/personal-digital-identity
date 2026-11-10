"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldControl, type FieldValue } from "@/app/profile/field-controls";
import { saveEntriesAction } from "@/app/profile/actions";
import {
  cleanEntryData,
  ENTRY_KIND_DEFS,
  entrySubtitle,
  entryTitle,
  type EntryData,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";

type Draft = { item: EntryItem; isNew: boolean };

/**
 * Generic editor for one list-type kind: add, edit, delete, reorder, show/hide, save/cancel.
 * Everything kind-specific comes from ENTRY_KIND_DEFS.
 */
export function EntryListEditor({
  kind,
  initial,
  heading = true,
  onDirtyChange,
}: {
  kind: EntryKind;
  initial: EntryItem[];
  heading?: boolean;
  onDirtyChange: (kind: EntryKind, dirty: boolean) => void;
}) {
  const def = ENTRY_KIND_DEFS[kind];
  const [items, setItems] = useState<EntryItem[]>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(items) !== baseline;

  useEffect(() => onDirtyChange(kind, dirty), [kind, dirty, onDirtyChange]);

  const move = (index: number, delta: number) =>
    setItems((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  function startAdd() {
    setStatus(null);
    setDraftErrors({});
    setDraft({
      isNew: true,
      item: { id: crypto.randomUUID(), isVisible: true, data: {} },
    });
  }

  function commitDraft() {
    if (!draft) return;
    const data = cleanEntryData(draft.item.data) as EntryData;
    const errors: Record<string, string> = {};
    for (const f of def.fields) {
      if (f.required && !(f.key in data))
        errors[f.key] = `${f.label} is required.`;
      if (
        f.type === "url" &&
        typeof data[f.key] === "string" &&
        !/^https?:\/\/\S+$/.test(data[f.key] as string)
      ) {
        errors[f.key] = "Enter a full http or https URL.";
      }
    }
    const { startDate, endDate } = data as {
      startDate?: string;
      endDate?: string;
    };
    if (startDate && endDate && endDate < startDate) {
      errors.endDate = "End must not be before start.";
    }
    if (Object.keys(errors).length > 0) {
      setDraftErrors(errors);
      return;
    }
    const finished = { ...draft.item, data };
    setItems((cur) =>
      draft.isNew
        ? [...cur, finished]
        : cur.map((i) => (i.id === finished.id ? finished : i)),
    );
    setDraft(null);
    setDraftErrors({});
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveEntriesAction(kind, items);
      if (result.status === "success") {
        setBaseline(JSON.stringify(items));
        setStatus({ ok: true, text: `${def.label} saved.` });
      } else {
        setStatus({ ok: false, text: result.message });
      }
    });
  }

  return (
    <section aria-label={def.label} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading ? (
          <h3 className="font-display text-xl">{def.label}</h3>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startAdd}
          disabled={!!draft || items.length >= def.maxItems}
        >
          <Plus className="size-4" /> Add {def.singular}
        </Button>
      </div>

      {items.length === 0 && !draft && (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          <p className="text-foreground font-medium">{def.emptyTitle}</p>
          <p className="mt-1">{def.emptyHint}</p>
        </div>
      )}

      <ul className="space-y-2">
        {items.map((item, index) => {
          const editing = draft && !draft.isNew && draft.item.id === item.id;
          if (editing) return null;
          return (
            <li
              key={item.id}
              className="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
            >
              <div
                className={`min-w-0 flex-1 ${item.isVisible ? "" : "opacity-60"}`}
              >
                <p className="truncate text-sm font-medium">
                  {entryTitle(kind, item.data)}
                </p>
                {entrySubtitle(kind, item.data) && (
                  <p className="text-muted-foreground truncate text-xs">
                    {entrySubtitle(kind, item.data)}
                  </p>
                )}
                {!item.isVisible && (
                  <p className="text-muted-foreground text-xs italic">
                    Hidden from preview
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${entryTitle(kind, item.data)} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${entryTitle(kind, item.data)} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    item.isVisible
                      ? `Hide ${entryTitle(kind, item.data)}`
                      : `Show ${entryTitle(kind, item.data)}`
                  }
                  aria-pressed={item.isVisible}
                  onClick={() =>
                    setItems((cur) =>
                      cur.map((i) =>
                        i.id === item.id
                          ? { ...i, isVisible: !i.isVisible }
                          : i,
                      ),
                    )
                  }
                >
                  {item.isVisible ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${entryTitle(kind, item.data)}`}
                  disabled={!!draft}
                  onClick={() => {
                    setDraftErrors({});
                    setDraft({ isNew: false, item: structuredClone(item) });
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${entryTitle(kind, item.data)}`}
                  onClick={() =>
                    setItems((cur) => cur.filter((i) => i.id !== item.id))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {draft && (
        <div
          className="border-accent/40 bg-card space-y-4 rounded-lg border p-4"
          role="group"
          aria-label={`${draft.isNew ? "New" : "Edit"} ${def.singular}`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {def.fields.map((field) => (
              <div
                key={field.key}
                className={
                  field.type === "textarea" || field.type === "urls"
                    ? "md:col-span-2"
                    : undefined
                }
              >
                <FieldControl
                  field={field}
                  idPrefix={`${kind}-${draft.item.id}`}
                  value={draft.item.data[field.key] as FieldValue}
                  error={draftErrors[field.key]}
                  onChange={(v) =>
                    setDraft(
                      (d) =>
                        d && {
                          ...d,
                          item: {
                            ...d.item,
                            data: {
                              ...d.item.data,
                              [field.key]: v as EntryData[string],
                            },
                          },
                        },
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={commitDraft}>
              {draft.isNew ? `Add ${def.singular}` : "Update"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(null);
                setDraftErrors({});
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={save}
          disabled={pending || !dirty || !!draft}
        >
          {pending ? "Saving…" : `Save ${def.label.toLowerCase()}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => {
            setItems(JSON.parse(baseline) as EntryItem[]);
            setDraft(null);
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
    </section>
  );
}
