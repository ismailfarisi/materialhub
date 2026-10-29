import { describe, expect, it } from "bun:test";
import type { ServiceOffering, ServiceOfferingTranslation, Vendor } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { ServiceOfferingService } from "./service-offering.service.ts";

const VENDOR_A = "00000000-0000-0000-0000-00000000000a";

// Minimal fake repositories — product-service unit tests mock the repos rather
// than hitting a live DB (mirrors flash-deal.service.test.ts). DB-applied
// column defaults (e.g. status='draft') are covered by the migration, not here;
// these tests assert the service's own logic (slug, vendor scoping, lookups),
// not the publish approval gate (see service-offering.approval.test.ts) — the
// mocked vendor is trusted by default so a "published" status here behaves as
// it did before the gate existed.
function makeService(overrides?: {
  findOne?: (args: {
    where: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null>;
  vendorTrusted?: boolean;
}) {
  const saved: Array<Partial<ServiceOffering>> = [];
  const offeringRepo = {
    create: (obj: Partial<ServiceOffering>) => obj,
    save: (obj: Partial<ServiceOffering>) => {
      saved.push(obj);
      return Promise.resolve({ id: "generated-id", ...obj });
    },
    find: () => Promise.resolve(saved),
    findOne:
      overrides?.findOne ?? ((_args: { where: Record<string, unknown> }) => Promise.resolve(null)),
  } as unknown as Repository<ServiceOffering>;

  const translationRepo = {} as unknown as Repository<ServiceOfferingTranslation>;
  const vendorRepo = {
    findOne: () =>
      Promise.resolve({ id: VENDOR_A, services_trusted: overrides?.vendorTrusted ?? true }),
  } as unknown as Repository<Vendor>;
  // Passed explicitly so create()/update() don't fall through to the real
  // enqueueServiceSearchSync default, which would try to reach a live Redis.
  const onWrite = async () => {};
  return {
    svc: new ServiceOfferingService(offeringRepo, translationRepo, vendorRepo, onWrite),
    saved,
  };
}

describe("ServiceOfferingService.create", () => {
  it("scopes to the vendor, keeps price in fils, and derives a slug from the name", async () => {
    const { svc } = makeService();
    const created = await svc.create(VENDOR_A, {
      name: "Signature Facial",
      duration_minutes: 60,
      price_fils: 25000,
    });
    expect(created.vendor_id).toBe(VENDOR_A);
    expect(created.price_fils).toBe(25000);
    expect(created.slug).toMatch(/^signature-facial-[0-9a-f]{8}$/);
  });

  it("falls back to a 'service' slug base when the name has no slug-able chars", async () => {
    const { svc } = makeService();
    const created = await svc.create(VENDOR_A, {
      name: "!!!",
      duration_minutes: 30,
      price_fils: 10000,
    });
    expect(created.slug).toMatch(/^service-[0-9a-f]{8}$/);
  });
});

describe("ServiceOfferingService.getPublishedBySlug", () => {
  it("throws NotFoundError when no published offering matches the slug", async () => {
    const { svc } = makeService({ findOne: () => Promise.resolve(null) });
    await expect(svc.getPublishedBySlug("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the offering and filters on status=published", async () => {
    let captured: Record<string, unknown> | null = null;
    const { svc } = makeService({
      findOne: ({ where }) => {
        captured = where;
        return Promise.resolve({ id: "x", slug: "signature-facial-aaaaaaaa" });
      },
    });
    const found = await svc.getPublishedBySlug("signature-facial-aaaaaaaa");
    expect(found.id).toBe("x");
    expect(captured).toMatchObject({ slug: "signature-facial-aaaaaaaa", status: "published" });
  });
});

describe("ServiceOfferingService.getPublishedById", () => {
  it("throws NotFoundError when no published offering matches the id", async () => {
    const { svc } = makeService({ findOne: () => Promise.resolve(null) });
    await expect(svc.getPublishedById("missing-id")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the offering and filters on status=published", async () => {
    let captured: Record<string, unknown> | null = null;
    const { svc } = makeService({
      findOne: ({ where }) => {
        captured = where;
        return Promise.resolve({ id: "x", slug: "signature-facial-aaaaaaaa" });
      },
    });
    const found = await svc.getPublishedById("x");
    expect(found.id).toBe("x");
    expect(captured).toMatchObject({ id: "x", status: "published" });
  });
});

describe("ServiceOfferingService.update", () => {
  it("throws NotFoundError when the offering is not owned by the vendor", async () => {
    const { svc } = makeService({ findOne: () => Promise.resolve(null) });
    await expect(svc.update(VENDOR_A, "some-id", { status: "published" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("applies the patch and saves when the offering is found", async () => {
    const { svc, saved } = makeService({
      findOne: () => Promise.resolve({ id: "x", vendor_id: VENDOR_A, status: "draft" }),
    });
    const updated = await svc.update(VENDOR_A, "x", { status: "published", price_fils: 30000 });
    expect(updated.status as string).toBe("published");
    expect(updated.price_fils).toBe(30000);
    expect(saved[0]).toMatchObject({ id: "x", status: "published", price_fils: 30000 });
  });

  // task-4-review.md I-2: the vendor-dashboard edit form omits empty/
  // inapplicable optional fields on CREATE (server defaults apply) but on
  // EDIT must send explicit clearing values, because Object.assign(offering,
  // body) only touches keys present in `body` — an omitted key silently
  // leaves the prior stored value in place. These tests prove update() (the
  // shared code path) actually clears the entity when those explicit values
  // are sent, not just that the DTO/type layer accepts them.
  it("clears description when the body explicitly sends null", async () => {
    const { svc, saved } = makeService({
      findOne: () =>
        Promise.resolve({
          id: "x",
          vendor_id: VENDOR_A,
          status: "draft",
          description: "Old description",
        }),
    });
    const updated = await svc.update(VENDOR_A, "x", { description: null });
    expect(updated.description).toBeNull();
    expect(saved[0]?.description).toBeNull();
  });

  it("clears category_id when the body explicitly sends null", async () => {
    const { svc, saved } = makeService({
      findOne: () =>
        Promise.resolve({
          id: "x",
          vendor_id: VENDOR_A,
          status: "draft",
          category_id: "00000000-0000-0000-0000-0000000000c1",
        }),
    });
    const updated = await svc.update(VENDOR_A, "x", { category_id: null });
    expect(updated.category_id).toBeNull();
    expect(saved[0]?.category_id).toBeNull();
  });

  it("clears media_urls when the body explicitly sends an empty array", async () => {
    const { svc, saved } = makeService({
      findOne: () =>
        Promise.resolve({
          id: "x",
          vendor_id: VENDOR_A,
          status: "draft",
          media_urls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        }),
    });
    const updated = await svc.update(VENDOR_A, "x", { media_urls: [] });
    expect(updated.media_urls).toEqual([]);
    expect(saved[0]?.media_urls).toEqual([]);
  });

  it("clears a stale deposit when payment_mode moves away from deposit (deposit_type=none, deposit_value=0)", async () => {
    // Ledger follow-up: "deposit->prepay offering edits leave deposit_value in
    // place" — the frontend now sends the semantic off-state explicitly on
    // edit; this proves update() actually persists it (and by extension that
    // GET /services/:slug, a bare findOne passthrough, stops echoing the
    // stale value).
    const { svc, saved } = makeService({
      findOne: () =>
        Promise.resolve({
          id: "x",
          vendor_id: VENDOR_A,
          status: "draft",
          payment_mode: "deposit",
          deposit_type: "percent",
          deposit_value: 20,
        }),
    });
    const updated = await svc.update(VENDOR_A, "x", {
      payment_mode: "prepay",
      deposit_type: "none",
      deposit_value: 0,
    });
    expect(updated.payment_mode as string).toBe("prepay");
    expect(updated.deposit_type as string).toBe("none");
    expect(updated.deposit_value).toBe(0);
    expect(saved[0]).toMatchObject({ deposit_type: "none", deposit_value: 0 });
  });

  it("clears a stale cancellation penalty when the policy moves away from percent", async () => {
    const { svc, saved } = makeService({
      findOne: () =>
        Promise.resolve({
          id: "x",
          vendor_id: VENDOR_A,
          status: "draft",
          cancellation_refund_policy: "percent",
          cancellation_penalty_percent: 50,
        }),
    });
    const updated = await svc.update(VENDOR_A, "x", {
      cancellation_refund_policy: "full",
      cancellation_penalty_percent: 0,
    });
    expect(updated.cancellation_refund_policy as string).toBe("full");
    expect(updated.cancellation_penalty_percent).toBe(0);
    expect(saved[0]).toMatchObject({ cancellation_penalty_percent: 0 });
  });
});
