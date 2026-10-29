import type { VendorIntegrationPendingWrite } from "@materialhub/database";
import type { Repository } from "typeorm";

export class PendingWritesService {
  constructor(private repo: Repository<VendorIntegrationPendingWrite>) {}

  stage(input: {
    integration_id: string;
    delivery_id: string;
    kind: string;
    payload: Record<string, unknown>;
    thresholdBreached?: boolean;
  }): Promise<VendorIntegrationPendingWrite> {
    return this.repo.save({
      integration_id: input.integration_id,
      delivery_id: input.delivery_id,
      kind: input.kind,
      payload: input.payload,
      status: "pending",
      auto_apply_threshold_breached: input.thresholdBreached ?? false,
    } as any) as Promise<VendorIntegrationPendingWrite>;
  }

  list(integrationId: string, status?: string) {
    const where: any = { integration_id: integrationId };
    if (status) where.status = status;
    return this.repo.find({ where, order: { created_at: "DESC" } as any });
  }

  async approve(id: string, adminUserId: string): Promise<VendorIntegrationPendingWrite> {
    const row = await this.repo.findOne({ where: { id } as any });
    if (!row) throw new Error("not found");
    if (row.status !== "pending") throw new Error(`cannot approve from status ${row.status}`);
    row.status = "approved";
    row.reviewed_by = adminUserId;
    row.reviewed_at = new Date();
    await this.repo.update(id, {
      status: "approved",
      reviewed_by: adminUserId,
      reviewed_at: new Date(),
    } as any);
    return row;
  }

  async reject(id: string, adminUserId: string): Promise<VendorIntegrationPendingWrite> {
    const row = await this.repo.findOne({ where: { id } as any });
    if (!row) throw new Error("not found");
    if (row.status !== "pending") throw new Error(`cannot reject from status ${row.status}`);
    row.status = "rejected";
    row.reviewed_by = adminUserId;
    row.reviewed_at = new Date();
    await this.repo.update(id, {
      status: "rejected",
      reviewed_by: adminUserId,
      reviewed_at: new Date(),
    } as any);
    return row;
  }

  async markApplied(id: string): Promise<void> {
    await this.repo.update(id, { applied_at: new Date(), status: "applied" } as any);
  }
}
