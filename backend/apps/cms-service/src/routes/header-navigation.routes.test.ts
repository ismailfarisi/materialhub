import { describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

// Build a minimal in-process Elysia app that mirrors the navigationRoutes
// handler without pulling in the container (which would require a live DB).
function buildTestApp() {
  const mockResolve = mock(async (_locale: string) => ({
    tabs: [],
    version: 0,
    generated_at: new Date().toISOString(),
  }));

  const mockController = { resolve: mockResolve } as any;

  return new Elysia().decorate("headerNavController", mockController).get(
    "/navigation/header",
    async ({ query, headerNavController, set }: any) => {
      const data = await headerNavController.resolve(query.locale ?? "en");
      set.headers["cache-control"] = "public, max-age=900, stale-while-revalidate=3600";
      set.headers["surrogate-key"] = `header-nav header-nav-${query.locale ?? "en"}`;
      set.headers.vary = "Accept-Language";
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        locale: t.Optional(t.String()),
      }),
    },
  );
}

describe("GET /navigation/header", () => {
  it("returns 200 + cache headers + empty tabs when nothing published", async () => {
    const testApp = buildTestApp();
    const res = await testApp.handle(new Request("http://localhost/navigation/header?locale=en"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/public, max-age=900/);
    expect(res.headers.get("surrogate-key")).toBe("header-nav header-nav-en");
    const body = (await res.json()) as { data: { tabs: unknown[] } };
    expect(body.data.tabs).toEqual([]);
  });

  it("defaults locale to en when not provided", async () => {
    const testApp = buildTestApp();
    const res = await testApp.handle(new Request("http://localhost/navigation/header"));
    expect(res.status).toBe(200);
    expect(res.headers.get("surrogate-key")).toBe("header-nav header-nav-en");
  });

  it("passes the locale to the controller", async () => {
    const mockResolve = mock(async (_locale: string) => ({
      tabs: [],
      version: 0,
      generated_at: new Date().toISOString(),
    }));
    const testApp = new Elysia()
      .decorate("headerNavController", { resolve: mockResolve } as any)
      .get(
        "/navigation/header",
        async ({ query, headerNavController, set }: any) => {
          const data = await headerNavController.resolve(query.locale ?? "en");
          set.headers["cache-control"] = "public, max-age=900, stale-while-revalidate=3600";
          set.headers["surrogate-key"] = `header-nav header-nav-${query.locale ?? "en"}`;
          set.headers.vary = "Accept-Language";
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { query: t.Object({ locale: t.Optional(t.String()) }) },
      );

    await testApp.handle(new Request("http://localhost/navigation/header?locale=ar"));
    expect(mockResolve).toHaveBeenCalledWith("ar");
  });
});
