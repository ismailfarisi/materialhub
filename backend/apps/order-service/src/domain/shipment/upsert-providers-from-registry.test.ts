import { describe, expect, it, mock } from "bun:test";
import { MockShippingProviderAdapter } from "./mock-shipping-provider.adapter.ts";
import { ShippingProviderRegistry } from "./shipping-provider-adapter.ts";
import { upsertProvidersFromRegistry } from "./upsert-providers-from-registry.ts";

// biome-ignore lint/suspicious/noExplicitAny: test mocks require any
function makeRepo(existingRows: any[] = []) {
  return {
    findOne: mock(
      // biome-ignore lint/suspicious/noExplicitAny: test mock opts type
      async (opts: any) => existingRows.find((r) => r.code === opts?.where?.code) ?? null,
    ),
    save: mock(
      // biome-ignore lint/suspicious/noExplicitAny: test mock row type
      async (row: any) => {
        const idx = existingRows.findIndex((r) => r.code === row.code);
        if (idx >= 0) {
          existingRows[idx] = { ...existingRows[idx], ...row };
          return existingRows[idx];
        }
        existingRows.push(row);
        return row;
      },
    ),
  };
}

describe("upsertProvidersFromRegistry", () => {
  it("inserts a fresh row when provider does not exist (is_active=false)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test row array
    const rows: any[] = [];
    const repo = makeRepo(rows);
    const registry = new ShippingProviderRegistry();
    registry.register(new MockShippingProviderAdapter());
    // biome-ignore lint/suspicious/noExplicitAny: test repo mock
    await upsertProvidersFromRegistry(registry, repo as any);
    expect(rows.length).toBe(1);
    expect(rows[0].code).toBe("mock");
    expect(rows[0].is_active).toBe(false);
    expect(rows[0].display_name).toBe("Mock Provider");
    expect(rows[0].credential_schema).toBeDefined();
  });

  it("refreshes credential_schema but preserves admin-owned fields", async () => {
    const existing = [
      {
        code: "mock",
        display_name: "Admin Renamed Mock",
        is_active: true,
        sort_order: 7,
        supported_regions: ["AE"],
        webhook_secret_encrypted: "secret-cipher",
        credential_schema: { stale: true },
      },
    ];
    const repo = makeRepo(existing);
    const registry = new ShippingProviderRegistry();
    registry.register(new MockShippingProviderAdapter());
    // biome-ignore lint/suspicious/noExplicitAny: test repo mock
    await upsertProvidersFromRegistry(registry, repo as any);
    const row = existing[0]!;
    expect(row.display_name).toBe("Admin Renamed Mock");
    expect(row.is_active).toBe(true);
    expect(row.sort_order).toBe(7);
    expect(row.supported_regions).toEqual(["AE"]);
    expect(row.webhook_secret_encrypted).toBe("secret-cipher");
    expect(row.credential_schema).not.toEqual({ stale: true });
  });
});
