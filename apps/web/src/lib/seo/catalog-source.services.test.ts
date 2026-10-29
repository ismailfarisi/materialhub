import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServices } from "./catalog-source";

// fetchJson (shared by every getX() in catalog-source.ts, including
// getServices) issues requests via axios.get, not global fetch — see
// catalog-source.test.ts for the established convention. A vi.stubGlobal
// on "fetch" would not intercept these calls; it would let them fall
// through to a real network request against API_URL.
vi.mock("axios");

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function stubResponse(payload: unknown) {
  mockedGet.mockResolvedValueOnce({ data: payload });
}

describe("getServices", () => {
  it("maps published services to /service/:slug entries", async () => {
    stubResponse({ data: [{ slug: "balayage-o1" }, { slug: "facial-o2" }] });
    expect(await getServices()).toEqual([
      { path: "/service/balayage-o1" },
      { path: "/service/facial-o2" },
    ]);
  });

  it("returns an empty list when no services are published", async () => {
    stubResponse({ data: [] });
    expect(await getServices()).toEqual([]);
  });

  it("skips a row with no slug rather than emitting /service/undefined", async () => {
    stubResponse({ data: [{ slug: "ok" }, { name: "no slug" }] });
    expect(await getServices()).toEqual([{ path: "/service/ok" }]);
  });

  it("paginates via the page query param until total is reached", async () => {
    stubResponse({
      data: [{ slug: "balayage-o1" }, { slug: "facial-o2" }],
      total: 3,
      page: 1,
      limit: 50,
    });
    stubResponse({
      data: [{ slug: "manicure-o3" }],
      total: 3,
      page: 2,
      limit: 50,
    });

    const entries = await getServices();

    expect(entries).toEqual([
      { path: "/service/balayage-o1" },
      { path: "/service/facial-o2" },
      { path: "/service/manicure-o3" },
    ]);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet.mock.calls[0][0]).toContain("page=1");
    expect(mockedGet.mock.calls[1][0]).toContain("page=2");
  });

  it("throws instead of returning a truncated list when total exceeds the page cap", async () => {
    // Always return a full 50-item page with a total far beyond what the
    // page cap can retrieve, simulating a service catalog that outgrew the
    // safety limit.
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      slug: `service-${i}`,
    }));
    mockedGet.mockResolvedValue({
      data: { data: fullPage, total: 999999, page: 1, limit: 50 },
    });

    await expect(getServices()).rejects.toThrow(
      /sitemap upstream failed: service catalog exceeded expected size/,
    );
  });

  it("issues only one request when total fits in a single page", async () => {
    stubResponse({
      data: [{ slug: "balayage-o1" }, { slug: "facial-o2" }],
      total: 2,
      page: 1,
      limit: 50,
    });

    const entries = await getServices();

    expect(entries).toEqual([
      { path: "/service/balayage-o1" },
      { path: "/service/facial-o2" },
    ]);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
