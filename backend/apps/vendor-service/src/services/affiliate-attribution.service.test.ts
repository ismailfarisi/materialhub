import { describe, expect, it, mock } from "bun:test";
import { AffiliateAttributionService } from "./affiliate-attribution.service.ts";

function make(codeAffiliate: any, windowValue = "") {
  const affiliateRepo = { findOne: mock(async () => codeAffiliate) } as any;
  const attrRepo = {
    create: mock((x: any) => x),
    save: mock(async (x: any) => ({ id: "attr-1", ...x })),
  } as any;
  const settings = { get: mock(async () => windowValue) };
  const svc = new AffiliateAttributionService(affiliateRepo, attrRepo);
  (svc as any).settings = settings;
  return { svc, affiliateRepo, attrRepo, settings };
}

describe("AffiliateAttributionService.recordClick", () => {
  it("returns null when there is no identity (no user, no session)", async () => {
    const { svc, attrRepo } = make({ id: "a1", vendor_id: "v1", status: "active" });
    const res = await svc.recordClick({ code: "AFF-X", buyerUserId: null, sessionId: null });
    expect(res).toBeNull();
    expect(attrRepo.save).not.toHaveBeenCalled();
  });

  it("returns null for an unknown/inactive code", async () => {
    const { svc } = make(null);
    const res = await svc.recordClick({ code: "AFF-NOPE", buyerUserId: "u1", sessionId: null });
    expect(res).toBeNull();
  });

  it("writes an attribution row scoped to the user with the default 7-day window", async () => {
    const { svc, attrRepo } = make({ id: "a1", vendor_id: "v1", status: "active" }, "");
    const before = Date.now();
    const res = await svc.recordClick({ code: "AFF-X", buyerUserId: "u1", sessionId: null });
    expect(res?.id).toBe("attr-1");
    const saved = attrRepo.create.mock.calls[0][0];
    expect(saved.vendor_affiliate_id).toBe("a1");
    expect(saved.vendor_id).toBe("v1");
    expect(saved.user_id).toBe("u1");
    expect(saved.attribution_window_days_snapshot).toBe(7);
    const days = (new Date(saved.expires_at).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("honors a custom window from site_settings", async () => {
    const { svc, attrRepo } = make({ id: "a1", vendor_id: "v1", status: "active" }, "14");
    await svc.recordClick({ code: "AFF-X", buyerUserId: null, sessionId: "sess-1" });
    const saved = attrRepo.create.mock.calls[0][0];
    expect(saved.attribution_window_days_snapshot).toBe(14);
    expect(saved.session_id).toBe("sess-1");
  });
});
