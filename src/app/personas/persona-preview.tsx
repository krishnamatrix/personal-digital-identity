"use client";

import { useId, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProvenanceBadge } from "@/app/personas/persona-ui";
import type {
  ResolvedField,
  ResolvedPersona,
} from "@/domains/personas/persona-types";

type Props = {
  preview: ResolvedPersona;
  personaName: string;
  audience?: string | null;
  purpose?: string | null;
  /** Shown when the user has unsaved edits the preview does not reflect. */
  unsavedNote?: boolean;
};

/**
 * Private, owner-only preview of the effective content. Values come from the
 * shared resolver, so any later consumer (Portfolio, Cards, CV) inherits the
 * same inclusion and override semantics. Nothing here publishes anything.
 */
export function PersonaPreview({
  preview,
  personaName,
  audience,
  purpose,
  unsavedNote,
}: Props) {
  const [frame, setFrame] = useState<"desktop" | "mobile">("desktop");
  const [showProvenance, setShowProvenance] = useState(false);
  const provenanceId = useId();
  const visible = preview.sections.filter((s) => s.isVisible);
  const hidden = preview.sections.filter((s) => !s.isVisible);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">
            Only you can see this preview.
          </span>{" "}
          Nothing is published or shared.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div role="group" aria-label="Preview frame" className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={frame === "desktop" ? "default" : "outline"}
              aria-pressed={frame === "desktop"}
              onClick={() => setFrame("desktop")}
            >
              <Monitor className="size-4" aria-hidden="true" />
              Desktop
            </Button>
            <Button
              type="button"
              size="sm"
              variant={frame === "mobile" ? "default" : "outline"}
              aria-pressed={frame === "mobile"}
              onClick={() => setFrame("mobile")}
            >
              <Smartphone className="size-4" aria-hidden="true" />
              Mobile
            </Button>
          </div>
          <label
            htmlFor={provenanceId}
            className="flex items-center gap-2 text-sm"
          >
            <Switch
              id={provenanceId}
              checked={showProvenance}
              onChange={(event) => setShowProvenance(event.target.checked)}
            />
            Show where each value comes from
          </label>
        </div>
      </div>

      {unsavedNote && (
        <p role="note" className="text-muted-foreground text-sm">
          This preview shows saved changes only. Save your edits to see them
          here.
        </p>
      )}
      {preview.notices.map((notice) => (
        <p
          key={notice}
          role="note"
          className="border-border bg-card rounded-lg border p-3 text-sm leading-6"
        >
          {notice}
        </p>
      ))}

      <div className="bg-muted rounded-lg p-4 md:p-6">
        <div
          data-testid="preview-frame"
          data-frame={frame}
          className={`border-border bg-card mx-auto rounded-lg border p-6 md:p-8 ${frame === "mobile" ? "max-w-xs" : "max-w-3xl"}`}
        >
          <p className="eyebrow">{personaName}</p>
          {(audience || purpose) && (
            <p className="text-muted-foreground mt-1 text-xs">
              {[audience, purpose].filter(Boolean).join(" · ")}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="text-muted-foreground mt-6 text-sm leading-6">
              No sections are shown yet. Choose sections in the Content tab.
            </p>
          ) : (
            <div className="mt-6 space-y-8">
              {visible.map((section) => (
                <section key={section.sectionKey} aria-label={section.label}>
                  <h3 className="border-border font-display border-b pb-2 text-xl">
                    {section.label}
                  </h3>
                  {section.sectionKey === "profile" ? (
                    section.fields.length === 0 ? (
                      <p className="text-muted-foreground mt-3 text-sm">
                        No fields are included in this section.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {section.fields.map((field) => (
                          <PreviewField
                            key={field.fieldKey}
                            field={field}
                            showProvenance={showProvenance}
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Nothing to show here yet.
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-border bg-card grid gap-4 rounded-lg border p-5 text-sm md:grid-cols-2">
        <div>
          <h3 className="font-medium">
            Not shown ({preview.excludedFields.length}{" "}
            {preview.excludedFields.length === 1 ? "field" : "fields"})
          </h3>
          <p className="text-muted-foreground mt-1 leading-6">
            {preview.excludedFields.length === 0
              ? "Every My Identity field is included."
              : preview.excludedFields.map((f) => f.label).join(", ")}
            . Excluded information stays in My Identity, unchanged.
          </p>
        </div>
        <div>
          <h3 className="font-medium">Hidden sections ({hidden.length})</h3>
          <p className="text-muted-foreground mt-1 leading-6">
            {hidden.length === 0
              ? "All sections are shown."
              : hidden.map((s) => s.label).join(", ")}
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewField({
  field,
  showProvenance,
}: {
  field: ResolvedField;
  showProvenance: boolean;
}) {
  const value =
    field.value !== null ? (
      field.fieldKey === "display_name" ? (
        <p className="font-display text-3xl">{field.value}</p>
      ) : field.fieldKey === "headline" ? (
        <p className="text-lg">{field.value}</p>
      ) : (
        <p className="text-sm leading-6 break-words whitespace-pre-line">
          {field.value}
        </p>
      )
    ) : (
      <p className="text-muted-foreground text-sm italic">
        {field.provenance === "blank"
          ? "Intentionally blank"
          : "No value in My Identity"}
      </p>
    );
  return (
    <div
      data-highlighted={field.isHighlighted || undefined}
      className={field.isHighlighted ? "border-accent border-l-2 pl-4" : ""}
    >
      <p className="eyebrow mb-1">{field.label}</p>
      {value}
      {showProvenance && (
        <div className="mt-2">
          <ProvenanceBadge provenance={field.provenance} />
        </div>
      )}
    </div>
  );
}
