import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import { internalServiceAuth } from "./internal-service-auth.ts";

const SECRET = "test-secret";
process.env.INTERNAL_SERVICE_SECRET = SECRET;

const app = new Elysia().use(internalServiceAuth).get("/internal/hello", () => "ok");

describe("internalServiceAuth", () => {
  it("rejects with 401 when header missing", async () => {
    const res = await app.handle(new Request("http://localhost/internal/hello"));
    expect(res.status).toBe(401);
  });

  it("rejects with 401 on bad token", async () => {
    const res = await app.handle(
      new Request("http://localhost/internal/hello", {
        headers: { authorization: "Bearer junk" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a valid signed token with iss=integration-service", async () => {
    const token = jwt.sign({ iss: "integration-service" }, SECRET, {
      expiresIn: "1m",
    });
    const res = await app.handle(
      new Request("http://localhost/internal/hello", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("accepts a valid signed token with iss=booking-service", async () => {
    const token = jwt.sign({ iss: "booking-service" }, SECRET, {
      expiresIn: "1m",
    });
    const res = await app.handle(
      new Request("http://localhost/internal/hello", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects expired token", async () => {
    const token = jwt.sign({ iss: "integration-service" }, SECRET, {
      expiresIn: "-1s",
    });
    const res = await app.handle(
      new Request("http://localhost/internal/hello", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(401);
  });
});
