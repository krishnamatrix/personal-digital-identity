"use client";

import { useState } from "react";
import { Archive, Copy, RotateCcw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  deletePersonaAction,
  duplicatePersonaAction,
  setDefaultAction,
  setLifecycleAction,
  type PersonaActionResult,
} from "@/app/personas/actions";
import { PERSONA_LIMITS } from "@/domains/personas/persona-constants";
import type {
  PersonaEditorData,
  PersonaStatus,
} from "@/domains/personas/persona-types";

export type LifecycleSubject = {
  id: string;
  name: string;
  version: number;
  status: PersonaStatus;
  isDefault: boolean;
};

export type LifecycleOutcome =
  | {
      kind: "default" | "remove_default" | "archive" | "restore" | "duplicate";
      subject: LifecycleSubject;
      result: PersonaActionResult<PersonaEditorData>;
    }
  | {
      kind: "delete";
      subject: LifecycleSubject;
      result: PersonaActionResult<string>;
    };

type Props = {
  persona: LifecycleSubject;
  disabled?: boolean;
  onOutcome: (outcome: LifecycleOutcome) => void;
};

type Dialog = "archive" | "duplicate" | "delete" | null;

/**
 * Default, duplicate, archive/restore and permanent delete. Delete is a
 * separate group, offered only for archived Personas.
 */
export function PersonaLifecycleControls({
  persona,
  disabled,
  onOutcome,
}: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [copyName, setCopyName] = useState("");
  const archived = persona.status === "archived";
  const busy = pending || disabled;

  async function run<T extends PersonaEditorData | string>(
    action: () => Promise<PersonaActionResult<T>>,
    toOutcome: (result: PersonaActionResult<T>) => LifecycleOutcome,
  ) {
    setPending(true);
    const result = await action();
    setPending(false);
    setDialog(null);
    onOutcome(toOutcome(result));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!archived &&
          (persona.isDefault ? (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => setDefaultAction(persona.id, persona.version, false),
                  (result) => ({
                    kind: "remove_default",
                    subject: persona,
                    result,
                  }),
                )
              }
            >
              <Star className="size-4" aria-hidden="true" />
              Remove default
            </Button>
          ) : (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => setDefaultAction(persona.id, persona.version, true),
                  (result) => ({ kind: "default", subject: persona, result }),
                )
              }
            >
              <Star className="size-4" aria-hidden="true" />
              Set as default
            </Button>
          ))}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setCopyName(`${persona.name} (copy)`.slice(0, PERSONA_LIMITS.name));
            setDialog("duplicate");
          }}
        >
          <Copy className="size-4" aria-hidden="true" />
          Duplicate
        </Button>
        {archived ? (
          <Button
            pending={busy}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                () => setLifecycleAction(persona.id, persona.version, "active"),
                (result) => ({ kind: "restore", subject: persona, result }),
              )
            }
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore
          </Button>
        ) : (
          <Button
            pending={busy}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDialog("archive")}
          >
            <Archive className="size-4" aria-hidden="true" />
            Archive
          </Button>
        )}
      </div>

      {archived && (
        <div className="border-border border-t pt-3">
          <Button
            pending={busy}
            size="sm"
            variant="destructive-outline"
            disabled={busy}
            onClick={() => setDialog("delete")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete permanently…
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Archive “${persona.name}”?`}
        description={
          <>
            It will be hidden from active workflows
            {persona.isDefault ? " and will no longer be your default" : ""}.
            Its configuration is kept, and you can restore it at any time.
            Archiving does not delete anything.
          </>
        }
        confirmLabel="Archive Persona"
        pending={pending}
        onConfirm={() =>
          run(
            () => setLifecycleAction(persona.id, persona.version, "archived"),
            (result) => ({ kind: "archive", subject: persona, result }),
          )
        }
      />

      <ConfirmDialog
        open={dialog === "duplicate"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Duplicate “${persona.name}”`}
        description="The copy has the same sections, field choices and wording. It starts active and is never your default."
        confirmLabel="Create copy"
        pending={pending}
        confirmDisabled={copyName.trim() === ""}
        onConfirm={() =>
          run(
            () => duplicatePersonaAction(persona.id, copyName),
            (result) => ({ kind: "duplicate", subject: persona, result }),
          )
        }
      >
        <label
          className="text-sm font-medium"
          htmlFor={`copy-name-${persona.id}`}
        >
          Name for the copy
        </label>
        <Input
          id={`copy-name-${persona.id}`}
          className="mt-2"
          value={copyName}
          maxLength={PERSONA_LIMITS.name}
          onChange={(event) => setCopyName(event.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Permanently delete “${persona.name}”?`}
        tone="danger"
        description={
          <>
            <p>
              This permanently removes this Persona&apos;s settings, field
              choices, wording and revision history. It cannot be undone.
            </p>
            <p className="mt-2 font-medium">
              Your My Identity data is not touched.
            </p>
          </>
        }
        confirmLabel="Delete permanently"
        pending={pending}
        onConfirm={() =>
          run(
            () => deletePersonaAction(persona.id, persona.version),
            (result) => ({ kind: "delete", subject: persona, result }),
          )
        }
      />
    </div>
  );
}
