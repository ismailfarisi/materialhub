import type { Server } from "bun";

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface MockVendorServerOptions {
  respondWith?: { status: number; body?: string };
  delayMs?: number;
}

export function startMockVendorServer(opts: MockVendorServerOptions = {}): {
  server: Server<unknown>;
  url: string;
  requests: CapturedRequest[];
  stop: () => void;
} {
  const requests: CapturedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.text();
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        headers[k] = v;
      });
      requests.push({ url: req.url, method: req.method, headers, body });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return new Response(opts.respondWith?.body ?? "ok", {
        status: opts.respondWith?.status ?? 200,
      });
    },
  });
  return {
    server,
    url: `http://localhost:${server.port}`,
    requests,
    stop: () => server.stop(true),
  };
}
