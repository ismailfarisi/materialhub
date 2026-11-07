import type { VendorIntegrationPendingWrite } from "@materialhub/database";
import { ConflictError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { isUuid } from "../ids.ts";

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

  async list(integrationId: string, status?: string): Promise<VendorIntegrationPendingWrite[]> {
    if (!isUuid(integrationId)) return [];
    const where: any = { integration_id: integrationId };
    if (status) where.status = status;
    return this.repo.find({ where, order: { created_at: "DESC" } as any });
  }

  async approve(id: string, adminUserId: string): Promise<VendorIntegrationPendingWrite> {
    const row = await this.findPending(id, "approve");
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
    const row = await this.findPending(id, "reject");
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

  /** 404 for an unknown (or malformed) id, 409 when the write was already reviewed. */
  private async findPending(
    id: string,
    action: "approve" | "reject",
  ): Promise<VendorIntegrationPendingWrite> {
    const row = isUuid(id) ? await this.repo.findOne({ where: { id } as any }) : null;
    if (!row) throw new NotFoundError("Pending write not found");
    if (row.status !== "pending") {
      throw new ConflictError(`cannot ${action} from status ${row.status}`);
    }
    return row;
  }

  async markApplied(id: string): Promise<void> {
    await this.repo.update(id, { applied_at: new Date(), status: "applied" } as any);
  }
}
