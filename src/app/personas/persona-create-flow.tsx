"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createPersonaAction } from "@/app/personas/actions";
import type {
  PersonaSectionContentMap,
  PersonaType,
  PersonaUploadDraft,
} from "@/domains/personas/persona-extraction-schema";
import { PersonaPreview } from "@/app/personas/persona-preview";
import {
  FailureAlert,
  SIGNED_OUT_TITLE,
  SignInAction,
  StorageNotice,
  truncate,
} from "@/app/personas/persona-ui";
import {
  PERSONA_LIMITS,
  PROFILE_FIELD_KEYS,
  PROFILE_FIELDS,
  STARTER_PERSONA_NAMES,
  STARTER_SECTIONS,
  validateOverrideValue,
  type ProfileFieldKey,
} from "@/domains/personas/persona-constants";
import { resolvePersona } from "@/domains/personas/persona-resolver";
import {
  normalizeOverrideText,
  personaMetadataSchema,
  zodFieldErrors,
} from "@/domains/personas/persona-schema";
import type { CanonicalProfile } from "@/domains/personas/persona-types";

type FieldDraft = {
  isIncluded: boolean;
  isHighlighted: boolean;
  mode: "identity" | "custom";
  text: string;
};

type Draft = {
  name: string;
  audience: string;
  purpose: string;
  description: string;
  order: ProfileFieldKey[];
  fields: Record<ProfileFieldKey, FieldDraft>;
  sectionVisible: Record<string, boolean>;
  sectionContent: PersonaSectionContentMap;
  makeDefault: boolean;
};

const STEPS = [
  "Describe it",
  "Choose content",
  "Shape presentation",
  "Review",
] as const;

// Create-time presentation covers the two fields the approved UX names.
const PRESENTATION_FIELDS: ProfileFieldKey[] = ["headline", "summary"];

function initialDraft(starter: string): Draft {
  return {
    name: starter,
    audience: "",
    purpose: "",
    description: "",
    order: [...PROFILE_FIELD_KEYS],
    // Content defaults to excluded; sections start hidden.
    fields: Object.fromEntries(
      PROFILE_FIELD_KEYS.map((key) => [
        key,
        { isIncluded: false, isHighlighted: false, mode: "identity", text: "" },
      ]),
    ) as Record<ProfileFieldKey, FieldDraft>,
    sectionVisible: Object.fromEntries(
      STARTER_SECTIONS.map((s) => [s.key, false]),
    ),
    sectionContent: {},
    makeDefault: false,
  };
}

const UPLOAD_ACCEPT =
  ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

const UPLOAD_PROGRESS_STAGES = [
  "Reading your document…",
  "Converting document to clean Markdown…",
  "Identifying the best Persona type…",
  "Extracting experience, skills, projects, and highlights…",
  "Preparing your Persona draft for review…",
] as const;

export function PersonaCreateFlow({
  canonical,
  canonicalAvailable,
  storageKind,
  starter = "",
  uploadEnabled = false,
}: {
  canonical: CanonicalProfile;
  canonicalAvailable: boolean;
  storageKind: string;
  starter?: string;
  uploadEnabled?: boolean;
}) {
  const router = useRouter();
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { announcements, announce } = useAnnouncer();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(
      (STARTER_PERSONA_NAMES as readonly string[]).includes(starter)
        ? starter
        : "",
    ),
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [formCode, setFormCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [uploadStage, setUploadStage] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");
  const [detectedType, setDetectedType] = useState<PersonaType | null>(null);
  const [detectedReason, setDetectedReason] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadErrorCode, setUploadErrorCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialDraftJson = useRef<string | null>(null);
  if (initialDraftJson.current === null) {
    initialDraftJson.current = JSON.stringify(draft);
  }
  const dirty = !saved && JSON.stringify(draft) !== initialDraftJson.current;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // Move focus to the step heading on navigation (not on first render).
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  useEffect(() => {
    if (!uploading) {
      setUploadStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setUploadStage((current) =>
        current < UPLOAD_PROGRESS_STAGES.length - 1 ? current + 1 : current,
      );
    }, 2400);
    return () => window.clearInterval(timer);
  }, [uploading]);

  // Closing or reloading the tab with an unsaved draft asks for confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function patchField(key: ProfileFieldKey, patch: Partial<FieldDraft>) {
    setDraft((current) => {
      const next = { ...current.fields[key], ...patch };
      if (!next.isIncluded) next.isHighlighted = false;
      return { ...current, fields: { ...current.fields, [key]: next } };
    });
  }

  function moveField(key: ProfileFieldKey, direction: -1 | 1) {
    setDraft((current) => {
      const from = current.order.indexOf(key);
      const to = from + direction;
      if (to < 0 || to >= current.order.length) return current;
      const order = [...current.order];
      [order[from], order[to]] = [order[to], order[from]];
      return { ...current, order };
    });
    announce(
      `${PROFILE_FIELDS[key].label} moved ${direction < 0 ? "up" : "down"}.`,
    );
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploadErrorCode("");
    setUploadNotice("");

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      const msg = "Upload a PDF, Word (.docx), or plain-text (.txt, .md) file.";
      setUploadError(msg);
      announce(msg, "assertive");
      return;
    }
    if (file.size === 0) {
      const msg = "The file is empty.";
      setUploadError(msg);
      announce(msg, "assertive");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      const msg = "Upload a file of 5 MB or less.";
      setUploadError(msg);
      announce(msg, "assertive");
      return;
    }

    setUploading(true);
    setUploadingFileName(file.name);
    setUploadStage(0);
    const form = new FormData();
    form.set("file", file);

    let result:
      | { ok: true; data: PersonaUploadDraft }
      | { ok: false; code: string; message: string };
    try {
      const response = await fetch("/api/llm/persona-document", {
        method: "POST",
        body: form,
      });
      result = (await response.json()) as
        | { ok: true; data: PersonaUploadDraft }
        | { ok: false; code: string; message: string };
    } catch {
      result = {
        ok: false,
        code: "extraction_failed",
        message:
          "We could not reach the extraction service. Please try again or fill in the fields manually.",
      };
    }
    setUploading(false);

    if (!result.ok) {
      setUploadError(result.message);
      setUploadErrorCode(result.code);
      announce(result.message, "assertive");
      return;
    }

    const extracted = result.data;
    const suggestedName =
      extracted.name ??
      (extracted.personaType !== "Other" ? extracted.personaType : null);
    const filled: string[] = [];
    if (suggestedName) filled.push("name");
    if (extracted.audience) filled.push("audience");
    if (extracted.purpose) filled.push("purpose");
    if (extracted.description) filled.push("description");
    if (extracted.headline) filled.push("headline");
    if (extracted.summary) filled.push("summary");
    if (extracted.suggestedSections.length > 0) {
      filled.push("sections");
    }

    setDetectedType(extracted.personaType);
    setDetectedReason(extracted.personaTypeReason);

    setDraft((current) => {
      const nextFields = { ...current.fields };
      const nextSections = { ...current.sectionVisible };

      for (const sectionKey of extracted.suggestedSections) {
        if (sectionKey in nextSections) {
          nextSections[sectionKey] = true;
        }
      }
      for (const sectionKey of Object.keys(extracted.sectionContent ?? {})) {
        if (sectionKey in nextSections) {
          nextSections[sectionKey] = true;
        }
      }

      const extractedProfileFields: [
        ProfileFieldKey,
        string | null | undefined,
      ][] = [
        ["display_name", extracted.displayName],
        ["headline", extracted.headline],
        ["summary", extracted.summary],
        ["location", extracted.location],
        ["website_url", extracted.websiteUrl],
        ["linkedin_url", extracted.linkedinUrl],
        ["github_url", extracted.githubUrl],
      ];

      for (const [fieldKey, value] of extractedProfileFields) {
        if (value) {
          nextFields[fieldKey] = {
            ...nextFields[fieldKey],
            isIncluded: true,
            mode: "custom",
            text: value,
          };
          nextSections.profile = true;
        }
      }

      return {
        ...current,
        name: suggestedName ?? current.name,
        audience: extracted.audience ?? current.audience,
        purpose: extracted.purpose ?? current.purpose,
        description: extracted.description ?? current.description,
        fields: nextFields,
        sectionVisible: nextSections,
        sectionContent: extracted.sectionContent ?? current.sectionContent,
      };
    });

    setErrors({});
    const summary =
      filled.length > 0
        ? `Detected ${extracted.personaType} persona and filled ${filled.join(", ")} from ${file.name}. Review and edit before creating.`
        : `Detected ${extracted.personaType} persona from ${file.name}. Review and edit before creating.`;
    setUploadNotice(summary);
    announce(summary);
  }

  function validateStep(target: number): Record<string, string[]> {
    if (target === 0) {
      const parsed = personaMetadataSchema.safeParse({
        name: draft.name,
        audience: draft.audience,
        purpose: draft.purpose,
        description: draft.description,
      });
      return parsed.success ? {} : zodFieldErrors(parsed.error);
    }
    if (target === 2) {
      const found: Record<string, string[]> = {};
      for (const key of PRESENTATION_FIELDS) {
        const field = draft.fields[key];
        if (field.isIncluded && field.mode === "custom") {
          const message = validateOverrideValue(
            key,
            normalizeOverrideText(field.text),
          );
          if (message) found[key] = [message];
        }
      }
      return found;
    }
    return {};
  }

  function goNext() {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.values(found)[0][0];
      announce(first, "assertive");
      return;
    }
    setFormError("");
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  const preview = useMemo(
    () =>
      resolvePersona(
        {
          selections: draft.order.map((key, position) => ({
            fieldKey: key,
            isIncluded: draft.fields[key].isIncluded,
            isHighlighted: draft.fields[key].isHighlighted,
            position,
          })),
          overrides: PROFILE_FIELD_KEYS.filter(
            (key) => draft.fields[key].mode === "custom",
          ).map((key) => ({
            fieldKey: key,
            value: normalizeOverrideText(draft.fields[key].text),
            version: 1,
          })),
          sections: STARTER_SECTIONS.map((section, position) => ({
            sectionKey: section.key,
            label: null,
            isVisible: draft.sectionVisible[section.key] ?? false,
            position,
          })),
        },
        canonical,
      ),
    [draft, canonical],
  );

  async function save() {
    const early = { ...validateStep(0), ...validateStep(2) };
    if (Object.keys(early).length > 0) {
      setErrors(early);
      setStep(validateStep(0).name ? 0 : 2);
      announce("Review the highlighted fields before creating.", "assertive");
      return;
    }
    setSaving(true);
    setFormError("");
    const result = await createPersonaAction({
      metadata: {
        name: draft.name,
        audience: draft.audience,
        purpose: draft.purpose,
        description: draft.description,
      },
      fields: draft.order.map((key, position) => ({
        fieldKey: key,
        isIncluded: draft.fields[key].isIncluded,
        isHighlighted: draft.fields[key].isHighlighted,
        position,
        override:
          draft.fields[key].mode === "custom"
            ? { mode: "custom", value: draft.fields[key].text }
            : { mode: "identity" },
      })),
      sections: STARTER_SECTIONS.map((section) => ({
        sectionKey: section.key,
        label: null,
        isVisible: draft.sectionVisible[section.key] ?? false,
      })),
      ...(Object.keys(draft.sectionContent).length > 0
        ? { sectionContent: draft.sectionContent }
        : {}),
      makeDefault: draft.makeDefault,
    });
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      announce(`${draft.name} was created.`);
      router.push(`/personas/${result.data.persona.id}`);
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(result.message);
    setFormCode(result.code);
    announce(result.message, "assertive");
    if (result.fieldErrors?.name) setStep(0);
  }

  return (
    <div className="space-y-7" data-testid="persona-create-flow">
      <LiveRegions announcements={announcements} />
      <div>
        <p className="eyebrow mb-2">My Personas</p>
        <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
          Create Persona
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
          Nothing is saved until the final step. Creating a Persona does not
          change My Identity and does not publish anything.
        </p>
      </div>

      <StorageNotice kind={storageKind} />
      {!canonicalAvailable && <IdentityUnavailable />}

      <ol aria-label="Create Persona steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`rounded-full border px-3 py-1 text-xs ${index === step ? "border-accent bg-accent-soft text-accent font-semibold" : "border-border text-muted-foreground"}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="create-step-heading"
        className="border-border bg-card space-y-6 rounded-lg border p-6 md:p-8"
      >
        <h2
          id="create-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl outline-none"
        >
          {STEPS[step]}
        </h2>

        {Object.keys(errors).length > 0 && (
          <FailureAlert title="Please review the following">
            <ul className="list-disc pl-5">
              {Object.values(errors)
                .flat()
                .map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
            </ul>
          </FailureAlert>
        )}
        {formError && Object.keys(errors).length === 0 && (
          <FailureAlert
            title={
              formCode === "unauthenticated"
                ? SIGNED_OUT_TITLE
                : "Could not create the Persona"
            }
            actions={
              formCode === "unauthenticated" ? <SignInAction /> : undefined
            }
          >
            {formError}
            {formCode === "unauthenticated" &&
              " What you have entered here is still on this page."}
          </FailureAlert>
        )}

        {step === 0 && (
          <div className="space-y-5">
            <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">
                  Prefill from a document (optional)
                </p>
                <p className="text-muted-foreground text-xs leading-5">
                  {uploadEnabled
                    ? "Upload a PDF, Word (.docx), or text file (up to 5 MB) to suggest Persona details. Nothing is saved until the final step."
                    : "AI document upload is not configured right now — enter your Persona details below."}
                </p>
              </div>
              <div className="shrink-0">
                <input
                  ref={uploadInputRef}
                  id={uploadInputId}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  aria-label="Upload persona details file"
                  className="sr-only"
                  disabled={!uploadEnabled || uploading || saving}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    event.target.value = "";
                    void handleFileUpload(selected);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  pending={uploading}
                  disabled={!uploadEnabled || uploading || saving}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  {uploading ? "Extracting…" : "Upload persona details"}
                </Button>
              </div>
            </div>

            {uploading && (
              <div
                aria-live="polite"
                data-testid="persona-upload-progress"
                className="border-accent/25 bg-accent-soft/40 space-y-2 rounded-md border px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Loader2
                    className="text-accent size-4 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    {UPLOAD_PROGRESS_STAGES[uploadStage]}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {uploadStage + 1} / {UPLOAD_PROGRESS_STAGES.length}
                  </span>
                </div>
                <p className="text-muted-foreground pl-6 text-xs leading-5">
                  Processing{" "}
                  <span className="text-foreground font-medium">
                    {uploadingFileName}
                  </span>
                  . Nothing is saved automatically — you will review every field
                  before creating.
                </p>
              </div>
            )}

            {uploadNotice && (
              <div
                role="status"
                className="border-success/25 bg-success-soft/60 space-y-2 rounded-md border px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2
                    className="text-success size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {detectedType && (
                    <span className="border-accent/30 bg-accent-soft text-accent rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                      Detected type: {detectedType}
                    </span>
                  )}
                  <span>{uploadNotice}</span>
                </div>
                {detectedReason && (
                  <p className="text-muted-foreground pl-6 text-xs leading-5">
                    {detectedReason}
                  </p>
                )}
              </div>
            )}

            {uploadError && (
              <FailureAlert
                title={
                  uploadErrorCode === "unauthenticated"
                    ? SIGNED_OUT_TITLE
                    : "Could not upload persona details"
                }
                actions={
                  uploadErrorCode === "unauthenticated" ? (
                    <SignInAction />
                  ) : undefined
                }
              >
                {uploadError}
              </FailureAlert>
            )}

            <TextField
              id="persona-name"
              label="Name"
              required
              value={draft.name}
              maxLength={PERSONA_LIMITS.name}
              error={errors.name?.[0]}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Optional name suggestions"
            >
              <span className="text-muted-foreground text-xs">
                Optional suggestions:
              </span>
              {STARTER_PERSONA_NAMES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setDraft({ ...draft, name: suggestion })}
                  className="border-border hover:bg-muted rounded-full border px-3 py-1 text-xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                id="persona-audience"
                label="Audience (optional)"
                value={draft.audience}
                maxLength={PERSONA_LIMITS.audience}
                error={errors.audience?.[0]}
                onChange={(audience) => setDraft({ ...draft, audience })}
              />
              <TextField
                id="persona-purpose"
                label="Purpose (optional)"
                value={draft.purpose}
                maxLength={PERSONA_LIMITS.purpose}
                error={errors.purpose?.[0]}
                onChange={(purpose) => setDraft({ ...draft, purpose })}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="persona-description"
              >
                Description (optional)
              </label>
              <Textarea
                id="persona-description"
                value={draft.description}
                maxLength={PERSONA_LIMITS.description}
                aria-invalid={Boolean(errors.description)}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <div>
              <h3 className="font-medium">Profile fields</h3>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Everything starts excluded. Include only what this Persona
                should show. Values come from My Identity.
              </p>
              <ul className="border-border divide-border mt-4 divide-y rounded-md border">
                {draft.order.map((key, index) => {
                  const meta = PROFILE_FIELDS[key];
                  const field = draft.fields[key];
                  const value = canonical[meta.canonical];
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-4 px-4 py-3"
                    >
                      <label className="flex min-w-40 flex-1 basis-40 items-start gap-3">
                        <Switch
                          aria-label={`Include ${meta.label}`}
                          checked={field.isIncluded}
                          onChange={(event) =>
                            patchField(key, {
                              isIncluded: event.target.checked,
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {meta.label}
                          </span>
                          <span className="text-muted-foreground block text-xs break-words">
                            {value
                              ? truncate(value)
                              : "No value in My Identity"}
                          </span>
                        </span>
                      </label>
                      <div className="ml-auto flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            aria-label={`Highlight ${meta.label}`}
                            checked={field.isHighlighted}
                            disabled={!field.isIncluded}
                            onChange={(event) =>
                              patchField(key, {
                                isHighlighted: event.target.checked,
                              })
                            }
                          />
                          Highlight
                        </label>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Move ${meta.label} up`}
                            disabled={index === 0}
                            onClick={() => moveField(key, -1)}
                          >
                            <ArrowUp className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Move ${meta.label} down`}
                            disabled={index === draft.order.length - 1}
                            onClick={() => moveField(key, 1)}
                          >
                            <ArrowDown className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Sections</h3>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Sections start hidden. Show the ones this Persona should
                present. Profile fields appear inside the Profile section. Only
                Profile has content today; the other sections are layout only
                until those parts of My Identity arrive.
              </p>
              <ul className="border-border divide-border mt-4 divide-y rounded-md border">
                {STARTER_SECTIONS.map((section) => (
                  <li key={section.key}>
                    <label className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Switch
                        aria-label={`Show ${section.label} section`}
                        checked={draft.sectionVisible[section.key] ?? false}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            sectionVisible: {
                              ...draft.sectionVisible,
                              [section.key]: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>{section.label}</span>
                      {(draft.sectionContent[section.key]?.length ?? 0) > 0 && (
                        <span className="text-muted-foreground ml-auto text-xs">
                          {draft.sectionContent[section.key]!.length} extracted
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm leading-6">
              Keep the My Identity wording, or write a version just for this
              Persona. Your My Identity profile is never changed.
            </p>
            {PRESENTATION_FIELDS.map((key) => {
              const meta = PROFILE_FIELDS[key];
              const field = draft.fields[key];
              const error = errors[key]?.[0];
              if (!field.isIncluded) {
                return (
                  <p
                    key={key}
                    className="text-muted-foreground border-border rounded-md border border-dashed p-4 text-sm"
                  >
                    {meta.label} is not included. Include it in the previous
                    step to present it for this Persona.
                  </p>
                );
              }
              return (
                <fieldset key={key} className="space-y-3">
                  <legend className="text-sm font-medium">{meta.label}</legend>
                  <p className="text-muted-foreground text-xs">
                    My Identity:{" "}
                    {canonical[meta.canonical]
                      ? truncate(canonical[meta.canonical] ?? "")
                      : "no value yet"}
                  </p>
                  <div className="flex flex-wrap gap-5 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`mode-${key}`}
                        checked={field.mode === "identity"}
                        onChange={() => patchField(key, { mode: "identity" })}
                      />
                      Use My Identity value
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`mode-${key}`}
                        checked={field.mode === "custom"}
                        onChange={() => patchField(key, { mode: "custom" })}
                      />
                      Write for this Persona
                    </label>
                  </div>
                  {field.mode === "custom" && (
                    <div className="space-y-2">
                      <Textarea
                        aria-label={`${meta.label} for this Persona`}
                        value={field.text}
                        aria-invalid={Boolean(error)}
                        onChange={(event) =>
                          patchField(key, { text: event.target.value })
                        }
                      />
                      {normalizeOverrideText(field.text) === null && (
                        <p className="text-muted-foreground text-xs">
                          This field will be intentionally blank for this
                          Persona. Choose “Use My Identity value” to show your
                          profile wording instead.
                        </p>
                      )}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Summary label="Name" value={draft.name} />
              <Summary label="Audience" value={draft.audience || "—"} />
              <Summary label="Purpose" value={draft.purpose || "—"} />
              <Summary
                label="Selection"
                value={`${preview.counts.included} included · ${preview.counts.excluded} excluded · ${preview.counts.visibleSections} ${preview.counts.visibleSections === 1 ? "section" : "sections"} shown`}
              />
            </dl>
            <PersonaPreview
              preview={preview}
              personaName={draft.name || "Untitled Persona"}
              audience={draft.audience}
              purpose={draft.purpose}
              sectionContent={draft.sectionContent}
            />
            <label className="border-border flex items-center gap-3 rounded-md border p-4 text-sm">
              <Switch
                aria-label="Make this my default Persona"
                checked={draft.makeDefault}
                onChange={(event) =>
                  setDraft({ ...draft, makeDefault: event.target.checked })
                }
              />
              <span>
                Make this my default Persona
                <span className="text-muted-foreground block text-xs">
                  Off by default. You can change this later.
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button asChild variant="ghost">
            <Link href="/personas">Cancel</Link>
          </Button>
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setErrors({});
                  setStep(step - 1);
                }}
              >
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button
                pending={saving}
                type="button"
                variant="accent"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Creating…" : "Create Persona"}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function IdentityUnavailable() {
  return (
    <FailureAlert title="My Identity could not be read right now">
      Values from My Identity may appear empty. Nothing in My Identity has been
      changed, and your Persona choices are unaffected.
    </FailureAlert>
  );
}
