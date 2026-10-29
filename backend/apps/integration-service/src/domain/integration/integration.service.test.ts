import { describe, expect, it, mock } from "bun:test";
import { IntegrationService } from "./integration.service.ts";

const repoStub = () => ({
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => Promise.resolve([])),
  save: mock((v: any) => Promise.resolve({ id: "new", ...v })),
  update: mock(() => Promise.resolve({ affected: 1 })),
  softDelete: mock(() => Promise.resolve({ affected: 1 })),
});

const encryptionStub = () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
  encryptObject: (o: any) => `enc(${JSON.stringify(o)})`,
  decryptObject: (s: string) => JSON.parse(s.replace(/^enc\(/, "").replace(/\)$/, "")),
});

describe("IntegrationService.create", () => {
  it("generates inbound secret and returns it once", async () => {
    const integrationRepo = repoStub();
    const encryption = encryptionStub();
    const svc = new IntegrationService(integrationRepo as any, encryption as any);
    const result = await svc.create({ vendor_id: "v1", name: "Odoo" });
    expect(result.inbound_secret_plaintext).toMatch(/^[a-f0-9]{64}$/);
    expect(result.integration.id).toBe("new");
    expect(integrationRepo.save).toHaveBeenCalledTimes(1);
  });
});

describe("IntegrationService.rotateSecret", () => {
  it("rotates outbound secret and returns plaintext", async () => {
    const integrationRepo = repoStub();
    integrationRepo.findOne = mock(() =>
      Promise.resolve({
        id: "i1",
        vendor_id: "v1",
        outbound_secret_encrypted: "enc(old)",
      } as any),
    );
    const encryption = encryptionStub();
    const svc = new IntegrationService(integrationRepo as any, encryption as any);
    const result = await svc.rotateSecret("i1", "v1", "outbound");
    expect(result.plaintext).toMatch(/^[a-f0-9]{64}$/);
    expect(integrationRepo.save).toHaveBeenCalled();
  });
});
