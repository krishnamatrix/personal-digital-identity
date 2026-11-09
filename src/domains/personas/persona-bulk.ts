import { PROFILE_FIELDS } from "@/domains/personas/persona-constants";
import { completeSelections } from "@/domains/personas/persona-resolver";
import type {
  BulkAction,
  BulkPlan,
  PersonaDetail,
  ProfileFieldChange,
} from "@/domains/personas/persona-types";

const COPY: Record<
  BulkAction["kind"],
  { title: string; description: string; effect: string }
> = {
  include_all: {
    title: "Include all My Identity fields",
    description:
      "These profile fields will be included in this Persona. My Identity itself is not changed.",
    effect: "Will be included",
  },
  exclude_all: {
    title: "Exclude all My Identity fields",
    description:
      "These profile fields will be excluded from this Persona, and any highlights on them removed. My Identity itself is not changed.",
    effect: "Will be excluded",
  },
  clear_highlights: {
    title: "Clear all highlights",
    description:
      "Highlights will be removed from these fields. Inclusion and wording are unchanged.",
    effect: "Highlight removed",
  },
  reset_overrides: {
    title: "Use My Identity values everywhere",
    description:
      "Persona-specific wording will be removed from these fields so they show your current My Identity value again.",
    effect: "Persona wording removed",
  },
};

/**
 * Computes the exact field changes for a category-scoped bulk action and the
 * confirmation summary shown before it is applied. The plan is applied as ONE
 * atomic repository operation (one version bump, one revision): either every
 * affected field changes or none does.
 */
export function planBulkAction(
  detail: PersonaDetail,
  action: BulkAction,
): BulkPlan {
  const copy = COPY[action.kind];
  const selections = completeSelections(detail.selections);
  const changes: ProfileFieldChange[] = [];

  for (const selection of selections) {
    const hasOverride = detail.overrides.some(
      (o) => o.fieldKey === selection.fieldKey,
    );
    switch (action.kind) {
      case "include_all":
        if (!selection.isIncluded) {
          changes.push({ fieldKey: selection.fieldKey, isIncluded: true });
        }
        break;
      case "exclude_all":
        if (selection.isIncluded) {
          changes.push({ fieldKey: selection.fieldKey, isIncluded: false });
        }
        break;
      case "clear_highlights":
        if (selection.isHighlighted) {
          changes.push({ fieldKey: selection.fieldKey, isHighlighted: false });
        }
        break;
      case "reset_overrides":
        if (hasOverride) {
          changes.push({
            fieldKey: selection.fieldKey,
            override: { action: "reset" },
          });
        }
        break;
    }
  }

  return {
    changes,
    summary: {
      action,
      title: copy.title,
      description: copy.description,
      affected: changes.map((change) => ({
        fieldKey: change.fieldKey,
        label: PROFILE_FIELDS[change.fieldKey].label,
        effect: copy.effect,
      })),
      unchangedCount: selections.length - changes.length,
      isNoop: changes.length === 0,
    },
  };
}
