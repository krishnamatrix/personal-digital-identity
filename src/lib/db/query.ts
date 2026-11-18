import "server-only";

/**
 * The central, server-only entry point to Folioone's data access layer. Services import
 * everything database-related from here, never from @supabase/* and never from a client
 * component. Each domain module owns its queries; this file only re-exports them.
 *
 *   queries/identity.ts   accounts + Master Identity profile
 *   queries/entries.ts    Master Identity list entries (employment, skills, links, ...)
 *   queries/website.ts    website draft, published snapshot, publish / unpublish / change slug
 *   queries/articles.ts   Articles & Thoughts (private articles + the published article snapshot)
 *   queries/cards.ts      digital cards (private card + the published card snapshot)
 *   queries/billing.ts    plan (Free / PRO) + PRO activation from a verified payment
 *   queries/insights.ts   anonymous visit / click events on live pages, read by their owner
 *   queries/intro-videos.ts  video intro row + its private / published Storage files (M13)
 *   queries/media.ts      Supabase Storage: private profile photo + its published public copies
 *   queries/personas.ts   Persona repository (PostgREST + RPC) used when PERSONA_STORAGE=supabase
 *
 * Rules (checked by `pnpm check:db-boundary`): no `.from()` / `.rpc()` outside src/lib/db,
 * no wildcard column selection, no Supabase client construction outside the approved modules,
 * no client component importing this layer.
 */
export * from "@/lib/db/client";
export * from "@/lib/db/queries/identity";
export * from "@/lib/db/queries/entries";
export * from "@/lib/db/queries/website";
export * from "@/lib/db/queries/articles";
export * from "@/lib/db/queries/cards";
export * from "@/lib/db/queries/billing";
export * from "@/lib/db/queries/media";
export * from "@/lib/db/queries/insights";
export * from "@/lib/db/queries/intro-videos";
export * from "@/lib/db/queries/personas";
