import { describe, expect, test } from "bun:test";
import type { UserAddress } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { AddressService } from "./address.service.ts";

type Calls = {
  find: any[];
  update: any[];
  softRemove: any[];
  save: any[];
};

function makeRepo(rows: Partial<UserAddress>[]) {
  const calls: Calls = { find: [], update: [], softRemove: [], save: [] };
  const repo = {
    find: async (opts: any) => {
      calls.find.push(opts);
      return rows;
    },
    findOne: async ({ where }: any) =>
      rows.find((r) => r.id === where.id && r.user_id === where.user_id) ?? null,
    update: async (where: any, patch: any) => {
      calls.update.push({ where, patch });
    },
    save: async (entity: any) => {
      calls.save.push(entity);
      return entity;
    },
    softRemove: async (entity: any) => {
      calls.softRemove.push(entity);
      return entity;
    },
  } as unknown as Repository<UserAddress>;
  return { repo, calls };
}

const existing: Partial<UserAddress> = {
  id: "a1",
  user_id: "u1",
  label: "Home",
  city: "Dubai",
  is_default: false,
};

function verifier(result: boolean) {
  const calls: { userId: string; phone: string }[] = [];
  return {
    isVerified: async (userId: string, phone: string) => {
      calls.push({ userId, phone });
      return result;
    },
    calls,
  };
}

describe("AddressService.list", () => {
  test("scopes to the given user and orders defaults first", async () => {
    const { repo, calls } = makeRepo([existing]);
    const service = new AddressService(repo, verifier(true));

    const result = await service.list("u1");

    expect(result).toHaveLength(1);
    expect(calls.find[0].where).toEqual({ user_id: "u1" });
    expect(calls.find[0].order).toEqual({ is_default: "DESC", created_at: "DESC" });
  });
});

describe("AddressService.update", () => {
  test("applies the patch to the caller's own address", async () => {
    const { repo } = makeRepo([{ ...existing }]);
    const service = new AddressService(repo, verifier(true));

    const result = await service.update("u1", "a1", { label: "Office" });

    expect(result.label).toBe("Office");
  });

  test("unsets sibling defaults when promoting an address to default", async () => {
    const { repo, calls } = makeRepo([{ ...existing }]);
    const service = new AddressService(repo, verifier(true));

    await service.update("u1", "a1", { is_default: true });

    expect(calls.update[0].where).toEqual({ user_id: "u1", is_default: true });
    expect(calls.update[0].patch).toEqual({ is_default: false });
  });

  test("throws a 404 HttpError when the address is not found", async () => {
    const { repo } = makeRepo([]);
    const service = new AddressService(repo, verifier(true));

    const err = await service.update("u1", "missing", { label: "x" }).catch((e) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("ADDRESS_NOT_FOUND");
  });

  test("throws 404 rather than cross-user editing another user's address", async () => {
    const { repo } = makeRepo([{ ...existing, user_id: "someone-else" }]);
    const service = new AddressService(repo, verifier(true));

    const err = await service.update("u1", "a1", { label: "x" }).catch((e) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
  });
});

describe("AddressService.delete", () => {
  test("soft-removes the address", async () => {
    const { repo, calls } = makeRepo([{ ...existing }]);
    const service = new AddressService(repo, verifier(true));

    await service.delete("u1", "a1");

    expect(calls.softRemove[0].id).toBe("a1");
  });

  test("throws a 404 HttpError when the address is not found", async () => {
    const { repo } = makeRepo([]);
    const service = new AddressService(repo, verifier(true));

    const err = await service.delete("u1", "missing").catch((e) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("ADDRESS_NOT_FOUND");
  });

  test("throws 404 rather than cross-user deleting another user's address", async () => {
    const { repo, calls } = makeRepo([{ ...existing, user_id: "someone-else" }]);
    const service = new AddressService(repo, verifier(true));

    const err = await service.delete("u1", "a1").catch((e) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(calls.softRemove).toHaveLength(0);
  });
});

describe("AddressService phone verification gate", () => {
  test("create throws 403 PHONE_NOT_VERIFIED for an unverified number", async () => {
    const { repo } = makeRepo([]);
    const service = new AddressService(repo, verifier(false));
    const err = await service
      .create("u1", { phone: "+971508888888", city: "Dubai" } as any)
      .catch((e) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("PHONE_NOT_VERIFIED");
  });

  test("create succeeds and stores the normalized phone when verified", async () => {
    const { repo, calls } = makeRepo([]);
    const service = new AddressService(repo, verifier(true));
    await service.create("u1", { phone: "0501234567", city: "Dubai" } as any);
    expect(calls.save[0].phone).toBe("+971501234567");
  });

  test("create bypasses the gate when skipPhoneVerification is set (admin)", async () => {
    const { repo, calls } = makeRepo([]);
    const service = new AddressService(repo, verifier(false));
    await service.create("u1", { phone: "+971508888888", city: "Dubai" } as any, {
      skipPhoneVerification: true,
    });
    expect(calls.save).toHaveLength(1);
  });

  test("update that does not change the phone skips the gate (grandfathering)", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "+971508888888" } as any]);
    const service = new AddressService(repo, verifier(false));
    const result = await service.update("u1", "a1", { label: "Office" });
    expect(result.label).toBe("Office");
  });

  test("update to the same number in a different format skips the gate", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "+971508888888" } as any]);
    const service = new AddressService(repo, verifier(false));
    const result = await service.update("u1", "a1", { phone: "0508888888" });
    expect(result.phone).toBe("+971508888888");
  });

  test("update submitting the raw legacy-format phone unchanged skips the gate", async () => {
    // Legacy rows (saved before normalization existed) hold RAW local-format
    // phones like "0508888888". The frontend round-trips that same raw value
    // on an unrelated edit. This must NOT be gated: verifier(false) means the
    // test fails with a 403 if the comparison wrongly treats it as a change.
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "0508888888" } as any]);
    const service = new AddressService(repo, verifier(false));
    const result = await service.update("u1", "a1", { phone: "0508888888" });
    expect(result.phone).toBe("+971508888888");
  });

  test("update to a different unverified number throws 403", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "+971508888888" } as any]);
    const service = new AddressService(repo, verifier(false));
    const err = await service.update("u1", "a1", { phone: "+971507777777" }).catch((e) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("PHONE_NOT_VERIFIED");
  });

  test("update to a different number that IS verified succeeds", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "+971508888888" } as any]);
    const v = verifier(true);
    const service = new AddressService(repo, v);
    const result = await service.update("u1", "a1", { phone: "+971507777777" });
    expect(result.phone).toBe("+971507777777");
    expect(v.calls[0]).toEqual({ userId: "u1", phone: "+971507777777" });
  });

  test("update from an unnormalizable stored phone to a different number is gated (does not 400)", async () => {
    // A stored phone that cannot be normalized at all (fully malformed legacy
    // data) must degrade to "treat as changed" so the gate fires, rather than
    // throwing INVALID_PHONE for the stored side.
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "garbage" } as any]);
    const service = new AddressService(repo, verifier(false));
    const err = await service.update("u1", "a1", { phone: "+971507777777" }).catch((e) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("PHONE_NOT_VERIFIED");
  });

  test("create with a missing phone throws 400 INVALID_PHONE, not a 500", async () => {
    const { repo } = makeRepo([]);
    const service = new AddressService(repo, verifier(true));
    const err = await service.create("u1", { city: "Dubai" } as any).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_PHONE");
  });

  test("update resubmitting a stored MALFORMED phone unchanged does not gate or throw, and leaves it as-is", async () => {
    // "042223333" is a UAE landline: normalizePhoneForOtp rejects it. Legacy
    // rows predate phone validation and can legitimately hold this. The
    // customer editing an unrelated field (or round-tripping the form)
    // resubmits it byte-identically. verifier(false) means this test fails
    // with a 403 if the comparison wrongly treats it as changed; the old
    // code threw 400 INVALID_PHONE before ever reaching the change-check.
    const { repo, calls } = makeRepo([{ id: "a1", user_id: "u1", phone: "042223333" } as any]);
    const service = new AddressService(repo, verifier(false));
    const result = await service.update("u1", "a1", { phone: "042223333", label: "Office" });
    expect(result.label).toBe("Office");
    expect(result.phone).toBe("042223333");
    expect(calls.save[0].phone).toBe("042223333");
  });

  test("update changing a stored malformed phone to a valid, verified number succeeds and persists normalized", async () => {
    const { repo, calls } = makeRepo([{ id: "a1", user_id: "u1", phone: "042223333" } as any]);
    const service = new AddressService(repo, verifier(true));
    const result = await service.update("u1", "a1", { phone: "0509999999" });
    expect(result.phone).toBe("+971509999999");
    expect(calls.save[0].phone).toBe("+971509999999");
  });

  test("update changing a stored malformed phone to a valid but UNVERIFIED number throws 403", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "042223333" } as any]);
    const service = new AddressService(repo, verifier(false));
    const err = await service.update("u1", "a1", { phone: "0509999999" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("PHONE_NOT_VERIFIED");
  });

  test("update changing a stored malformed phone to another MALFORMED value throws 400 INVALID_PHONE", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "042223333" } as any]);
    const service = new AddressService(repo, verifier(true));
    const err = await service.update("u1", "a1", { phone: "042229999" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_PHONE");
  });

  test("update resubmitting the raw legacy-format phone unchanged still skips the gate (regression)", async () => {
    const { repo } = makeRepo([{ id: "a1", user_id: "u1", phone: "0508888888" } as any]);
    const service = new AddressService(repo, verifier(false));
    const result = await service.update("u1", "a1", { phone: "0508888888" });
    expect(result.phone).toBe("+971508888888");
  });
});
