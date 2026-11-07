/**
 * In-process service dispatch for the monolith.
 *
 * Every backend module (auth, product, order, vendor, notification, cms,
 * integration) is still its own Elysia app with its own plugins, routes and
 * error handling. The monolith (`backend/apps/api`) runs them all in one
 * process and registers each app's `handle()` under the origin callers already
 * use for it (`config.serviceUrl.*`). `serviceFetch` then resolves a request to
 * one of those origins with a direct in-process call instead of a network
 * round-trip; any other URL goes to the global `fetch` untouched.
 *
 * Use `serviceFetch` (not `fetch`) for every module-to-module HTTP call.
 */

export type ServiceHandler = (request: Request) => Response | Promise<Response>;

const handlers = new Map<string, ServiceHandler>();

function originOf(url: string | URL): string | null {
  try {
    return new URL(String(url)).origin;
  } catch {
    return null;
  }
}

/** Route requests for `origin` (e.g. "http://localhost:3002") to `handler`. */
export function registerInProcessService(origin: string, handler: ServiceHandler): void {
  const key = originOf(origin);
  if (!key) throw new Error(`registerInProcessService: invalid origin "${origin}"`);
  handlers.set(key, handler);
}

/** Origins currently served in-process (for boot logs and tests). */
export function inProcessOrigins(): string[] {
  return [...handlers.keys()];
}

/** Test helper: forget every registered handler. */
export function clearInProcessServices(): void {
  handlers.clear();
}

/**
 * Drop-in replacement for `fetch` for module-to-module calls. Honors
 * `init.signal` (timeouts / aborts) for in-process calls too.
 */
export async function serviceFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const origin = originOf(input);
  const handler = origin ? handlers.get(origin) : undefined;
  if (!handler) return globalThis.fetch(input, init);

  const request = new Request(String(input), init);
  const signal = init?.signal;
  if (!signal) return handler(request);
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => handler(request))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
