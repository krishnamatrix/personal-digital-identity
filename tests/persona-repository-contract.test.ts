import { InMemoryPersonaRepository } from "@/domains/personas/persona-memory-repository";
import { describePersonaRepositoryContract } from "./helpers/persona-repository-contract";

// The shared contract against the in-memory fixture. The identical suite runs
// against the Supabase adapter in tests/hosted/persona-persistence.hosted.ts.
const repo = new InMemoryPersonaRepository();
describePersonaRepositoryContract("in-memory fixture adapter", () => ({
  a: { repo, accountId: "contract-account-a" },
  b: { repo, accountId: "contract-account-b" },
}));
