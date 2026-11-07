import { describe, expect, mock, test } from "bun:test";
import { revalidateStorefrontTags } from "./storefront-revalidate.ts";

const env = { WEB_REVALIDATE_URL: "https://shop.materialhub.test/", REVALIDATE_SECRET: "s3cret" };

describe("revalidateStorefrontTags", () => {
  test("POSTs the de-duplicated tags with the shared secret", async () => {
    const fetchImpl = mock(async () => new Response("{}", { status: 200 }));
    const ok = await revalidateStorefrontTags(["cms-page:about", "cms-pages", "cms-pages", null], {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shop.materialhub.test/api/revalidate");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-revalidate-secret"]).toBe("s3cret");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["cms-page:about", "cms-pages"] });
  });

  test("is a no-op when not configured", async () => {
    const fetchImpl = mock(async () => new Response("{}"));
    expect(
      await revalidateStorefrontTags(["categories"], {
        env: { WEB_REVALIDATE_URL: "https://shop.materialhub.test" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("never throws when the storefront is down or refuses", async () => {
    const down = mock(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(
      await revalidateStorefrontTags(["categories"], {
        env,
        fetchImpl: down as unknown as typeof fetch,
      }),
    ).toBe(false);
    const refused = mock(async () => new Response("{}", { status: 401 }));
    expect(
      await revalidateStorefrontTags(["categories"], {
        env,
        fetchImpl: refused as unknown as typeof fetch,
      }),
    ).toBe(false);
  });
});
