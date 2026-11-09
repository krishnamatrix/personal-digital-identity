"use server";

import { ZodError } from "zod";
import {
  isPersonaError,
  type PersonaErrorCode,
} from "@/domains/personas/persona-errors";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import { zodFieldErrors } from "@/domains/personas/persona-schema";
import type { PersonaService } from "@/domains/personas/persona-service";
import type {
  BulkSummary,
  PersonaEditorData,
} from "@/domains/personas/persona-types";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export type PersonaActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: PersonaErrorCode | "unknown";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

// Server actions are public endpoints: every argument is untrusted and is
// validated by the service. The account is always the verified session user.
async function run<T>(
  operation: (service: PersonaService) => Promise<T>,
): Promise<PersonaActionResult<T>> {
  try {
    return { ok: true, data: await operation(getPersonaService()) };
  } catch (error) {
    if (isPersonaError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof ZodError) {
      return {
        ok: false,
        code: "invalid_input",
        message: "Review the highlighted fields and try again.",
        fieldErrors: zodFieldErrors(error),
      };
    }
    if (error instanceof AuthenticationRequiredError) {
      return {
        ok: false,
        code: "unauthenticated",
        message: "Sign in to manage your Personas.",
      };
    }
    // Server-side diagnostics only: name and message, never sent to the client.
    console.error(
      "[personas] unexpected action failure:",
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "non-error thrown",
    );
    return {
      ok: false,
      code: "unknown",
      message: "We could not complete that. Please try again.",
    };
  }
}

type Editor = PersonaEditorData;

export async function createPersonaAction(input: unknown) {
  return run<Editor>((service) => service.create(input));
}

export async function reloadPersonaAction(personaId: string) {
  return run<Editor>((service) => service.getEditorData(personaId));
}

export async function updatePersonaDetailsAction(
  personaId: string,
  expectedVersion: number,
  input: unknown,
) {
  return run<Editor>((service) =>
    service.updateDetails(personaId, expectedVersion, input),
  );
}

export async function applyFieldChangesAction(
  personaId: string,
  expectedVersion: number,
  changes: unknown,
) {
  return run<Editor>((service) =>
    service.applyFieldChanges(personaId, expectedVersion, changes),
  );
}

export async function moveFieldAction(
  personaId: string,
  expectedVersion: number,
  fieldKey: unknown,
  direction: unknown,
) {
  return run<Editor>((service) =>
    service.moveField(personaId, expectedVersion, fieldKey, direction),
  );
}

export async function previewBulkActionAction(
  personaId: string,
  expectedVersion: number,
  action: unknown,
) {
  return run<BulkSummary>((service) =>
    service.previewBulkAction(personaId, expectedVersion, action),
  );
}

export async function applyBulkActionAction(
  personaId: string,
  expectedVersion: number,
  action: unknown,
) {
  return run<Editor>((service) =>
    service.applyBulkAction(personaId, expectedVersion, action),
  );
}

export async function saveSectionAction(
  personaId: string,
  expectedVersion: number,
  section: unknown,
) {
  return run<Editor>((service) =>
    service.saveSection(personaId, expectedVersion, section),
  );
}

export async function moveSectionAction(
  personaId: string,
  expectedVersion: number,
  sectionKey: unknown,
  direction: unknown,
) {
  return run<Editor>((service) =>
    service.moveSection(personaId, expectedVersion, sectionKey, direction),
  );
}

export async function setDefaultAction(
  personaId: string,
  expectedVersion: number,
  isDefault: boolean,
) {
  return run<Editor>((service) =>
    service.setDefault(personaId, expectedVersion, isDefault),
  );
}

export async function setLifecycleAction(
  personaId: string,
  expectedVersion: number,
  status: unknown,
) {
  return run<Editor>((service) =>
    service.setLifecycle(personaId, expectedVersion, status),
  );
}

export async function duplicatePersonaAction(
  personaId: string,
  newName: unknown,
) {
  return run<Editor>((service) => service.duplicate(personaId, newName));
}

export async function deletePersonaAction(
  personaId: string,
  expectedVersion: number,
) {
  return run<string>((service) => service.remove(personaId, expectedVersion));
}
