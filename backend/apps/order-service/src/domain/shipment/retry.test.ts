import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchWithRetry } from "./retry.ts";

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("fetchWithRetry", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the first successful response without retrying", async () => {
    const fetchMock = mock(async () => okResponse());
    globalThis.fetch = fetchMock as any;
    const res = await fetchWithRetry("https://x.test", {}, { sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries retryable statuses with exponential backoff and succeeds", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls++;
      return calls < 3 ? new Response("late", { status: 504 }) : okResponse();
    });
    globalThis.fetch = fetchMock as any;
    const delays: number[] = [];
    const res = await fetchWithRetry(
      "https://x.test",
      {},
      {
        attempts: 3,
        baseDelayMs: 100,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it("returns the last retryable response once attempts are exhausted", async () => {
    const fetchMock = mock(async () => new Response("late", { status: 504 }));
    globalThis.fetch = fetchMock as any;
    const res = await fetchWithRetry(
      "https://x.test",
      {},
      { attempts: 3, baseDelayMs: 0, sleep: async () => {} },
    );
    expect(res.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable statuses", async () => {
    const fetchMock = mock(async () => new Response("bad", { status: 400 }));
    globalThis.fetch = fetchMock as any;
    const res = await fetchWithRetry(
      "https://x.test",
      {},
      { attempts: 3, baseDelayMs: 0, sleep: async () => {} },
    );
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors and succeeds", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return okResponse();
    });
    globalThis.fetch = fetchMock as any;
    const res = await fetchWithRetry(
      "https://x.test",
      {},
      { attempts: 3, baseDelayMs: 0, sleep: async () => {} },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows the network error once attempts are exhausted", async () => {
    const fetchMock = mock(async () => {
      throw new Error("ECONNRESET");
    });
    globalThis.fetch = fetchMock as any;
    await expect(
      fetchWithRetry("https://x.test", {}, { attempts: 3, baseDelayMs: 0, sleep: async () => {} }),
    ).rejects.toThrow("ECONNRESET");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls++;
      return calls < 4 ? new Response("late", { status: 503 }) : okResponse();
    });
    globalThis.fetch = fetchMock as any;
    const delays: number[] = [];
    await fetchWithRetry(
      "https://x.test",
      {},
      {
        attempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(delays).toEqual([1000, 1500, 1500]);
  });
});
