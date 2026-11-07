import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { errorHandler } from "./index.ts";

describe("errorHandler: storage not configured", () => {
  it("maps AWS CredentialsProviderError to 503 STORAGE_NOT_CONFIGURED", async () => {
    const app = new Elysia().use(errorHandler).get("/upload", () => {
      const e = new Error("Could not load credentials from any providers");
      e.name = "CredentialsProviderError";
      throw e;
    });
    const res = await app.handle(new Request("http://localhost/upload"));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("STORAGE_NOT_CONFIGURED");
  });
});
