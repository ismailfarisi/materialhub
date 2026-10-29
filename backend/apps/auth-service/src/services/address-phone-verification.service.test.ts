import { describe, expect, test } from "bun:test";
import type { User, UserVerifiedPhone } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { AddressPhoneVerificationService } from "./address-phone-verification.service.ts";

const provider = { sendCode: async () => {}, checkCode: async () => true };

function makeService(opts: {
  user?: Partial<User> | null;
  verified?: Partial<UserVerifiedPhone>[];
}) {
  const userRepo = {
    findOne: async () => opts.user ?? null,
  } as unknown as Repository<User>;
  const verifiedRepo = {
    findOne: async ({ where }: any) =>
      (opts.verified ?? []).find((v) => v.user_id === where.user_id && v.phone === where.phone) ??
      null,
    find: async ({ where }: any) =>
      (opts.verified ?? []).filter((v) => v.user_id === where.user_id),
  } as unknown as Repository<UserVerifiedPhone>;
  return new AddressPhoneVerificationService(provider as any, { userRepo, verifiedRepo });
}

describe("AddressPhoneVerificationService.isVerifiedBulk", () => {
  // The admin address list swapped a per-address isVerified() loop for one bulk
  // call. That is only sound if the two agree exactly, so assert it directly.
  const cases: Array<{ name: string; opts: Parameters<typeof makeService>[0]; phones: string[] }> =
    [
      {
        name: "login phone, verified rows, and unknown numbers together",
        opts: {
          user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
          // verified_at is NOT NULL in the schema, and list() sorts on it.
          verified: [{ user_id: "u1", phone: "+971509999999", verified_at: new Date() }],
        },
        phones: ["+971501234567", "0501234567", "+971509999999", "+971508888888"],
      },
      {
        name: "unverified login phone",
        opts: { user: { id: "u1", phone: "+971501234567", phone_verified_at: null } as any },
        phones: ["+971501234567"],
      },
      {
        name: "another user's verified row",
        opts: {
          user: { id: "u1", phone: null, phone_verified_at: null } as any,
          verified: [{ user_id: "u2", phone: "+971509999999", verified_at: new Date() }],
        },
        phones: ["+971509999999"],
      },
      {
        name: "malformed legacy value",
        opts: {
          user: { id: "u1", phone: "042223333", phone_verified_at: new Date() } as any,
        },
        phones: ["042223333", "not-a-phone"],
      },
    ];

  for (const c of cases) {
    test(`agrees with isVerified: ${c.name}`, async () => {
      const svc = makeService(c.opts);
      const bulk = await svc.isVerifiedBulk("u1", c.phones);
      for (const phone of c.phones) {
        const single = await svc.isVerified("u1", phone).catch(() => false);
        expect(bulk.get(phone)).toBe(single);
      }
    });
  }

  test("returns an empty map without querying when there are no phones", async () => {
    let queried = false;
    const svc = new AddressPhoneVerificationService(provider as any, {
      userRepo: {
        findOne: async () => {
          queried = true;
          return null;
        },
      } as any,
      verifiedRepo: {
        find: async () => {
          queried = true;
          return [];
        },
        findOne: async () => null,
      } as any,
    });
    const result = await svc.isVerifiedBulk("u1", []);
    expect(result.size).toBe(0);
    expect(queried).toBe(false);
  });
});

describe("AddressPhoneVerificationService.isVerified", () => {
  test("true when the phone is the user's verified login phone", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
    });
    expect(await svc.isVerified("u1", "+971501234567")).toBe(true);
  });

  test("false when it matches the login phone but that phone is unverified", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: null } as any,
    });
    expect(await svc.isVerified("u1", "+971501234567")).toBe(false);
  });

  test("normalizes before comparing: UAE local form matches the E.164 login phone", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
    });
    expect(await svc.isVerified("u1", "0501234567")).toBe(true);
  });

  test("true when a user_verified_phones row exists", async () => {
    const svc = makeService({
      user: { id: "u1", phone: null, phone_verified_at: null } as any,
      verified: [{ user_id: "u1", phone: "+971509999999" }],
    });
    expect(await svc.isVerified("u1", "+971509999999")).toBe(true);
  });

  test("false when the verified row belongs to a different user", async () => {
    const svc = makeService({
      user: { id: "u1", phone: null, phone_verified_at: null } as any,
      verified: [{ user_id: "u2", phone: "+971509999999" }],
    });
    expect(await svc.isVerified("u1", "+971509999999")).toBe(false);
  });

  test("false for an unknown number", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
    });
    expect(await svc.isVerified("u1", "+971508888888")).toBe(false);
  });

  test("throws 400 INVALID_PHONE for a malformed number", async () => {
    const svc = makeService({ user: { id: "u1" } as any });
    const err = await svc.isVerified("u1", "nonsense").catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_PHONE");
  });
});

describe("AddressPhoneVerificationService.list", () => {
  test("maps rows to { phone, verified_at } only, with no internal fields leaking", async () => {
    const verified_at = new Date();
    const svc = makeService({
      verified: [{ id: "v1", user_id: "u1", phone: "+971501234567", verified_at }],
    });
    const result = await svc.list("u1");
    expect(result).toEqual([{ phone: "+971501234567", verified_at }]);
    const [row] = result;
    expect(Object.keys(row ?? {}).sort()).toEqual(["phone", "verified_at"]);
  });

  test("scopes to the caller: another user's verified row is never returned", async () => {
    const svc = makeService({
      verified: [
        { id: "v1", user_id: "u1", phone: "+971501111111", verified_at: new Date() },
        { id: "v2", user_id: "u2", phone: "+971502222222", verified_at: new Date() },
      ],
    });
    const result = await svc.list("u1");
    expect(result.map((r) => r.phone)).toEqual(["+971501111111"]);
    expect(result.some((r) => r.phone === "+971502222222")).toBe(false);
  });

  test("includes the verified login phone even with no user_verified_phones rows", async () => {
    const verified_at = new Date();
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: verified_at } as any,
    });
    const result = await svc.list("u1");
    expect(result).toEqual([{ phone: "+971501234567", verified_at }]);
  });

  test("does not include the login phone when it is unverified", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: null } as any,
    });
    const result = await svc.list("u1");
    expect(result).toEqual([]);
  });

  test("dedups when the login phone also has a user_verified_phones row", async () => {
    const verified_at = new Date();
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
      verified: [{ user_id: "u1", phone: "+971501234567", verified_at }],
    });
    const result = await svc.list("u1");
    expect(result).toEqual([{ phone: "+971501234567", verified_at }]);
  });

  test("omits a malformed login phone instead of throwing", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "not-a-phone", phone_verified_at: new Date() } as any,
    });
    const result = await svc.list("u1");
    expect(result).toEqual([]);
  });

  test("cross-user scoping still holds when the caller also has a verified login phone", async () => {
    const svc = makeService({
      user: { id: "u1", phone: "+971501234567", phone_verified_at: new Date() } as any,
      verified: [{ id: "v2", user_id: "u2", phone: "+971502222222", verified_at: new Date() }],
    });
    const result = await svc.list("u1");
    expect(result.map((r) => r.phone)).toEqual(["+971501234567"]);
  });
});

describe("AddressPhoneVerificationService.start", () => {
  test("normalizes the number and sends a code through the provider", async () => {
    const sent: string[] = [];
    const svc = new AddressPhoneVerificationService(
      {
        sendCode: async (p: string) => {
          sent.push(p);
        },
        checkCode: async () => true,
      } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: { findOne: async () => null } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const result = await svc.start("u1", "0501234567");
    expect(sent).toEqual(["+971501234567"]);
    expect(result.phone).toBe("+971501234567");
  });

  test("does not send when the cooldown rejects", async () => {
    const sent: string[] = [];
    const svc = new AddressPhoneVerificationService(
      {
        sendCode: async (p: string) => {
          sent.push(p);
        },
        checkCode: async () => true,
      } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: { findOne: async () => null } as any,
        cooldown: {
          check: async () => {
            throw new HttpError(429, "slow down", "OTP_RATE_LIMITED");
          },
          refund: async () => {},
        },
      },
    );
    const err = await svc.start("u1", "+971501234567").catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(sent).toEqual([]); // the SMS must not be sent
  });

  test("refunds the hourly slot when the send fails", async () => {
    // Otherwise five 503s in a row (Twilio unset/failing) burn the whole
    // hourly cap and lock the user out for an hour having had no SMS at all.
    const refunded: string[] = [];
    const svc = new AddressPhoneVerificationService(
      {
        sendCode: async () => {
          throw new HttpError(503, "Phone OTP is not configured", "PHONE_OTP_NOT_CONFIGURED");
        },
        checkCode: async () => true,
      } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: { findOne: async () => null } as any,
        cooldown: {
          check: async () => {},
          refund: async (userId: string) => {
            refunded.push(userId);
          },
        },
      },
    );
    const err = await svc.start("u1", "+971501234567").catch((e) => e);
    expect(err.statusCode).toBe(503); // the original failure still surfaces
    expect(refunded).toEqual(["u1"]);
  });

  test("a failing refund does not mask the send failure", async () => {
    const svc = new AddressPhoneVerificationService(
      {
        sendCode: async () => {
          throw new HttpError(503, "Phone OTP is not configured", "PHONE_OTP_NOT_CONFIGURED");
        },
        checkCode: async () => true,
      } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: { findOne: async () => null } as any,
        cooldown: {
          check: async () => {},
          refund: async () => {
            throw new Error("redis exploded");
          },
        },
      },
    );
    const err = await svc.start("u1", "+971501234567").catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("PHONE_OTP_NOT_CONFIGURED");
  });

  test("does not refund when the send succeeds", async () => {
    const refunded: string[] = [];
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: { findOne: async () => null } as any,
        cooldown: {
          check: async () => {},
          refund: async (userId: string) => {
            refunded.push(userId);
          },
        },
      },
    );
    await svc.start("u1", "+971501234567");
    expect(refunded).toEqual([]);
  });
});

describe("AddressPhoneVerificationService.confirm", () => {
  test("saves a verified row when the code is accepted", async () => {
    const saved: any[] = [];
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => null,
          save: async (row: any) => {
            saved.push(row);
            return row;
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const result = await svc.confirm("u1", "0501234567", "123456");
    expect(saved[0].user_id).toBe("u1");
    expect(saved[0].phone).toBe("+971501234567");
    expect(result.phone).toBe("+971501234567");
  });

  test("throws 401 INVALID_OTP and saves nothing when the code is wrong", async () => {
    const saved: any[] = [];
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => false } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => null,
          save: async (row: any) => {
            saved.push(row);
            return row;
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const err = await svc.confirm("u1", "+971501234567", "000000").catch((e) => e);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("INVALID_OTP");
    expect(saved).toEqual([]);
  });

  test("is idempotent: re-verifying an existing number does not insert twice", async () => {
    const saved: any[] = [];
    const existing = { id: "v1", user_id: "u1", phone: "+971501234567", verified_at: new Date() };
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => existing,
          save: async (row: any) => {
            saved.push(row);
            return row;
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const result = await svc.confirm("u1", "+971501234567", "123456");
    expect(saved).toEqual([]);
    expect(result.phone).toBe("+971501234567");
  });

  test("treats a unique-violation from save as idempotent success (concurrent double-submit)", async () => {
    const existing = { id: "v1", user_id: "u1", phone: "+971501234567", verified_at: new Date() };
    let findOneCalls = 0;
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => {
            findOneCalls += 1;
            // First call: the fast-path check, before the "concurrent" save lands.
            // Second call: the re-read after the unique violation.
            return findOneCalls === 1 ? null : existing;
          },
          save: async () => {
            const err = new Error("duplicate key value violates unique constraint");
            (err as Error & { code: string }).code = "23505";
            throw err;
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const result = await svc.confirm("u1", "+971501234567", "123456");
    expect(findOneCalls).toBe(2);
    expect(result).toEqual({ phone: "+971501234567", verified_at: existing.verified_at });
  });

  test("rethrows a unique-violation if the re-read finds no row", async () => {
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => null,
          save: async () => {
            const err = new Error("duplicate key value violates unique constraint");
            (err as Error & { code: string }).code = "23505";
            throw err;
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const err = await svc.confirm("u1", "+971501234567", "123456").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { code?: string }).code).toBe("23505");
  });

  test("rethrows a save error that is not a unique violation", async () => {
    const svc = new AddressPhoneVerificationService(
      { sendCode: async () => {}, checkCode: async () => true } as any,
      {
        userRepo: { findOne: async () => null } as any,
        verifiedRepo: {
          findOne: async () => null,
          save: async () => {
            throw new Error("connection reset");
          },
        } as any,
        cooldown: { check: async () => {}, refund: async () => {} },
      },
    );
    const err = await svc.confirm("u1", "+971501234567", "123456").catch((e) => e);
    expect((err as Error).message).toBe("connection reset");
  });
});
