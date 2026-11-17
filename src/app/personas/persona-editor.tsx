"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  applyBulkActionAction,
  applyFieldChangesAction,
  moveFieldAction,
  moveSectionAction,
  previewBulkActionAction,
  reloadPersonaAction,
  saveSectionAction,
  updatePersonaDetailsAction,
  type PersonaActionResult,
} from "@/app/personas/actions";
import {
  PersonaLifecycleControls,
  type LifecycleOutcome,
} from "@/app/personas/persona-lifecycle-controls";
import { PersonaPreview } from "@/app/personas/persona-preview";
import { IdentityUnavailable } from "@/app/personas/persona-create-flow";
import {
  FailureAlert,
  ProvenanceBadge,
  SIGNED_OUT_TITLE,
  SignInAction,
  StorageNotice,
  formatDate,
  truncate,
} from "@/app/personas/persona-ui";
import {
  PERSONA_LIMITS,
  PROFILE_FIELDS,
  defaultSectionLabel,
  validateOverrideValue,
  type ProfileFieldKey,
} from "@/domains/personas/persona-constants";
import {
  completeSections,
  completeSelections,
} from "@/domains/personas/persona-resolver";
import {
  normalizeOverrideText,
  personaMetadataSchema,
  zodFieldErrors,
} from "@/domains/personas/persona-schema";
import type {
  BulkAction,
  BulkSummary,
  PersonaDetail,
  PersonaEditorData,
  ProfileFieldChange,
} from "@/domains/personas/persona-types";

type TabKey = "details" | "content" | "presentation" | "preview";
type Result = PersonaActionResult<PersonaEditorData>;

/** One user action that can be retried against a newer version if the user chooses. */
type Operation = {
  /**
   * `base` is the Persona state the request is built on. On first run it is the
   * state the user is looking at; on an explicit reapply it is the freshly
   * reloaded latest, so an action sends only what the user changed on top of it
   * and never replays a stale snapshot over someone else's newer changes.
   */
  run: (version: number, base: PersonaDetail) => Promise<Result>;
  success: string;
  after?: () => void;
  /** False when the user must re-confirm against fresh state (e.g. bulk actions). */
  reapplySafe?: boolean;
};

type DetailsEdit = {
  name: string;
  audience: string;
  purpose: string;
  description: string;
};
type PresentationEdit = { mode: "identity" | "custom"; text: string };

const CONFLICT_MESSAGE =
  "This Persona was changed in another tab or session. Your edits on this page are still here and nothing was overwritten.";

export function PersonaEditor({
  initial,
  initialTab,
  storageKind,
}: {
  initial: PersonaEditorData;
  initialTab: TabKey;
  storageKind: string;
}) {
  const router = useRouter();
  const { announcements, announce } = useAnnouncer();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<{ op: Operation | null } | null>(
    null,
  );
  const [problem, setProblem] = useState("");
  const [problemCode, setProblemCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [detailsEdit, setDetailsEdit] = useState<DetailsEdit | null>(null);
  const [presentationEdits, setPresentationEdits] = useState<
    Partial<Record<ProfileFieldKey, PresentationEdit>>
  >({});
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<BulkSummary | null>(null);

  const { persona, preview, canonical } = data;
  const readOnly = persona.status === "archived";
  const locked = readOnly || pending;

  // --- shared mutation plumbing ---------------------------------------------

  function settle(result: Result, op: Operation) {
    if (result.ok) {
      setData(result.data);
      setConflict(null);
      setProblem("");
      setFieldErrors({});
      announce(op.success);
      op.after?.();
      return true;
    }
    if (result.code === "version_conflict") {
      setConflict({ op: op.reapplySafe === false ? null : op });
      announce(CONFLICT_MESSAGE, "assertive");
      return false;
    }
    setProblem(result.message);
    setProblemCode(result.code);
    setFieldErrors(result.fieldErrors ?? {});
    announce(result.message, "assertive");
    return false;
  }

  async function perform(op: Operation) {
    setPending(true);
    const result = await op.run(persona.version, persona);
    setPending(false);
    return settle(result, op);
  }

  function clearEdits() {
    setDetailsEdit(null);
    setPresentationEdits({});
    setLabelEdits({});
  }

  async function reloadLatest() {
    setPending(true);
    const result = await reloadPersonaAction(persona.id);
    setPending(false);
    if (result.ok) {
      setData(result.data);
      setConflict(null);
      setProblem("");
      clearEdits();
      announce(
        "Reloaded the latest version. Your unsaved edits were discarded.",
      );
    } else {
      setProblem(result.message);
      setProblemCode(result.code);
      announce(result.message, "assertive");
    }
  }

  /** Explicit user choice: fetch the latest version, then retry the same action. */
  async function reapply() {
    const op = conflict?.op;
    if (!op) return;
    setPending(true);
    const latest = await reloadPersonaAction(persona.id);
    if (!latest.ok) {
      setPending(false);
      setProblem(latest.message);
      setProblemCode(latest.code);
      return;
    }
    setData(latest.data);
    const result = await op.run(
      latest.data.persona.version,
      latest.data.persona,
    );
    setPending(false);
    settle(result, op);
  }

  function handleLifecycle(outcome: LifecycleOutcome) {
    const { result } = outcome;
    if (!result.ok) {
      if (result.code === "version_conflict") {
        setConflict({ op: null });
        announce(CONFLICT_MESSAGE, "assertive");
      } else {
        setProblem(result.message);
        setProblemCode(result.code);
        announce(result.message, "assertive");
      }
      return;
    }
    setProblem("");
    setConflict(null);
    if (outcome.kind === "delete") {
      router.push("/personas");
      return;
    }
    const next = result.data as PersonaEditorData;
    if (outcome.kind === "duplicate") {
      router.push(`/personas/${next.persona.id}`);
      return;
    }
    setData(next);
    announce(
      {
        default: `${next.persona.name} is now your default Persona.`,
        remove_default: `${next.persona.name} is no longer your default Persona.`,
        archive: `${next.persona.name} was archived and is now read-only.`,
        restore: `${next.persona.name} was restored. It is not your default.`,
      }[outcome.kind],
    );
  }

  // --- details ------------------------------------------------------------------

  const savedDetails: DetailsEdit = {
    name: persona.name,
    audience: persona.audience ?? "",
    purpose: persona.purpose ?? "",
    description: persona.description ?? "",
  };
  const details = detailsEdit ?? savedDetails;
  const detailsDirty =
    detailsEdit !== null &&
    JSON.stringify(detailsEdit) !== JSON.stringify(savedDetails);

  async function saveDetails() {
    const parsed = personaMetadataSchema.safeParse(details);
    if (!parsed.success) {
      const found = zodFieldErrors(parsed.error);
      setFieldErrors(found);
      announce(Object.values(found)[0][0], "assertive");
      return;
    }
    // Only the fields the user actually changed are applied on top of the base.
    const touched = (Object.keys(details) as (keyof DetailsEdit)[]).filter(
      (key) => details[key] !== savedDetails[key],
    );
    await perform({
      run: (version, base) =>
        updatePersonaDetailsAction(persona.id, version, {
          name: touched.includes("name") ? details.name : base.name,
          audience: touched.includes("audience")
            ? details.audience
            : (base.audience ?? ""),
          purpose: touched.includes("purpose")
            ? details.purpose
            : (base.purpose ?? ""),
          description: touched.includes("description")
            ? details.description
            : (base.description ?? ""),
        }),
      success: "Details saved.",
      after: () => setDetailsEdit(null),
    });
  }

  // --- content ------------------------------------------------------------------

  function changeField(change: ProfileFieldChange, success: string) {
    return perform({
      run: (version) => applyFieldChangesAction(persona.id, version, [change]),
      success,
    });
  }

  function moveField(key: ProfileFieldKey, direction: "up" | "down") {
    return perform({
      run: (version) => moveFieldAction(persona.id, version, key, direction),
      success: `${PROFILE_FIELDS[key].label} moved ${direction}.`,
    });
  }

  /** Sends only the properties in `patch`; the rest come from the latest state. */
  function saveSection(
    sectionKey: string,
    patch: { label?: string | null; isVisible?: boolean },
    success: string,
    after?: () => void,
  ) {
    return perform({
      run: (version, base) => {
        const current = base.sections.find((s) => s.sectionKey === sectionKey);
        return saveSectionAction(persona.id, version, {
          sectionKey,
          label:
            patch.label !== undefined ? patch.label : (current?.label ?? null),
          isVisible: patch.isVisible ?? current?.isVisible ?? false,
        });
      },
      success,
      after,
    });
  }

  function moveSection(
    sectionKey: string,
    direction: "up" | "down",
    label: string,
  ) {
    return perform({
      run: (version) =>
        moveSectionAction(persona.id, version, sectionKey, direction),
      success: `${label} moved ${direction}.`,
    });
  }

  async function startBulk(action: BulkAction) {
    setPending(true);
    const result = await previewBulkActionAction(
      persona.id,
      persona.version,
      action,
    );
    setPending(false);
    if (result.ok) {
      setBulk(result.data);
      return;
    }
    if (result.code === "version_conflict") {
      setConflict({ op: null });
      announce(CONFLICT_MESSAGE, "assertive");
    } else {
      setProblem(result.message);
      setProblemCode(result.code);
      announce(result.message, "assertive");
    }
  }

  async function confirmBulk() {
    if (!bulk) return;
    const action = bulk.action;
    const ok = await perform({
      run: (version) => applyBulkActionAction(persona.id, version, action),
      success: `${bulk.title}: ${bulk.affected.length} field${bulk.affected.length === 1 ? "" : "s"} updated.`,
      reapplySafe: false,
    });
    setBulk(null);
    return ok;
  }

  // --- presentation -------------------------------------------------------------

  function savedPresentation(key: ProfileFieldKey): PresentationEdit {
    const override = persona.overrides.find((o) => o.fieldKey === key);
    return override
      ? { mode: "custom", text: override.value ?? "" }
      : { mode: "identity", text: "" };
  }
  function currentPresentation(key: ProfileFieldKey) {
    return presentationEdits[key] ?? savedPresentation(key);
  }
  function isPresentationDirty(key: ProfileFieldKey) {
    const edit = presentationEdits[key];
    if (!edit) return false;
    const saved = savedPresentation(key);
    if (edit.mode !== saved.mode) return true;
    return (
      edit.mode === "custom" &&
      normalizeOverrideText(edit.text) !== normalizeOverrideText(saved.text)
    );
  }
  const dirtyPresentation = completeSelections(persona.selections)
    .filter((s) => s.isIncluded)
    .map((s) => s.fieldKey)
    .filter(isPresentationDirty);

  async function savePresentation() {
    const found: Record<string, string[]> = {};
    const changes: ProfileFieldChange[] = dirtyPresentation.map((key) => {
      const edit = currentPresentation(key);
      if (edit.mode === "custom") {
        const message = validateOverrideValue(
          key,
          normalizeOverrideText(edit.text),
        );
        if (message) found[key] = [message];
        return { fieldKey: key, override: { action: "set", value: edit.text } };
      }
      return { fieldKey: key, override: { action: "reset" } };
    });
    if (Object.keys(found).length > 0) {
      setFieldErrors(found);
      announce(Object.values(found)[0][0], "assertive");
      return;
    }
    await perform({
      run: (version) => applyFieldChangesAction(persona.id, version, changes),
      success: "Presentation saved.",
      after: () => setPresentationEdits({}),
    });
  }

  const unsaved =
    detailsDirty ||
    dirtyPresentation.length > 0 ||
    Object.keys(labelEdits).length > 0;

  // Closing or reloading the tab with unsaved edits asks for confirmation. (In-app
  // links are not intercepted; the edits live only in this page's state.)
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // --- render -------------------------------------------------------------------

  return (
    <div className="space-y-6" data-testid="persona-editor">
      <LiveRegions announcements={announcements} />
      <div>
        <Link
          href="/personas"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All Personas
        </Link>
      </div>

      <header className="border-border bg-card space-y-4 rounded-lg border p-6 md:p-8">
        <div>
          <p className="eyebrow">Persona</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
              {persona.name}
            </h1>
            {persona.isDefault && <Badge>Default</Badge>}
            {readOnly && (
              <Badge className="bg-muted text-muted-foreground">Archived</Badge>
            )}
          </div>
          {(persona.audience || persona.purpose) && (
            <p className="text-muted-foreground mt-2 text-sm">
              {[persona.audience, persona.purpose].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            Version {persona.version} · {persona.revisionCount} revision
            {persona.revisionCount === 1 ? "" : "s"} · Updated{" "}
            {formatDate(persona.updatedAt)}
          </p>
        </div>
        <PersonaLifecycleControls
          persona={persona}
          disabled={pending}
          onOutcome={handleLifecycle}
        />
      </header>

      <StorageNotice kind={storageKind} />
      {!data.canonicalAvailable && <IdentityUnavailable />}

      {readOnly && (
        <p
          role="note"
          className="border-border bg-card rounded-lg border p-4 text-sm leading-6"
        >
          This Persona is archived and read-only. Restore it to make changes. It
          cannot be your default or be used for anything else while archived.
        </p>
      )}

      {conflict && (
        <FailureAlert
          title="Out of date"
          actions={
            <>
              <Button
                pending={pending}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={reloadLatest}
              >
                Reload latest
              </Button>
              {conflict.op && (
                <Button
                  pending={pending}
                  size="sm"
                  variant="accent"
                  disabled={pending}
                  onClick={reapply}
                >
                  Reapply my change
                </Button>
              )}
            </>
          }
        >
          {CONFLICT_MESSAGE}{" "}
          {conflict.op
            ? "Reload the latest version (discarding unsaved edits), or reapply your change on top of it."
            : "Reload the latest version, then repeat the action."}
        </FailureAlert>
      )}
      {problem && !conflict && (
        <FailureAlert
          title={
            problemCode === "unauthenticated"
              ? SIGNED_OUT_TITLE
              : "That did not work"
          }
          actions={
            problemCode === "unauthenticated" ? <SignInAction /> : undefined
          }
        >
          {problem}
          {problemCode === "unauthenticated" &&
            " Your unsaved edits on this page are still here."}
        </FailureAlert>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList aria-label="Persona sections">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="presentation">Presentation</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <section className="border-border bg-card space-y-5 rounded-lg border p-6 md:p-8">
            <h2 className="font-display text-2xl">Details</h2>
            <FieldRow
              id="detail-name"
              label="Name"
              value={details.name}
              maxLength={PERSONA_LIMITS.name}
              disabled={locked}
              error={fieldErrors.name?.[0]}
              onChange={(name) => setDetailsEdit({ ...details, name })}
            />
            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow
                id="detail-audience"
                label="Audience (optional)"
                value={details.audience}
                maxLength={PERSONA_LIMITS.audience}
                disabled={locked}
                error={fieldErrors.audience?.[0]}
                onChange={(audience) =>
                  setDetailsEdit({ ...details, audience })
                }
              />
              <FieldRow
                id="detail-purpose"
                label="Purpose (optional)"
                value={details.purpose}
                maxLength={PERSONA_LIMITS.purpose}
                disabled={locked}
                error={fieldErrors.purpose?.[0]}
                onChange={(purpose) => setDetailsEdit({ ...details, purpose })}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="detail-description"
              >
                Description (optional)
              </label>
              <Textarea
                id="detail-description"
                value={details.description}
                maxLength={PERSONA_LIMITS.description}
                disabled={locked}
                aria-invalid={Boolean(fieldErrors.description)}
                onChange={(event) =>
                  setDetailsEdit({
                    ...details,
                    description: event.target.value,
                  })
                }
              />
            </div>
            <Button disabled={locked || !detailsDirty} onClick={saveDetails}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="content" className="mt-6 space-y-6">
          <section className="border-border bg-card space-y-4 rounded-lg border p-6 md:p-8">
            <div>
              <h2 className="font-display text-2xl">Sections</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Choose which sections this Persona shows, their order and their
                labels. Renaming a section never changes My Identity.
              </p>
            </div>
            <ul className="border-border divide-border divide-y rounded-md border">
              {completeSections(persona.sections).map((section, index, all) => {
                const defaultLabel = defaultSectionLabel(section.sectionKey);
                const effective = section.label ?? defaultLabel;
                const draftLabel = labelEdits[section.sectionKey];
                const labelValue = draftLabel ?? section.label ?? "";
                const labelDirty =
                  draftLabel !== undefined &&
                  (normalizeOverrideText(draftLabel) ?? null) !== section.label;
                return (
                  <li
                    key={section.sectionKey}
                    className="flex flex-wrap items-center gap-4 px-4 py-3"
                  >
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Switch
                        aria-label={`Show ${effective} section`}
                        checked={section.isVisible}
                        disabled={locked}
                        onChange={(event) =>
                          saveSection(
                            section.sectionKey,
                            { isVisible: event.target.checked },
                            `${effective} section ${event.target.checked ? "shown" : "hidden"}.`,
                          )
                        }
                      />
                      {effective}
                    </label>
                    <div className="flex max-w-sm min-w-48 flex-1 items-center gap-2">
                      <Input
                        aria-label={`Label for ${defaultLabel}`}
                        placeholder={defaultLabel}
                        value={labelValue}
                        maxLength={PERSONA_LIMITS.sectionLabel}
                        disabled={locked}
                        onChange={(event) =>
                          setLabelEdits({
                            ...labelEdits,
                            [section.sectionKey]: event.target.value,
                          })
                        }
                      />
                      {labelDirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={locked}
                          onClick={() =>
                            saveSection(
                              section.sectionKey,
                              { label: draftLabel ?? null },
                              `${defaultLabel} label saved.`,
                              () => {
                                const rest = { ...labelEdits };
                                delete rest[section.sectionKey];
                                setLabelEdits(rest);
                              },
                            )
                          }
                        >
                          Save label
                        </Button>
                      )}
                    </div>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${effective} section up`}
                        disabled={locked || index === 0}
                        onClick={() =>
                          moveSection(section.sectionKey, "up", effective)
                        }
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${effective} section down`}
                        disabled={locked || index === all.length - 1}
                        onClick={() =>
                          moveSection(section.sectionKey, "down", effective)
                        }
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="border-border bg-card space-y-4 rounded-lg border p-6 md:p-8">
            <div>
              <h2 className="font-display text-2xl">Profile fields</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Include, order and highlight the My Identity fields this Persona
                uses. New information stays excluded until you choose it.
              </p>
            </div>
            <div
              role="group"
              aria-label="Bulk actions for profile fields"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  ["include_all", "Include all"],
                  ["exclude_all", "Exclude all"],
                  ["clear_highlights", "Clear highlights"],
                  ["reset_overrides", "Use My Identity values everywhere"],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={() => startBulk({ category: "profile", kind })}
                >
                  {label}
                </Button>
              ))}
            </div>
            <ul className="border-border divide-border divide-y rounded-md border">
              {completeSelections(persona.selections).map(
                (selection, index, all) => {
                  const key = selection.fieldKey;
                  const meta = PROFILE_FIELDS[key];
                  const value = canonical[meta.canonical];
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-4 px-4 py-3"
                    >
                      <label className="flex min-w-40 flex-1 basis-40 items-start gap-3">
                        <Switch
                          aria-label={`Include ${meta.label}`}
                          checked={selection.isIncluded}
                          disabled={locked}
                          onChange={(event) =>
                            changeField(
                              {
                                fieldKey: key,
                                isIncluded: event.target.checked,
                              },
                              `${meta.label} ${event.target.checked ? "included" : "excluded"}.`,
                            )
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
                            checked={selection.isHighlighted}
                            disabled={locked || !selection.isIncluded}
                            onChange={(event) =>
                              changeField(
                                {
                                  fieldKey: key,
                                  isHighlighted: event.target.checked,
                                },
                                `${meta.label} ${event.target.checked ? "highlighted" : "no longer highlighted"}.`,
                              )
                            }
                          />
                          Highlight
                        </label>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Move ${meta.label} up`}
                            disabled={locked || index === 0}
                            onClick={() => moveField(key, "up")}
                          >
                            <ArrowUp className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Move ${meta.label} down`}
                            disabled={locked || index === all.length - 1}
                            onClick={() => moveField(key, "down")}
                          >
                            <ArrowDown className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                },
              )}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="presentation" className="mt-6">
          <section className="border-border bg-card space-y-6 rounded-lg border p-6 md:p-8">
            <div>
              <h2 className="font-display text-2xl">Presentation</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                For each included field, keep your My Identity wording or write
                a version just for this Persona. Choosing “Use My Identity
                value” removes the Persona-specific wording; clearing the text
                instead makes the field intentionally blank.
              </p>
            </div>
            {preview.fields.length === 0 ? (
              <p className="text-muted-foreground border-border rounded-md border border-dashed p-4 text-sm">
                No fields are included yet. Include fields in the Content tab to
                shape how they read here.
              </p>
            ) : (
              preview.fields.map((field) => {
                const key = field.fieldKey;
                const meta = PROFILE_FIELDS[key];
                const edit = currentPresentation(key);
                const error = fieldErrors[key]?.[0];
                const identityValue = canonical[meta.canonical];
                return (
                  <fieldset key={key} className="space-y-3">
                    <legend className="flex flex-wrap items-center gap-3 text-sm font-medium">
                      {meta.label}
                      <ProvenanceBadge provenance={field.provenance} />
                    </legend>
                    <p className="text-muted-foreground text-xs">
                      My Identity:{" "}
                      {identityValue ? truncate(identityValue) : "no value yet"}
                    </p>
                    <div className="flex flex-wrap gap-5 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`present-${key}`}
                          checked={edit.mode === "identity"}
                          disabled={locked}
                          onChange={() =>
                            setPresentationEdits({
                              ...presentationEdits,
                              [key]: { mode: "identity", text: edit.text },
                            })
                          }
                        />
                        Use My Identity value
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`present-${key}`}
                          checked={edit.mode === "custom"}
                          disabled={locked}
                          onChange={() =>
                            setPresentationEdits({
                              ...presentationEdits,
                              [key]: {
                                mode: "custom",
                                text: edit.text || (identityValue ?? ""),
                              },
                            })
                          }
                        />
                        Write for this Persona
                      </label>
                    </div>
                    {edit.mode === "custom" && (
                      <div className="space-y-2">
                        <Textarea
                          aria-label={`${meta.label} for this Persona`}
                          value={edit.text}
                          disabled={locked}
                          aria-invalid={Boolean(error)}
                          onChange={(event) =>
                            setPresentationEdits({
                              ...presentationEdits,
                              [key]: {
                                mode: "custom",
                                text: event.target.value,
                              },
                            })
                          }
                        />
                        {normalizeOverrideText(edit.text) === null && (
                          <p className="text-muted-foreground text-xs">
                            This field is intentionally blank for this Persona.
                          </p>
                        )}
                        {error && (
                          <p className="text-danger text-sm">{error}</p>
                        )}
                      </div>
                    )}
                  </fieldset>
                );
              })
            )}
            {preview.excludedFields.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Not included:{" "}
                {preview.excludedFields.map((f) => f.label).join(", ")}. Include
                them in the Content tab to present them.
              </p>
            )}
            <Button
              disabled={locked || dirtyPresentation.length === 0}
              onClick={savePresentation}
            >
              {pending ? "Saving…" : "Save presentation"}
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          <section className="border-border bg-card space-y-4 rounded-lg border p-6 md:p-8">
            <h2 className="font-display text-2xl">Preview</h2>
            <PersonaPreview
              preview={preview}
              personaName={persona.name}
              audience={persona.audience}
              purpose={persona.purpose}
              unsavedNote={unsaved}
            />
          </section>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={bulk !== null}
        onOpenChange={(open) => !open && setBulk(null)}
        title={bulk?.title ?? ""}
        description={bulk?.description}
        confirmLabel={`Apply to ${bulk?.affected.length ?? 0} field${bulk?.affected.length === 1 ? "" : "s"}`}
        confirmDisabled={bulk?.isNoop}
        pending={pending}
        onConfirm={confirmBulk}
      >
        {bulk &&
          (bulk.isNoop ? (
            <p className="text-sm">
              Nothing would change: every field already matches.
            </p>
          ) : (
            <div>
              <p className="text-sm font-medium">
                {bulk.affected.length} field
                {bulk.affected.length === 1 ? "" : "s"} will change,{" "}
                {bulk.unchangedCount} stay as they are:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {bulk.affected.map((item) => (
                  <li key={item.fieldKey}>
                    {item.label} — {item.effect}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-3 text-xs">
                Applied together as one change: all of it, or none of it.
              </p>
            </div>
          ))}
      </ConfirmDialog>
    </div>
  );
}

function FieldRow({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
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
        disabled={disabled}
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
