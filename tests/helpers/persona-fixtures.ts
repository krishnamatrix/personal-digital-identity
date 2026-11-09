import {
  InMemoryPersonaRepository,
  type InMemoryPersonaRepositoryOptions,
} from "@/domains/personas/persona-memory-repository";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
} from "@/domains/personas/persona-constants";
import {
  createPersonaService,
  type PersonaContext,
} from "@/domains/personas/persona-service";
import type {
  CanonicalProfile,
  CreatePersonaInputLike,
  NormalizedPersonaCreate,
} from "@/domains/personas/persona-types";

export const ACCOUNT_A = "account-a";
export const ACCOUNT_B = "account-b";

export const CANONICAL: CanonicalProfile = {
  displayName: "Alex Morgan",
  headline: "Product leader",
  summary: "I build thoughtful products.",
  location: "Lisbon",
  websiteUrl: "https://alex.example.com",
  linkedinUrl: null,
  githubUrl: null,
};

/** Deterministic clock: advances only when told to. */
export function makeClock(start = "2026-11-09T09:00:00.000Z") {
  let time = Date.parse(start);
  return {
    now: () => new Date(time),
    tick: (ms = 60_000) => {
      time += ms;
    },
  };
}

export function makeIds(prefix = "persona") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function newRepo(options: InMemoryPersonaRepositoryOptions = {}) {
  const clock = makeClock();
  const repo = new InMemoryPersonaRepository({
    now: clock.now,
    newId: makeIds(),
    ...options,
  });
  return { repo, clock };
}

export function normalizedCreate(
  patch: Partial<NormalizedPersonaCreate> = {},
  name = "Founder",
): NormalizedPersonaCreate {
  return {
    metadata: { name, description: null, audience: null, purpose: null },
    selections: PROFILE_FIELD_KEYS.map((fieldKey, position) => ({
      fieldKey,
      isIncluded: false,
      isHighlighted: false,
      position,
    })),
    overrides: [],
    sections: STARTER_SECTIONS.map((section, position) => ({
      sectionKey: section.key,
      label: null,
      isVisible: false,
      position,
    })),
    makeDefault: false,
    ...patch,
  };
}

export function makeService(
  options: {
    repo?: InMemoryPersonaRepository;
    accountId?: string;
    canonical?: CanonicalProfile;
    failCanonical?: boolean;
    loadCanonical?: () => Promise<CanonicalProfile>;
  } = {},
) {
  const repo = options.repo ?? newRepo().repo;
  const loadCanonical =
    options.loadCanonical ??
    (async () => {
      if (options.failCanonical) throw new Error("identity unavailable");
      return options.canonical ?? CANONICAL;
    });
  const context: PersonaContext = {
    accountId: options.accountId ?? ACCOUNT_A,
    loadCanonicalProfile: loadCanonical,
  };
  return {
    repo,
    service: createPersonaService({
      repository: repo,
      getContext: async () => context,
    }),
  };
}

/** A complete create-flow payload with the given fields included. */
export function createFlowInput(
  patch: {
    name?: string;
    included?: string[];
    highlighted?: string[];
    overrides?: Record<string, string | null>;
    visibleSections?: string[];
    makeDefault?: boolean;
  } = {},
): CreatePersonaInputLike {
  return {
    metadata: {
      name: patch.name ?? "Founder",
      audience: "Investors",
      purpose: "Fundraising",
      description: "",
    },
    fields: PROFILE_FIELD_KEYS.map((fieldKey, position) => {
      const custom = patch.overrides && fieldKey in patch.overrides;
      return {
        fieldKey,
        isIncluded: patch.included?.includes(fieldKey) ?? false,
        isHighlighted: patch.highlighted?.includes(fieldKey) ?? false,
        position,
        override: custom
          ? { mode: "custom" as const, value: patch.overrides![fieldKey] }
          : { mode: "identity" as const },
      };
    }),
    sections: STARTER_SECTIONS.map((section) => ({
      sectionKey: section.key,
      label: null,
      isVisible: patch.visibleSections?.includes(section.key) ?? false,
    })),
    makeDefault: patch.makeDefault ?? false,
  };
}
