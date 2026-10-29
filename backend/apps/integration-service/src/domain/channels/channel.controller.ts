import type { ChannelDelivery, ChannelFeedRun, SalesChannel } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import type { CategoryMapService } from "./category-map.service.ts";
import type { ChannelService } from "./channel.service.ts";

export class ChannelController {
  constructor(
    private svc: ChannelService,
    private categoryMaps: CategoryMapService,
  ) {}

  list() {
    return this.svc.list();
  }

  async get(code: string) {
    const row = await this.svc.getByCode(code);
    if (!row) throw new NotFoundError("Sales channel not found");
    return row;
  }

  async update(code: string, body: Partial<SalesChannel>) {
    const updated = await this.svc.update(code, body);
    if (!updated) throw new NotFoundError("Sales channel not found");
    return updated;
  }

  async setCredentials(code: string, creds: Record<string, unknown>) {
    const ok = await this.svc.setCredentials(code, creds);
    if (!ok) throw new NotFoundError("Sales channel not found");
    return { code, credentials_set: true };
  }

  private async resolveChannelId(code: string): Promise<string> {
    const row = await this.svc.getByCode(code);
    if (!row) throw new NotFoundError("Sales channel not found");
    return row.id;
  }

  async listCategoryMappings(code: string) {
    return this.categoryMaps.list(await this.resolveChannelId(code));
  }

  async upsertCategoryMapping(
    code: string,
    body: {
      category_id: string;
      external_category_id: string;
      external_category_path?: string | null;
    },
  ) {
    return this.categoryMaps.upsert(
      await this.resolveChannelId(code),
      body.category_id,
      body.external_category_id,
      body.external_category_path ?? null,
    );
  }

  async deleteCategoryMapping(id: string) {
    const ok = await this.categoryMaps.remove(id);
    if (!ok) throw new NotFoundError("Category mapping not found");
    return { id };
  }

  async listRuns(code: string, limit: number, runRepo: Repository<ChannelFeedRun>) {
    return this.svc.listRecentRuns(code, limit, runRepo);
  }

  async listDeliveries(code: string, limit: number, deliveryRepo: Repository<ChannelDelivery>) {
    return this.svc.listRecentDeliveries(code, limit, deliveryRepo);
  }

  async stats(
    code: string,
    runRepo: Repository<ChannelFeedRun>,
    deliveryRepo: Repository<ChannelDelivery>,
  ) {
    return this.svc.stats24h(code, runRepo, deliveryRepo);
  }

  async rebuild(code: string, queue: Queue) {
    return this.svc.enqueueRebuild(code, queue);
  }
}
