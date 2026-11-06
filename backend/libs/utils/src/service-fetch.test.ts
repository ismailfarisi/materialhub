import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  clearInProcessServices,
  inProcessOrigins,
  registerInProcessService,
  serviceFetch,
} from "./service-fetch.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  clearInProcessServices();
  globalThis.fetch = realFetch;
});

describe("serviceFetch", () => {
  test("dispatches a registered origin in-process with method, headers, body and query", async () => {
    let seen: Request | null = null;
    let seenBody = "";
    registerInProcessService("http://localhost:3005", async (req) => {
      seen = req;
      seenBody = await req.text();
      return Response.json({ ok: true }, { status: 201 });
    });

    const res = await serviceFetch("http://localhost:3005/notifications/send?x=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": "s" },
      body: JSON.stringify({ user_id: "u" }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const req = seen as unknown as Request;
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/notifications/send");
    expect(new URL(req.url).search).toBe("?x=1");
    expect(req.headers.get("x-internal-secret")).toBe("s");
    expect(JSON.parse(seenBody)).toEqual({ user_id: "u" });
  });

  test("falls through to global fetch for unregistered origins", async () => {
    registerInProcessService("http://localhost:3005", () => new Response("in-process"));
    const fake = mock(async () => new Response("network"));
    globalThis.fetch = fake as unknown as typeof fetch;

    const res = await serviceFetch("https://api.example.com/x", { method: "GET" });

    expect(await res.text()).toBe("network");
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0]).toEqual(["https://api.example.com/x", { method: "GET" }] as never);
  });

  test("matches on origin only: different port is not intercepted", async () => {
    registerInProcessService("http://localhost:3005", () => new Response("in-process"));
    globalThis.fetch = mock(async () => new Response("network")) as unknown as typeof fetch;

    const res = await serviceFetch("http://localhost:3006/pages");
    expect(await res.text()).toBe("network");
  });

  test("streams a request body through (gateway proxy shape)", async () => {
    registerInProcessService(
      "http://localhost:3002",
      async (req) => new Response(await req.text()),
    );
    const incoming = new Request("http://gw/media", { method: "PUT", body: "raw-bytes" });

    const res = await serviceFetch("http://localhost:3002/media", {
      method: "PUT",
      headers: incoming.headers,
      body: incoming.body,
      duplex: "half",
    } as RequestInit);

    expect(await res.text()).toBe("raw-bytes");
  });

  test("rejects when the signal aborts before the handler resolves", async () => {
    registerInProcessService(
      "http://localhost:3003",
      () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("late")), 200)),
    );

    await expect(
      serviceFetch("http://localhost:3003/slow", { signal: AbortSignal.timeout(10) }),
    ).rejects.toBeDefined();
  });

  test("propagates handler exceptions like a network error would", async () => {
    registerInProcessService("http://localhost:3003", () => {
      throw new Error("boom");
    });
    await expect(serviceFetch("http://localhost:3003/x")).rejects.toThrow("boom");
  });

  test("normalizes origins on registration", () => {
    registerInProcessService("http://localhost:3001/", () => new Response());
    expect(inProcessOrigins()).toEqual(["http://localhost:3001"]);
    expect(() => registerInProcessService("not a url", () => new Response())).toThrow();
  });
});
