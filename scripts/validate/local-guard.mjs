// Guards that keep the local validation workflow away from hosted Supabase.
// Used by the orchestrator, by Vitest (setup file) and by Playwright's config.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** True only for loopback hosts. */
export function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname).toLowerCase());
}

/** Throws unless `value` is a URL whose host is loopback. */
export function assertLocalUrl(value, label = "URL") {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`${label} is not a valid URL; refusing to continue.`);
  }
  if (!isLocalHost(url.hostname)) {
    throw new Error(
      `${label} points at "${url.hostname}", which is not a local address. ` +
        "The local validation workflow never connects to hosted Supabase.",
    );
  }
  return url;
}

function requestHost(input) {
  if (typeof input === "string") return new URL(input).hostname;
  if (input instanceof URL) return input.hostname;
  return new URL(input.url).hostname;
}

/**
 * Wraps fetch so any request to a non-loopback host fails immediately.
 * Returns an uninstall function. Idempotent.
 */
export function installFetchGuard(target = globalThis) {
  if (target.__folioneLocalFetchGuard) return () => {};
  const original = target.fetch;
  target.fetch = function guardedFetch(input, init) {
    const host = requestHost(input);
    if (!isLocalHost(host)) {
      return Promise.reject(
        new Error(
          `Blocked request to "${host}": the local validation workflow only talks to loopback addresses.`,
        ),
      );
    }
    return original.call(this, input, init);
  };
  target.__folioneLocalFetchGuard = true;
  return () => {
    target.fetch = original;
    delete target.__folioneLocalFetchGuard;
  };
}
