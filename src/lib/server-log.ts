/**
 * Structured, privacy-conscious server logging for the hosting platform
 * (Railway captures stdout). It records WHAT failed and WHERE, never request
 * headers, bodies, cookies, query strings or user content.
 */

export type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

/** Truncates and masks anything that looks like an e-mail address or a token. */
export function sanitizeMessage(message: unknown): string {
  const text = typeof message === "string" ? message : "";
  return text
    .replace(EMAIL, "[email]")
    .replace(LONG_TOKEN, "[token]")
    .slice(0, 200);
}

/** Builds the log record for a failed request. Pure, so it can be tested. */
export function buildRequestErrorLog(
  error: { name?: string; message?: string; digest?: string },
  request: { method?: string; path?: string },
  context: RequestErrorContext,
) {
  return {
    level: "error",
    event: "request_error",
    // routePath is the route PATTERN (e.g. /personas/[id]), not the visited URL.
    route: context.routePath ?? (request.path ?? "").split("?")[0],
    method: request.method ?? "unknown",
    routeType: context.routeType ?? "unknown",
    routerKind: context.routerKind ?? "unknown",
    renderSource: context.renderSource ?? "unknown",
    errorName: error.name ?? "Error",
    digest: error.digest ?? null,
    message: sanitizeMessage(error.message),
  };
}
