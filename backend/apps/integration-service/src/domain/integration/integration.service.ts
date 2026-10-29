import { randomBytes } from "node:crypto";
import type { AuditLog, VendorIntegration } from "@materialhub/database";
import type { EncryptionService } from "@materialhub/utils";
import type { Repository } from "typeorm";

export interface CreateIntegrationInput {
  vendor_id: string;
  name: string;
  outbound_url?: string | null;
  inbound_ip_allowlist?: string[];
}

export interface CreateIntegrationResult {
  integration: VendorIntegration;
  inbound_secret_plaintext: string;
  outbound_secret_plaintext: string;
}

export class IntegrationService {
  constructor(
    private repo: Repository<VendorIntegration>,
    private encryption: EncryptionService,
    private auditRepo?: Repository<AuditLog>,
  ) {}

  private async emitAudit(args: {
    vendorId: string;
    action: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }): Promise<void> {
    if (!this.auditRepo) return;
    try {
      await this.auditRepo.save({
        actor_id: args.vendorId,
        actor_role: "vendor",
        action: args.action,
        entity_type: "vendor_integration",
        entity_id: args.entityId,
        changes: { before: args.before, after: args.after },
      } as any);
    } catch (e) {
      console.error("[audit] integration audit emit failed", {
        action: args.action,
        entity_id: args.entityId,
        error: (e as Error)?.message,
      });
    }
  }

  async list(vendorId: string): Promise<VendorIntegration[]> {
    return this.repo.find({
      where: { vendor_id: vendorId, deleted_at: null as any },
      order: { created_at: "DESC" } as any,
    });
  }

  async getById(id: string, vendorId: string): Promise<VendorIntegration | null> {
    const row = await this.repo.findOne({ where: { id, vendor_id: vendorId } as any });
    return row && !row.deleted_at ? row : null;
  }

  async create(input: CreateIntegrationInput): Promise<CreateIntegrationResult> {
    const inbound = randomBytes(32).toString("hex");
    const outbound = randomBytes(32).toString("hex");
    const saved = await this.repo.save({
      vendor_id: input.vendor_id,
      name: input.name,
      outbound_url: input.outbound_url ?? null,
      outbound_secret_encrypted: this.encryption.encrypt(outbound),
      inbound_secret_encrypted: this.encryption.encrypt(inbound),
      inbound_secret_last4: inbound.slice(-4),
      inbound_ip_allowlist: input.inbound_ip_allowlist ?? [],
      is_active: true,
    } as any);
    return {
      integration: saved as VendorIntegration,
      inbound_secret_plaintext: inbound,
      outbound_secret_plaintext: outbound,
    };
  }

  async update(
    id: string,
    vendorId: string,
    patch: Partial<VendorIntegration>,
  ): Promise<VendorIntegration | null> {
    const existing = await this.getById(id, vendorId);
    if (!existing) return null;
    const allowed: (keyof VendorIntegration)[] = [
      "name",
      "outbound_url",
      "inbound_ip_allowlist",
      "inventory_authority",
      "pricing_authority",
      "is_active",
    ];
    const safe: Record<string, unknown> = {};
    for (const k of allowed) {
      if (patch[k] !== undefined) safe[k] = patch[k];
    }
    await this.repo.update(id, safe as any);
    const after = await this.getById(id, vendorId);
    if (after) {
      await this.emitAudit({
        vendorId,
        action: "update",
        entityId: id,
        before: pickAuditable(existing),
        after: pickAuditable(after),
      });
    }
    return after;
  }

  async softDelete(id: string, vendorId: string): Promise<boolean> {
    const existing = await this.getById(id, vendorId);
    if (!existing) return false;
    await this.repo.softDelete(id);
    return true;
  }

  async rotateSecret(
    id: string,
    vendorId: string,
    direction: "outbound" | "inbound",
  ): Promise<{ plaintext: string }> {
    const existing = await this.getById(id, vendorId);
    if (!existing) throw new Error("not found");
    const fresh = randomBytes(32).toString("hex");
    if (direction === "outbound") {
      await this.repo.save({
        ...existing,
        outbound_previous_secret_encrypted: existing.outbound_secret_encrypted,
        outbound_secret_encrypted: this.encryption.encrypt(fresh),
        outbound_secret_rotated_at: new Date(),
      } as any);
    } else {
      await this.repo.save({
        ...existing,
        inbound_secret_encrypted: this.encryption.encrypt(fresh),
        inbound_secret_last4: fresh.slice(-4),
      } as any);
    }
    await this.emitAudit({
      vendorId,
      action: `rotate_${direction}_secret`,
      entityId: id,
      before: null,
      after: { rotated_at: new Date().toISOString() },
    });
    return { plaintext: fresh };
  }
}

function pickAuditable(row: VendorIntegration): Record<string, unknown> {
  return {
    name: row.name,
    outbound_url: row.outbound_url,
    inbound_ip_allowlist: row.inbound_ip_allowlist,
    inventory_authority: row.inventory_authority,
    pricing_authority: row.pricing_authority,
    is_active: row.is_active,
  };
}
