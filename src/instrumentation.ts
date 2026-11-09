import type { Instrumentation } from "next";
import { buildRequestErrorLog } from "@/lib/server-log";

/**
 * Next.js calls this for every unhandled server error (render, route handler,
 * server action, middleware). One JSON line to stderr; the platform's log viewer
 * is the sink. An external error-monitoring service is NOT configured.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const record = buildRequestErrorLog(
    error as { name?: string; message?: string; digest?: string },
    request,
    context,
  );
  console.error(JSON.stringify(record));
};
