import { describe, expect, it } from "bun:test";
import { app } from "./app.ts";

describe("reels-service health", () => {
  it("GET /health returns ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body).toEqual({ status: "ok", service: "reels" });
  });
});
