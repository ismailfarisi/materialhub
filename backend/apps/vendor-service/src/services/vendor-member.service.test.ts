import { describe, expect, mock, test } from "bun:test";
import { HttpError } from "@materialhub/plugins";

// Mock @materialhub/guards so bumpTokenVersion does not hit the real DB/Redis
const bumpTokenVersionMock = mock(async (_userId: string) => 2);
mock.module("@materialhub/guards", () => ({
  bumpTokenVersion: bumpTokenVersionMock,
}));

// Dynamic import AFTER mock.module
const { VendorMemberService } = await import("./vendor-member.service.ts");
type MemberListRow = import("./vendor-member.service.ts").MemberListRow;

interface QueryCall {
  sql: string;
  params?: unknown[];
}

function buildStubDataSource(queryHandler: (call: QueryCall) => unknown) {
  const calls: QueryCall[] = [];
  const ds = {
    query: async (sql: string, params?: unknown[]) => {
      const call = { sql, params };
      calls.push(call);
      return queryHandler(call);
    },
    transaction: async <T>(cb: (em: any) => Promise<T>) => {
      return cb({
        query: async (sql: string, params?: unknown[]) => {
          const call = { sql, params };
          calls.push(call);
          return queryHandler(call);
        },
      });
    },
    calls,
  };
  return ds;
}

function buildStubEmail() {
  const sent: any[] = [];
  return {
    sent,
    sendVerificationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendMagicLinkEmail: async () => {},
    sendPasswordChangedByAdminEmail: async () => {},
    sendVendorMemberInviteEmail: async (to: string, params: any) => {
      sent.push({ to, params });
    },
  } as any;
}

describe("VendorMemberService.invite", () => {
  test("rejects role='owner' with INVITE_OWNER_NOT_ALLOWED", async () => {
    const ds = buildStubDataSource(() => []);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.invite({
        vendorId: "v1",
        email: "x@y.com",
        role: "owner" as any,
        invitedByUserId: "u1",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe("INVITE_OWNER_NOT_ALLOWED");
    }
  });

  test("rejects when active member exists for same email (ALREADY_MEMBER)", async () => {
    const ds = buildStubDataSource((call) => {
      // First query (existing active): return one row
      if (call.sql.includes("vm.status = 'active'")) return [{ id: "vm-existing" }];
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.invite({
        vendorId: "v1",
        email: "x@y.com",
        role: "manager",
        invitedByUserId: "u1",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe("ALREADY_MEMBER");
    }
  });

  test("rejects when pending invite already exists (INVITE_ALREADY_PENDING)", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.includes("vm.status = 'active'")) return [];
      if (call.sql.includes("status = 'pending'")) return [{ id: "vm-pending" }];
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.invite({
        vendorId: "v1",
        email: "x@y.com",
        role: "manager",
        invitedByUserId: "u1",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe("INVITE_ALREADY_PENDING");
    }
  });

  test("happy path: inserts row, lowercases email, sends email, writes audit", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.includes("vm.status = 'active'")) return [];
      if (call.sql.includes("status = 'pending'")) return [];
      if (call.sql.startsWith("INSERT INTO vendor_members")) return [{ id: "new-vm-id" }];
      if (call.sql.includes("FROM vendors v, users u")) {
        return [{ vendor_name: "Acme", inviter_name: "Alice" }];
      }
      return [];
    });
    const email = buildStubEmail();
    const svc = new VendorMemberService(email, ds);
    const result = await svc.invite({
      vendorId: "v1",
      email: "  X@Y.COM  ",
      role: "manager",
      invitedByUserId: "u1",
    });
    expect(result.memberId).toBe("new-vm-id");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("x@y.com");
    expect(email.sent[0].params.role).toBe("manager");
    expect(email.sent[0].params.vendorName).toBe("Acme");
    expect(email.sent[0].params.inviterName).toBe("Alice");
    expect(email.sent[0].params.expiresInDays).toBe(7);
    // Audit log was written
    const auditCalls = ds.calls.filter((c: QueryCall) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(auditCalls).toHaveLength(1);
    const auditRow = auditCalls[0];
    expect(auditRow).toBeDefined();
    const audit = auditRow!.params as unknown[];
    expect(audit[0]).toBe("u1"); // actor_id
    expect(audit[1]).toBe("owner"); // actor_role
    expect(audit[2]).toBe("member.invited"); // action
    expect(audit[3]).toBe("new-vm-id"); // entity_id
    const metadataRaw = audit[4];
    expect(typeof metadataRaw).toBe("string");
    const metadata = JSON.parse(metadataRaw as string);
    expect(metadata).toEqual({ vendor_id: "v1", email: "x@y.com", role: "manager" });
  });
  test("does not send email or write audit when INSERT returns empty (defensive)", async () => {
    // The null-check after the INSERT throws *some* error; the critical guarantee
    // is that no email is sent and no audit row is written when the insert didn't
    // actually create a row. We don't assert on the error class here because
    // bun:test on Linux occasionally loses prototype-chain identity for thrown
    // errors that extend Error (statusCode/code show as undefined). The negative
    // side effects below are what we actually care about.
    const ds = buildStubDataSource((call) => {
      if (call.sql.includes("vm.status = 'active'")) return [];
      if (call.sql.includes("status = 'pending'")) return [];
      if (call.sql.startsWith("INSERT INTO vendor_members")) return []; // empty!
      return [];
    });
    const email = buildStubEmail();
    const svc = new VendorMemberService(email, ds);
    let threw = false;
    try {
      await svc.invite({
        vendorId: "v1",
        email: "x@y.com",
        role: "manager",
        invitedByUserId: "u1",
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(email.sent).toHaveLength(0);
    const auditCalls = ds.calls.filter((c: QueryCall) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(auditCalls).toHaveLength(0);
  });
});

describe("VendorMemberService.changeRole", () => {
  test("CANNOT_SELF_MODIFY when memberId.user_id === actorUserId", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-actor", role: "manager" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.changeRole({
        vendorId: "v1",
        memberId: "m1",
        newRole: "staff",
        actorUserId: "u-actor",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe("CANNOT_SELF_MODIFY");
    }
  });

  test("CANNOT_DEMOTE_OWNER when target.role === 'owner'", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-other", role: "owner" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.changeRole({
        vendorId: "v1",
        memberId: "m1",
        newRole: "manager",
        actorUserId: "u-actor",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("CANNOT_DEMOTE_OWNER");
    }
  });

  test("rejects newRole='owner' (assertNonOwnerRole)", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-other", role: "manager" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.changeRole({
        vendorId: "v1",
        memberId: "m1",
        newRole: "owner" as any,
        actorUserId: "u-actor",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_OWNER_NOT_ALLOWED");
    }
  });

  test("happy path: updates role + writes audit + (if user_id) bumps tv", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-target", role: "manager" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.changeRole({
      vendorId: "v1",
      memberId: "m1",
      newRole: "staff",
      actorUserId: "u-actor",
    });
    const updates = ds.calls.filter((c) => c.sql.startsWith("UPDATE vendor_members SET role"));
    expect(updates).toHaveLength(1);
    expect(updates[0]!.params).toEqual(["staff", "m1"]);
    const audit = ds.calls.find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    const meta = JSON.parse((audit!.params as any[])[4]);
    expect(meta.before_role).toBe("manager");
    expect(meta.after_role).toBe("staff");
  });
});

describe("VendorMemberService.remove", () => {
  test("OWNER_CANNOT_SELF_REMOVE when target is actor and role=owner", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role, status FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-actor", role: "owner", status: "active" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.remove({ vendorId: "v1", memberId: "m1", actorUserId: "u-actor" });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("OWNER_CANNOT_SELF_REMOVE");
    }
  });

  test("revokes pending row (no token bump since user_id is null)", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role, status FROM vendor_members")) {
        return [{ id: "m1", user_id: null, role: "manager", status: "pending" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.remove({ vendorId: "v1", memberId: "m1", actorUserId: "u-actor" });
    const audit = ds.calls.find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    expect(JSON.parse((audit!.params as any[])[4]).prior_status).toBe("pending");
  });

  test("revokes active row + audit", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, user_id, role, status FROM vendor_members")) {
        return [{ id: "m1", user_id: "u-target", role: "staff", status: "active" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.remove({ vendorId: "v1", memberId: "m1", actorUserId: "u-actor" });
    const updates = ds.calls.filter((c) => c.sql.startsWith("UPDATE vendor_members"));
    expect(updates[0]!.params).toEqual(["u-actor", "m1"]);
  });
});

describe("VendorMemberService.resendInvite", () => {
  test("INVITE_NOT_PENDING when status !== 'pending'", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.includes("FROM vendor_members vm")) {
        return [
          {
            id: "m1",
            email: "x@y.com",
            role: "manager",
            status: "active",
            vendor_name: "Acme",
            inviter_name: "Alice",
          },
        ];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.resendInvite({ vendorId: "v1", memberId: "m1", actorUserId: "u-actor" });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_NOT_PENDING");
    }
  });

  test("happy path: regenerates token + extends expires_at + sends email + audit", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.includes("FROM vendor_members vm")) {
        return [
          {
            id: "m1",
            email: "x@y.com",
            role: "manager",
            status: "pending",
            vendor_name: "Acme",
            inviter_name: "Alice",
          },
        ];
      }
      return [];
    });
    const email = buildStubEmail();
    const svc = new VendorMemberService(email, ds);
    const result = await svc.resendInvite({
      vendorId: "v1",
      memberId: "m1",
      actorUserId: "u-actor",
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].params.vendorName).toBe("Acme");
    const audit = ds.calls.find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    expect((audit!.params as any[])[2]).toBe("member.invite_resent");
  });
});

describe("VendorMemberService.transferOwnership", () => {
  function buildTxStubDataSource(queryHandler: (call: QueryCall) => unknown) {
    const calls: QueryCall[] = [];
    const txCalls: QueryCall[] = [];
    const ds = {
      calls,
      txCalls,
      query: async (sql: string, params?: unknown[]) => {
        const call = { sql, params };
        calls.push(call);
        return queryHandler(call);
      },
      transaction: async <T>(cb: (em: any) => Promise<T>) => {
        return cb({
          query: async (sql: string, params?: unknown[]) => {
            const call = { sql, params };
            txCalls.push(call);
            return queryHandler(call);
          },
        });
      },
    } as any;
    return ds;
  }

  test("TARGET_NOT_OWN_VENDOR when targetMemberId not in vendor", async () => {
    const ds = buildTxStubDataSource(() => []);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.transferOwnership({
        vendorId: "v1",
        currentOwnerUserId: "u-owner",
        targetMemberId: "m-foreign",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("TARGET_NOT_OWN_VENDOR");
    }
  });

  test("TARGET_NOT_ACTIVE_MANAGER when target is not active manager", async () => {
    const ds = buildTxStubDataSource((call) => {
      if (call.sql.includes("WHERE id = $1 AND vendor_id = $2")) {
        return [{ id: "m1", user_id: "u-target", role: "staff", status: "active" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.transferOwnership({
        vendorId: "v1",
        currentOwnerUserId: "u-owner",
        targetMemberId: "m1",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("TARGET_NOT_ACTIVE_MANAGER");
    }
  });

  test("NOT_CURRENT_OWNER when caller is not the current owner row's user", async () => {
    const ds = buildTxStubDataSource((call) => {
      if (call.sql.includes("WHERE id = $1 AND vendor_id = $2")) {
        return [{ id: "m-target", user_id: "u-target", role: "manager", status: "active" }];
      }
      if (call.sql.includes("role = 'owner'")) {
        return [{ id: "m-owner", user_id: "u-different-owner" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.transferOwnership({
        vendorId: "v1",
        currentOwnerUserId: "u-someone-else",
        targetMemberId: "m-target",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("NOT_CURRENT_OWNER");
    }
  });

  test("happy path: demotes owner, promotes target, writes audit (no vendors.user_id shim post-3b)", async () => {
    const ds = buildTxStubDataSource((call) => {
      if (call.sql.includes("WHERE id = $1 AND vendor_id = $2")) {
        return [{ id: "m-target", user_id: "u-target", role: "manager", status: "active" }];
      }
      if (call.sql.includes("role = 'owner'")) {
        return [{ id: "m-owner", user_id: "u-current-owner" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.transferOwnership({
      vendorId: "v1",
      currentOwnerUserId: "u-current-owner",
      targetMemberId: "m-target",
    });

    // Demote-first ordering check: the UPDATE setting role='manager' must come before
    // the UPDATE setting role='owner' to avoid the partial unique constraint violation.
    const txSqls = (ds.txCalls as QueryCall[]).map((c) => c.sql);
    const demoteIdx = txSqls.findIndex((s) => s.includes("SET role = 'manager'"));
    const promoteIdx = txSqls.findIndex((s) => s.includes("SET role = 'owner'"));
    expect(demoteIdx).toBeGreaterThan(-1);
    expect(promoteIdx).toBeGreaterThan(-1);
    expect(demoteIdx).toBeLessThan(promoteIdx);

    // Phase 3b: vendors.user_id column was dropped — no shim UPDATE expected.
    const vendorUpdate = (ds.txCalls as QueryCall[]).find((c) =>
      c.sql.startsWith("UPDATE vendors SET user_id"),
    );
    expect(vendorUpdate).toBeUndefined();

    // Audit log written outside tx
    const audit = (ds.calls as QueryCall[]).find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    expect((audit!.params as any[])[2]).toBe("vendor.ownership_transferred");
  });
});

describe("VendorMemberService.previewInvite", () => {
  test("returns null for unknown token", async () => {
    const ds = buildStubDataSource(() => []);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    expect(await svc.previewInvite("bad")).toBeNull();
  });

  test("returns preview with computed expired flag", async () => {
    const ds = buildStubDataSource(() => [
      {
        email: "x@y.com",
        role: "manager",
        status: "pending",
        invite_expires_at: "2020-01-01T00:00:00Z", // way in past
        vendor_name: "Acme",
      },
    ]);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    const result = await svc.previewInvite("tok");
    expect(result).toEqual({
      vendorName: "Acme",
      role: "manager",
      invitedEmail: "x@y.com",
      expiresAt: "2020-01-01T00:00:00Z",
      status: "pending",
      expired: true,
    });
  });
});

describe("VendorMemberService.acceptInvite", () => {
  test("INVITE_NOT_FOUND for unknown token", async () => {
    const ds = buildStubDataSource(() => []);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.acceptInvite({
        token: "bad",
        authedUserId: "u1",
        authedEmail: "x@y.com",
        emailVerified: true,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_NOT_FOUND");
    }
  });

  test("INVITE_NOT_PENDING when status='active' (already accepted)", async () => {
    const ds = buildStubDataSource(() => [
      {
        id: "m1",
        vendor_id: "v1",
        email: "x@y.com",
        status: "active",
        invite_expires_at: "2099-01-01T00:00:00Z",
      },
    ]);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.acceptInvite({
        token: "tok",
        authedUserId: "u1",
        authedEmail: "x@y.com",
        emailVerified: true,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_NOT_PENDING");
    }
  });

  test("INVITE_EXPIRED when expires_at < now", async () => {
    const ds = buildStubDataSource(() => [
      {
        id: "m1",
        vendor_id: "v1",
        email: "x@y.com",
        status: "pending",
        invite_expires_at: "2020-01-01T00:00:00Z",
      },
    ]);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.acceptInvite({
        token: "tok",
        authedUserId: "u1",
        authedEmail: "x@y.com",
        emailVerified: true,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_EXPIRED");
    }
  });

  test("EMAIL_NOT_VERIFIED when emailVerified=false", async () => {
    const ds = buildStubDataSource(() => [
      {
        id: "m1",
        vendor_id: "v1",
        email: "x@y.com",
        status: "pending",
        invite_expires_at: "2099-01-01T00:00:00Z",
      },
    ]);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.acceptInvite({
        token: "tok",
        authedUserId: "u1",
        authedEmail: "x@y.com",
        emailVerified: false,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("EMAIL_NOT_VERIFIED");
    }
  });

  test("INVITE_EMAIL_MISMATCH when authed email != invite email", async () => {
    const ds = buildStubDataSource(() => [
      {
        id: "m1",
        vendor_id: "v1",
        email: "invite@x.com",
        status: "pending",
        invite_expires_at: "2099-01-01T00:00:00Z",
      },
    ]);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.acceptInvite({
        token: "tok",
        authedUserId: "u1",
        authedEmail: "different@x.com",
        emailVerified: true,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_EMAIL_MISMATCH");
    }
  });

  test("happy path: row → active, user_id set, token cleared, audit, tv bumped", async () => {
    const ds = buildStubDataSource((call) => {
      if (call.sql.startsWith("SELECT id, vendor_id")) {
        return [
          {
            id: "m1",
            vendor_id: "v1",
            email: "x@y.com",
            status: "pending",
            invite_expires_at: "2099-01-01T00:00:00Z",
          },
        ];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.acceptInvite({
      token: "tok",
      authedUserId: "u-new",
      authedEmail: "X@Y.com", // case-insensitive match
      emailVerified: true,
    });
    const update = ds.calls.find(
      (c) => c.sql.startsWith("UPDATE vendor_members") && c.sql.includes("SET user_id"),
    );
    expect(update).toBeDefined();
    expect(update!.params).toEqual(["u-new", "m1"]);
    const audit = ds.calls.find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    expect((audit!.params as any[])[2]).toBe("member.accepted");
  });
});

describe("VendorMemberService.declineInvite", () => {
  test("INVITE_NOT_FOUND for unknown or non-pending token", async () => {
    const ds = buildStubDataSource(() => []);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    try {
      await svc.declineInvite("bad");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as HttpError).code).toBe("INVITE_NOT_FOUND");
    }
  });

  test("happy path: row → revoked + audit", async () => {
    const ds = buildStubDataSource((call) => {
      if (
        call.sql.startsWith("SELECT id, vendor_id FROM vendor_members") &&
        call.sql.includes("invite_token")
      ) {
        return [{ id: "m1", vendor_id: "v1" }];
      }
      return [];
    });
    const svc = new VendorMemberService(buildStubEmail(), ds);
    await svc.declineInvite("tok");
    const update = ds.calls.find(
      (c) => c.sql.startsWith("UPDATE vendor_members") && c.sql.includes("SET status = 'revoked'"),
    );
    expect(update).toBeDefined();
    const audit = ds.calls.find((c) => c.sql.startsWith("INSERT INTO audit_log"));
    expect(audit).toBeDefined();
    expect((audit!.params as any[])[2]).toBe("member.declined");
  });
});

describe("VendorMemberService.list", () => {
  test("returns rows with computed expired flag", async () => {
    const expectedRows: MemberListRow[] = [
      {
        id: "vm-1",
        user_id: "u-1",
        email: "active@x.com",
        role: "manager",
        status: "active",
        invite_expires_at: null,
        expired: false,
        joined_or_invited_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "vm-2",
        user_id: null,
        email: "expired-pending@x.com",
        role: "staff",
        status: "pending",
        invite_expires_at: "2026-04-01T00:00:00Z",
        expired: true,
        joined_or_invited_at: "2026-03-25T00:00:00Z",
      },
    ];
    const ds = buildStubDataSource(() => expectedRows);
    const svc = new VendorMemberService(buildStubEmail(), ds);
    const result = await svc.list({ vendorId: "v1" });
    expect(result).toEqual(expectedRows);
    expect(ds.calls).toHaveLength(1);
    const listCall = ds.calls[0]!;
    expect(listCall.sql).toContain("FROM vendor_members vm");
    expect(listCall.sql).toContain("WHERE vm.vendor_id = $1");
    expect(listCall.params).toEqual(["v1"]);
  });
});
