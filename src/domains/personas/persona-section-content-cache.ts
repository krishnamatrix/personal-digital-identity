import type { PersonaSectionContentMap } from "@/domains/personas/persona-extraction-schema";

/**
 * Owner-scoped in-memory cache for extracted Persona section content
 * (`experience`, `education`, `skills`, `projects`, etc.) until a dedicated
 * SQL column/table is authored and executed for Supabase Persona persistence.
 *
 * Keyed by `${accountId}:${personaId}` so accounts remain strictly isolated.
 */
const globalForSectionContent = globalThis as typeof globalThis & {
  __folioonePersonaSectionContent?: Map<string, PersonaSectionContentMap>;
};

function store(): Map<string, PersonaSectionContentMap> {
  globalForSectionContent.__folioonePersonaSectionContent ??= new Map();
  return globalForSectionContent.__folioonePersonaSectionContent;
}

const cacheKey = (accountId: string, personaId: string) =>
  `${accountId}:${personaId}`;

export function setPersonaSectionContent(
  accountId: string,
  personaId: string,
  content: PersonaSectionContentMap,
) {
  if (Object.keys(content).length === 0) return;
  store().set(
    cacheKey(accountId, personaId),
    JSON.parse(JSON.stringify(content)) as PersonaSectionContentMap,
  );
}

export function getPersonaSectionContent(
  accountId: string,
  personaId: string,
): PersonaSectionContentMap | undefined {
  const found = store().get(cacheKey(accountId, personaId));
  return found
    ? (JSON.parse(JSON.stringify(found)) as PersonaSectionContentMap)
    : undefined;
}

export function deletePersonaSectionContent(
  accountId: string,
  personaId: string,
) {
  store().delete(cacheKey(accountId, personaId));
}
