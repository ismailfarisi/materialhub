import { describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for vendor.service.ts — Phase 3a membership changes.
 *
 * Covers:
 *   - transition() approve flow: creates vendor_members owner row, bumps token_version,
 *     does NOT write users.role = 'vendor'.
 *   - createByAdmin() flow: creates user with role='customer', inserts vendor_members owner row.
 *
 * Uses a stub-via-Object.defineProperty pattern,
 * plus mock.module for @materialhub/database and @materialhub/guards (module-level imports).
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const VENDOR_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";
const APPLICANT_EMAIL = "applicant@example.com";

// ── Shared mocks (captured per test via reset) ─────────────────────────────────

const appDataSourceQueryCalls: Array<{ sql: string; params: any[] }> = [];
const bumpTokenVersionCalls: string[] = [];

const bumpTokenVersion = mock(async (userId: string) => {
  bumpTokenVersionCalls.push(userId);
  return 2;
});

// We mock @materialhub/database so we can control AppDataSource.query and getRepository.
// Per-test repo behaviour is set via the `currentRepoOverrides` map.
const currentRepoOverrides: Map<string, any> = new Map();

// Spread the real modules so sibling test files (e.g. vendor-follow.service.test.ts)
// can still import entities/guards/HttpError that this test doesn't touch. Bun's
// mock.module applies process-wide, so a partial mock here poisons every test
// that runs after — and an HttpError stub with a different shape (status vs.
// statusCode) silently breaks unrelated assertions.
const realDb = await import("@materialhub/database");
const realGuards = await import("@materialhub/guards");
const realPlugins = await import("@materialhub/plugins");
const realUtils = await import("@materialhub/utils");

mock.module("@materialhub/database", () => ({
  ...realDb,
  AppDataSource: {
    getRepository: (entity: any) => {
      const name = typeof entity === "function" ? entity.name : String(entity);
      return currentRepoOverrides.get(name) ?? {};
    },
    query: async (sql: string, params: any[]) => {
      appDataSourceQueryCalls.push({ sql, params });
      // Phase 3b: approve() runs an UPDATE ... RETURNING user_id on
      // vendor_members.owner. Tests that exercise approve() expect this
      // row to exist — return USER_ID by default. Tests that want to test
      // the missing-row branch override appDataSourceQueryReturns below.
      if (appDataSourceQueryReturns.size > 0) {
        for (const [pattern, rows] of appDataSourceQueryReturns) {
          if (sql.includes(pattern)) return rows;
        }
      }
      if (sql.includes("UPDATE vendor_members") && sql.includes("RETURNING user_id")) {
        return [{ user_id: USER_ID }];
      }
      return [];
    },
    transaction: async (cb: (manager: any) => Promise<any>) => {
      // Provide a basic manager that delegates to currentRepoOverrides
      const manager = {
        create: (_Entity: any, data: any) => data,
        save: async (_Entity: any, data: any) => {
          if (!data || typeof data !== "object") return data;
          // Attach a generated id if none present
          return { id: "generated-id", ...data };
        },
        findOne: async () => null,
        query: async (sql: string, params: any[]) => {
          appDataSourceQueryCalls.push({ sql, params });
          return [];
        },
      };
      return cb(manager);
    },
  },
}));

// Per-test SQL-pattern → return-rows overrides. Cleared in clearCalls().
const appDataSourceQueryReturns = new Map<string, any[]>();

mock.module("@materialhub/guards", () => ({
  ...realGuards,
  bumpTokenVersion,
}));

mock.module("@materialhub/plugins", () => ({
  ...realPlugins,
}));

mock.module("@materialhub/utils", () => ({
  ...realUtils,
  generateSlug: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

// Dynamic import AFTER mock.module calls
const { VendorService } = await import("./vendor.service.ts");

// ── Helpers ────────────────────────────────────────────────────────────────────

function clearCalls() {
  appDataSourceQueryCalls.length = 0;
  bumpTokenVersionCalls.length = 0;
  bumpTokenVersion.mockClear();
  appDataSourceQueryReturns.clear();
}

function makeService(overrides: {
  vendorRepo?: any;
  userRepo?: any;
  warehouseRepo?: any;
  documentRepo?: any;
  translationRepo?: any;
}): InstanceType<typeof VendorService> {
  const service = new VendorService(null as any);
  for (const [key, value] of Object.entries(overrides)) {
    if (value) {
      Object.defineProperty(service, key, {
        get: () => value,
        configurable: true,
      });
    }
  }
  return service;
}

// ── transition() — approve flow ────────────────────────────────────────────────

describe("VendorService.transition — approve", () => {
  test("activates pending vendor_members owner row on approval", async () => {
    clearCalls();

    const vendor: any = {
      id: VENDOR_ID,
      status: "under_review",
      address: { street: "123 Main", city: "Dubai", state: "Dubai" },
    };

    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };
    const userRepo = { findOne: mock(async () => null) };
    const warehouseRepo = {
      findOne: mock(async () => null),
      create: mock((data: any) => data),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo, userRepo, warehouseRepo });
    await service.transition(VENDOR_ID, "approved");

    // Phase 3b: approve() does an UPDATE … RETURNING user_id (the row was
    // already inserted in apply() with status='pending').
    const memberUpdate = appDataSourceQueryCalls.find(
      (c) => c.sql.includes("UPDATE vendor_members") && c.sql.includes("RETURNING user_id"),
    );
    expect(memberUpdate).toBeDefined();
    expect(memberUpdate!.sql).toContain("SET status = 'active'");
    expect(memberUpdate!.params[0]).toBe(VENDOR_ID);
  });

  test("bumps applicant token_version after approval", async () => {
    clearCalls();

    const vendor: any = {
      id: VENDOR_ID,
      user_id: USER_ID,
      status: "under_review",
      address: {},
    };
    const applicant: any = { id: USER_ID, email: APPLICANT_EMAIL, role: "customer" };

    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };
    const userRepo = { findOne: mock(async () => applicant) };
    const warehouseRepo = {
      findOne: mock(async () => null),
      create: mock((d: any) => d),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo, userRepo, warehouseRepo });
    await service.transition(VENDOR_ID, "approved");

    expect(bumpTokenVersion).toHaveBeenCalledTimes(1);
    expect(bumpTokenVersionCalls[0]).toBe(USER_ID);
  });

  test("does NOT write users.role — applicant role stays 'customer'", async () => {
    clearCalls();

    const vendor: any = {
      id: VENDOR_ID,
      user_id: USER_ID,
      status: "under_review",
      address: {},
    };
    const applicant: any = { id: USER_ID, email: APPLICANT_EMAIL, role: "customer" };

    const userRepo = {
      findOne: mock(async () => applicant),
      update: mock(async () => ({ affected: 1 })),
    };
    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };
    const warehouseRepo = {
      findOne: mock(async () => null),
      create: mock((d: any) => d),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo, userRepo, warehouseRepo });
    await service.transition(VENDOR_ID, "approved");

    // userRepo.update should never be called (role must not be changed)
    expect(userRepo.update).not.toHaveBeenCalled();
    // Applicant object role was not mutated
    expect(applicant.role).toBe("customer");
  });

  test("re-approval idempotent — UPDATE matches both pending and active rows", async () => {
    clearCalls();

    const vendor: any = {
      id: VENDOR_ID,
      // Simulate re-approval from suspended state (valid transition).
      status: "suspended",
      address: {},
    };

    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };
    const userRepo = { findOne: mock(async () => null) };
    const warehouseRepo = {
      findOne: mock(async () => ({ id: "existing-wh" })), // warehouse already exists
      create: mock((d: any) => d),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo, userRepo, warehouseRepo });
    await service.transition(VENDOR_ID, "approved");

    // Phase 3b: approve() runs a single UPDATE that matches either status.
    // No INSERT (rows are created in apply()).
    const memberInserts = appDataSourceQueryCalls.filter((c) =>
      c.sql.includes("INSERT INTO vendor_members"),
    );
    expect(memberInserts).toHaveLength(0);

    const memberUpdate = appDataSourceQueryCalls.find(
      (c) => c.sql.includes("UPDATE vendor_members") && c.sql.includes("RETURNING user_id"),
    );
    expect(memberUpdate).toBeDefined();
    expect(memberUpdate!.sql).toContain("status IN ('pending', 'active')");
  });

  test("throws OWNER_MEMBERSHIP_MISSING when no pending/active owner row exists", async () => {
    clearCalls();
    // Override the UPDATE...RETURNING to return no rows.
    appDataSourceQueryReturns.set("UPDATE vendor_members", []);

    const vendor: any = {
      id: VENDOR_ID,
      status: "under_review",
      address: {},
    };

    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };
    const userRepo = { findOne: mock(async () => null) };
    const warehouseRepo = {
      findOne: mock(async () => null),
      create: mock((d: any) => d),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo, userRepo, warehouseRepo });

    await expect(service.transition(VENDOR_ID, "approved")).rejects.toThrow(
      "No owner membership found for this vendor",
    );
    expect(bumpTokenVersion).not.toHaveBeenCalled();
  });
});

// ── createByAdmin() ────────────────────────────────────────────────────────────

describe("VendorService.usePlatformShipping", () => {
  test("clears vendor shipping override and enables auto shipment booking", async () => {
    clearCalls();

    const vendor: any = {
      id: VENDOR_ID,
      default_shipping_account_id: "vendor-carrier-account-id",
      auto_create_shipment: false,
    };

    const vendorRepo = {
      findOne: mock(async () => vendor),
      save: mock(async (v: any) => v),
    };

    const service = makeService({ vendorRepo });
    const updated = await service.usePlatformShipping(VENDOR_ID);

    expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { id: VENDOR_ID } });
    expect(vendorRepo.save).toHaveBeenCalledTimes(1);
    expect(updated.default_shipping_account_id).toBeNull();
    expect(updated.auto_create_shipment).toBe(true);
  });
});

describe("VendorService.createByAdmin", () => {
  const adminId = "admin-001";
  const createAdminPayload = () => ({
    user: {
      firstName: "Test",
      lastName: "Vendor",
      email: "newvendor@example.com",
      phone: "+971501234567",
      password: "Secret123!",
    },
    vendor: {
      name: "Test Brand",
      business_name: "Test Brand LLC",
      business_type: "general",
      contact_email: "brand@example.com",
      contact_phone: "+97142000000",
      address: { street: "1 Sheikh Zayed Rd", city: "Dubai", emirate: "Dubai" },
      social_links: {},
    },
  });

  test("creates user with role='customer' (not 'vendor')", async () => {
    clearCalls();

    const userCreationArgs: any[] = [];

    // Override AppDataSource.transaction on the module-level mock to capture user creation
    const { AppDataSource } = await import("@materialhub/database");
    const origTransaction = (AppDataSource as any).transaction;
    (AppDataSource as any).transaction = async (cb: (m: any) => Promise<any>) => {
      const createdObjects: any[] = [];
      const manager = {
        create: (_Entity: any, data: any) => {
          userCreationArgs.push(data);
          return { id: "generated-id", ...data };
        },
        save: async (_EntityOrObj: any, dataOrUndefined?: any) => {
          const data = dataOrUndefined ?? _EntityOrObj;
          return { id: "generated-id", ...data };
        },
        query: async (sql: string, params: any[]) => {
          appDataSourceQueryCalls.push({ sql, params });
          return [];
        },
      };
      const result = await cb(manager);
      createdObjects.push(result);
      return result;
    };

    // Also stub userRepo pre-check (findOne for email uniqueness)
    const userRepo = { findOne: mock(async () => null) };
    const vendorRepo = { findOne: mock(async () => null) };

    const service = makeService({ userRepo, vendorRepo });
    try {
      await service.createByAdmin(adminId, createAdminPayload());

      // The first object created in manager.create should be the user
      const userArg = userCreationArgs.find(
        (a) => a.role === "customer" || a.role === "vendor" || a.email !== undefined,
      );
      expect(userArg).toBeDefined();
      expect(userArg.role).toBe("customer");
      expect(userArg.role).not.toBe("vendor");
    } finally {
      (AppDataSource as any).transaction = origTransaction;
    }
  });

  test("inserts vendor_members owner row for admin-created vendor", async () => {
    clearCalls();

    const { AppDataSource } = await import("@materialhub/database");
    const origTransaction = (AppDataSource as any).transaction;

    let capturedUserId: string | undefined;
    let capturedVendorId: string | undefined;

    (AppDataSource as any).transaction = async (cb: (m: any) => Promise<any>) => {
      let userSaved = false;
      const manager = {
        create: (_Entity: any, data: any) => ({ id: "gen-id", ...data }),
        save: async (_EntityOrObj: any, dataOrUndefined?: any) => {
          const data = dataOrUndefined ?? _EntityOrObj;
          const obj = { id: "gen-id", ...data };
          if (!userSaved && obj.email) {
            // This is the user
            userSaved = true;
            capturedUserId = obj.id;
          } else if (obj.name && obj.slug) {
            // This is the vendor
            capturedVendorId = obj.id;
          }
          return obj;
        },
        query: async (sql: string, params: any[]) => {
          appDataSourceQueryCalls.push({ sql, params });
          return [];
        },
      };
      return cb(manager);
    };

    const userRepo = { findOne: mock(async () => null) };
    const vendorRepo = { findOne: mock(async () => null) };

    const service = makeService({ userRepo, vendorRepo });
    try {
      await service.createByAdmin(adminId, createAdminPayload());

      const memberInsert = appDataSourceQueryCalls.find((c) =>
        c.sql.includes("INSERT INTO vendor_members"),
      );
      expect(memberInsert).toBeDefined();
      // role must be 'owner' and status 'active'
      expect(memberInsert!.sql).toContain("'owner'");
      expect(memberInsert!.sql).toContain("'active'");
      // email must be passed in lowercase
      const payload = createAdminPayload();
      expect(memberInsert!.params[2]).toBe(payload.user.email.toLowerCase());
    } finally {
      (AppDataSource as any).transaction = origTransaction;
    }
  });

  test("bumps token_version for admin-created vendor user", async () => {
    clearCalls();

    const { AppDataSource } = await import("@materialhub/database");
    const origTransaction = (AppDataSource as any).transaction;

    (AppDataSource as any).transaction = async (cb: (m: any) => Promise<any>) => {
      const manager = {
        create: (_Entity: any, data: any) => ({ id: "gen-id", ...data }),
        save: async (_EntityOrObj: any, dataOrUndefined?: any) => {
          const data = dataOrUndefined ?? _EntityOrObj;
          return { id: "gen-id", ...data };
        },
        query: async (sql: string, params: any[]) => {
          appDataSourceQueryCalls.push({ sql, params });
          return [];
        },
      };
      return cb(manager);
    };

    const userRepo = { findOne: mock(async () => null) };
    const vendorRepo = { findOne: mock(async () => null) };

    const service = makeService({ userRepo, vendorRepo });
    try {
      await service.createByAdmin(adminId, createAdminPayload());

      expect(bumpTokenVersion).toHaveBeenCalledTimes(1);
    } finally {
      (AppDataSource as any).transaction = origTransaction;
    }
  });
});

// ── apply() — documents ───────────────────────────────────────────────────────

describe("VendorService.apply — documents", () => {
  const baseData = {
    userId: USER_ID,
    businessName: "E2E fix Gulf Board Supplies",
    businessEmail: "sales@gulfboard.example",
    businessPhone: "+971501234567",
    businessAddress: {
      street: "Al Quoz 3",
      city: "Dubai",
      state: "Dubai",
      country: "AE",
      postalCode: "",
    },
  };

  function applyService() {
    return makeService({
      vendorRepo: { findOne: mock(async () => null) },
      userRepo: { findOne: mock(async () => ({ id: USER_ID, email: APPLICANT_EMAIL })) },
    });
  }

  test("saves each document with its s3 key and file name (no 500 on mapped input)", async () => {
    clearCalls();
    const vendor = await applyService().apply({
      ...baseData,
      documents: [
        {
          type: "trade_license",
          s3Key: `private/business/${USER_ID}/licence.pdf`,
          fileName: "licence.pdf",
        },
      ],
    });
    expect(vendor.id).toBe("generated-id");
    expect((vendor as any).status).toBe("pending");
  });

  test("rejects an unknown document type with 400 instead of a DB enum error", async () => {
    clearCalls();
    await expect(
      applyService().apply({
        ...baseData,
        documents: [{ type: "selfie", s3Key: "k", fileName: "k" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_DOCUMENT" });
  });

  test("rejects a document key outside the applicant's own upload prefix", async () => {
    clearCalls();
    await expect(
      applyService().apply({
        ...baseData,
        documents: [
          {
            type: "trade_license",
            s3Key: "private/business/someone-else/licence.pdf",
            fileName: "licence.pdf",
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_DOCUMENT_KEY" });
  });
});

describe("VendorService.transition — approve with the real pg UPDATE result shape", () => {
  test("reads the owner from [rows, count] (TypeORM UPDATE ... RETURNING)", async () => {
    clearCalls();
    appDataSourceQueryReturns.set("RETURNING user_id", [[{ user_id: USER_ID }], 1] as any);
    const vendor: any = { id: VENDOR_ID, status: "under_review", address: {} };
    const service = makeService({
      vendorRepo: { findOne: mock(async () => vendor), save: mock(async (v: any) => v) },
      warehouseRepo: {
        findOne: mock(async () => ({ id: "wh" })),
        create: mock((d: any) => d),
        save: mock(async (v: any) => v),
      },
    });
    const saved: any = await service.transition(VENDOR_ID, "approved");
    expect(saved.status).toBe("approved");
    expect(bumpTokenVersionCalls).toEqual([USER_ID]);
  });
});
