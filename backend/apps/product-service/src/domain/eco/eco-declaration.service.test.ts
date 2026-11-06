import { describe, expect, it } from "bun:test";
import {
  type EcoDeclarationRow,
  EcoDeclarationService,
  type EcoDeclarationStore,
  toPublicEcoDeclaration,
} from "./eco-declaration.service.ts";

const VENDOR = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const PRODUCT = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-11-06T08:00:00Z");

function setup(initial?: Partial<EcoDeclarationRow>) {
  let row: EcoDeclarationRow | null = initial
    ? ({
        id: "d1",
        product_id: PRODUCT,
        vendor_id: VENDOR,
        status: "pending",
        statement: null,
        certificate_key: null,
        certificate_filename: null,
        declared_by: "u1",
        submitted_at: NOW,
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        ...initial,
      } as EcoDeclarationRow)
    : null;
  const reindexed: string[] = [];
  let saves = 0;
  const store: EcoDeclarationStore = {
    findByProduct: async (id) => (row && row.product_id === id ? { ...row } : null),
    findById: async (id) => (row && row.id === id ? { ...row } : null),
    save: async (r) => {
      saves += 1;
      row = { id: "d1", ...(r as EcoDeclarationRow) };
      return { ...row };
    },
    productOwner: async (id) => (id === PRODUCT ? VENDOR : null),
    adminList: async () => ({ items: row ? [row] : [], total: row ? 1 : 0 }),
    adminDetail: async (id) => (row?.id === id ? row : null),
  };
  const service = new EcoDeclarationService({
    store,
    reindex: async (id) => {
      reindexed.push(id);
    },
    signedUrl: async (key) => ({ url: `https://signed/${key}`, expiresAt: NOW }),
    now: () => NOW,
  });
  return { service, reindexed, current: () => row, saves: () => saves };
}

async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (err: any) {
    expect(err.code ?? err.errorCode ?? err.error).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe("EcoDeclarationService — vendor", () => {
  it("creates a pending declaration and hides the storage key", async () => {
    const { service, current } = setup();
    const key = `private/eco-certificates/${VENDOR}/abc/fsc.pdf`;
    const out: any = await service.declare(PRODUCT, VENDOR, "u1", {
      confirm: true,
      statement: "  Paper only, no lining  ",
      certificate_key: key,
      certificate_filename: "fsc.pdf",
    });
    expect(out.status).toBe("pending");
    expect(out.has_certificate).toBe(true);
    expect(out.certificate_key).toBeUndefined();
    expect(current()?.statement).toBe("Paper only, no lining");
    expect(current()?.certificate_key).toBe(key);
  });

  it("requires the declaration tick", async () => {
    const { service } = setup();
    await expectCode(
      service.declare(PRODUCT, VENDOR, "u1", { confirm: false }),
      "ECO_DECLARATION_UNCONFIRMED",
    );
  });

  it("rejects products the vendor does not own", async () => {
    const { service } = setup();
    await expectCode(service.declare(PRODUCT, OTHER, "u1", { confirm: true }), "PRODUCT_NOT_FOUND");
  });

  it("rejects a certificate key outside the vendor's eco prefix", async () => {
    const { service } = setup();
    for (const key of [`private/kyc/${VENDOR}/x.pdf`, `private/eco-certificates/${OTHER}/x.pdf`]) {
      await expectCode(
        service.declare(PRODUCT, VENDOR, "u1", { confirm: true, certificate_key: key }),
        "ECO_CERTIFICATE_INVALID",
      );
    }
  });

  it("is a no-op when an approved declaration is re-submitted unchanged", async () => {
    const { service, reindexed, saves } = setup({ status: "approved" as any, statement: "Paper" });
    const out: any = await service.declare(PRODUCT, VENDOR, "u1", {
      confirm: true,
      statement: "Paper",
    });
    expect(out.status).toBe("approved");
    expect(saves()).toBe(0);
    expect(reindexed).toEqual([]);
  });

  it("sends an edited approved declaration back to review and drops the badge", async () => {
    const { service, reindexed, current } = setup({
      status: "approved" as any,
      statement: "Paper",
      reviewed_by: "admin",
      reviewed_at: NOW,
    });
    await service.declare(PRODUCT, VENDOR, "u1", { confirm: true, statement: "Paper, new glue" });
    expect(current()?.status).toBe("pending");
    expect(current()?.reviewed_by).toBeNull();
    expect(reindexed).toEqual([PRODUCT]);
  });

  it("keeps the certificate when the key is omitted and removes it on null", async () => {
    const key = `private/eco-certificates/${VENDOR}/a/c.pdf`;
    const { service, current } = setup({ certificate_key: key, certificate_filename: "c.pdf" });
    await service.declare(PRODUCT, VENDOR, "u1", { confirm: true, statement: "x" });
    expect(current()?.certificate_key).toBe(key);
    await service.declare(PRODUCT, VENDOR, "u1", {
      confirm: true,
      statement: "x",
      certificate_key: null,
    });
    expect(current()?.certificate_key).toBeNull();
    expect(current()?.certificate_filename).toBeNull();
  });

  it("withdraws, reindexing only if the badge was live", async () => {
    const a = setup({ status: "approved" as any });
    await a.service.withdraw(PRODUCT, VENDOR);
    expect(a.current()?.status).toBe("withdrawn");
    expect(a.reindexed).toEqual([PRODUCT]);
    const b = setup({ status: "pending" as any });
    await b.service.withdraw(PRODUCT, VENDOR);
    expect(b.reindexed).toEqual([]);
  });
});

describe("EcoDeclarationService — admin review", () => {
  it("approves, records the reviewer and reindexes", async () => {
    const { service, current, reindexed } = setup({ status: "pending" as any });
    await service.approve("d1", "admin-1");
    expect(current()).toMatchObject({
      status: "approved",
      reviewed_by: "admin-1",
      reviewed_at: NOW,
    });
    expect(reindexed).toEqual([PRODUCT]);
  });

  it("approve is idempotent", async () => {
    const { service, reindexed, saves } = setup({ status: "approved" as any });
    await service.approve("d1", "admin-1");
    expect(saves()).toBe(0);
    expect(reindexed).toEqual([]);
  });

  it("rejects with a reason and requires one", async () => {
    const { service, current } = setup({ status: "pending" as any });
    await expectCode(service.reject("d1", "admin-1", "  no "), "ECO_REJECTION_REASON_REQUIRED");
    await service.reject("d1", "admin-1", "Cup has a PE lining; not plastic-free.");
    expect(current()).toMatchObject({
      status: "rejected",
      rejection_reason: "Cup has a PE lining; not plastic-free.",
    });
  });

  it("will not review a withdrawn declaration", async () => {
    const { service } = setup({ status: "withdrawn" as any });
    await expectCode(service.approve("d1", "admin-1"), "ECO_DECLARATION_WITHDRAWN");
  });

  it("validates the status filter", async () => {
    const { service } = setup();
    await expectCode(service.adminList({ status: "bogus" }), "ECO_STATUS_INVALID");
    const res = await service.adminList({ status: "pending", page: "1", limit: "500" });
    expect(res.limit).toBe(100);
  });

  it("signs certificate URLs and 404s when there is none", async () => {
    const key = `private/eco-certificates/${VENDOR}/a/c.pdf`;
    const { service } = setup({ certificate_key: key });
    expect((await service.adminCertificateUrl("d1")).url).toBe(`https://signed/${key}`);
    const empty = setup();
    await empty.service.declare(PRODUCT, VENDOR, "u1", { confirm: true });
    await expectCode(empty.service.adminCertificateUrl("d1"), "ECO_CERTIFICATE_NOT_FOUND");
  });
});

describe("toPublicEcoDeclaration", () => {
  it("exposes approved declarations only, without the key", () => {
    expect(
      toPublicEcoDeclaration({ status: "pending" as any, reviewed_at: null, certificate_key: "k" }),
    ).toBe(null);
    expect(toPublicEcoDeclaration(null)).toBe(null);
    expect(
      toPublicEcoDeclaration({ status: "approved" as any, reviewed_at: NOW, certificate_key: "k" }),
    ).toEqual({ status: "approved", reviewed_at: NOW, has_certificate: true });
  });
});
