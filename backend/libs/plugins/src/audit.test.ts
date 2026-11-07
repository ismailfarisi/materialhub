import { describe, expect, test } from "bun:test";
import { buildAuditEntry, clientIpFrom, redactSecrets, responseEntityId } from "./audit.ts";

const ID = "0b8f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e6f";
const admin = { id: "1c9f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e70", role: "admin" };

function req(method: string, path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { method, headers });
}

describe("buildAuditEntry", () => {
  test("a create takes the new entity's id from the response", () => {
    const entry = buildAuditEntry({
      request: req("POST", "/admin/categories"),
      audit: {},
      user: admin,
      response: { statusCode: 201, data: { id: ID, name: "Greyboard" } },
    });
    expect(entry?.action).toBe("categories.create");
    expect(entry?.entity_type).toBe("categories");
    expect(entry?.entity_id).toBe(ID);
    expect(entry?.actor_id).toBe(admin.id);
  });

  test("path ids win over the response and GETs are skipped", () => {
    expect(
      buildAuditEntry({ request: req("PUT", `/admin/coupons/${ID}`), audit: {}, user: admin })
        ?.entity_id,
    ).toBe(ID);
    expect(
      buildAuditEntry({ request: req("GET", "/admin/coupons"), audit: {}, user: admin }),
    ).toBeNull();
  });

  test("reads the client IP from X-Forwarded-For, never the 'unknown' placeholder", () => {
    const entry = buildAuditEntry({
      request: req("DELETE", `/admin/coupons/${ID}`, {
        "x-forwarded-for": "203.0.113.9, 10.0.0.2",
      }),
      audit: {},
      user: admin,
    });
    expect(entry?.ip_address).toBe("203.0.113.9");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "unknown" }))).toBeNull();
  });

  test("redacts secrets in changes and metadata", () => {
    const entry = buildAuditEntry({
      request: req("PUT", "/admin/sales-channels/google/credentials"),
      audit: {
        changes: { api_key: { old: "a", new: "b" }, enabled: { old: false, new: true } },
        metadata: { fields: ["merchant_id"], credentials: { client_secret: "x" } },
      },
      user: admin,
    });
    expect(entry?.changes).toEqual({
      api_key: "[redacted]",
      enabled: { old: false, new: true },
    } as any);
    expect(entry?.metadata).toEqual({ fields: ["merchant_id"], credentials: "[redacted]" });
  });
});

describe("helpers", () => {
  test("responseEntityId accepts envelope or bare ids", () => {
    expect(responseEntityId({ data: { id: ID } })).toBe(ID);
    expect(responseEntityId({ id: ID })).toBe(ID);
    expect(responseEntityId({ data: { id: "x" } })).toBeNull();
    expect(responseEntityId(undefined)).toBeNull();
  });
  test("redactSecrets walks arrays and nested objects", () => {
    expect(redactSecrets([{ password: "p", note: "ok" }])).toEqual([
      { password: "[redacted]", note: "ok" },
    ]);
  });
});

describe("natural-key entities", () => {
  test("a non-uuid entity_id moves to metadata.entity_key instead of failing the insert", () => {
    const entry = buildAuditEntry({
      request: req("PUT", "/settings/sample_shipping_fils"),
      audit: {
        action: "setting.update",
        entity_type: "site_setting",
        entity_id: "sample_shipping_fils",
      },
      user: admin,
    });
    expect(entry?.entity_id).toBeUndefined();
    expect(entry?.metadata).toEqual({ entity_key: "sample_shipping_fils" });
  });
});
