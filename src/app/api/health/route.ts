export const dynamic = "force-dynamic";

/**
 * Liveness probe for the hosting platform (Railway health check).
 * Deliberately touches nothing else: no database, no Auth, no environment
 * values, so it cannot leak configuration or fail because a dependency is down.
 */
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
