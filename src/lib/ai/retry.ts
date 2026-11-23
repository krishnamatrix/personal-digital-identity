import "server-only";

/**
 * AI providers (Gemini especially) answer 503 "overloaded" or 429 "slow down" in busy
 * moments; a second try a second later usually works. Only temporary failures are retried:
 * a bad request, a bad key or a timeout fails at once (a timeout already waited long).
 */
export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type RetryOptions = {
  /** Total tries, including the first. */
  attempts?: number;
  /** Waits before the 2nd, 3rd, ... try (ms); jittered by up to 30%. */
  delays?: number[];
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds or an HTTP date, capped so a visitor is never kept waiting long. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 8000) : null;
}

/**
 * `fetch` with retries for temporary failures. `init` is re-created per try (a fresh
 * timeout signal each time). Returns the last response, which may still be an error:
 * the caller decides what a non-OK status means.
 */
export async function fetchWithRetry(
  url: string,
  init: () => RequestInit,
  { attempts = 3, delays = [1000, 2500], sleep = wait }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init());
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (timedOut || attempt >= attempts) throw error;
      await sleep(jitter(delays[attempt - 1] ?? delays.at(-1) ?? 1000));
      continue;
    }
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= attempts)
      return response;
    const delay =
      retryAfterMs(response) ??
      jitter(delays[attempt - 1] ?? delays.at(-1) ?? 1000);
    // Free the connection before trying again.
    await response.body?.cancel().catch(() => undefined);
    await sleep(delay);
  }
}

function jitter(ms: number): number {
  return Math.round(ms * (1 + Math.random() * 0.3));
}

/**
 * Tries `urls` in order (a model, then its fallback). Moves on only when a URL is still
 * failing temporarily after its retries; a timeout or a real answer stops there.
 */
export async function fetchWithFallback(
  urls: string[],
  init: () => RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  for (let i = 0; ; i++) {
    const last = i >= urls.length - 1;
    // With a fallback waiting, give the first model fewer tries.
    const tries = last ? options.attempts : Math.min(options.attempts ?? 3, 2);
    try {
      const response = await fetchWithRetry(urls[i], init, {
        ...options,
        attempts: tries,
      });
      if (last || !RETRYABLE_STATUSES.has(response.status)) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (last || timedOut) throw error;
    }
  }
}
