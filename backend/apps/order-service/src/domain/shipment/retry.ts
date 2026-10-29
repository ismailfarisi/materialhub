export interface FetchRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

// Transient statuses only. 5xx like 500 are excluded on purpose: carrier APIs
// surface validation problems as 500s, and replaying those can double-book.
export const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, init);
      const isLastAttempt = attempt === attempts - 1;
      if (RETRYABLE_STATUS_CODES.has(res.status) && !isLastAttempt) continue;
      return res;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
