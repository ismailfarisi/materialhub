import { NotFoundError } from "@materialhub/plugins";
import type { IntegrationService } from "./integration.service.ts";

export class IntegrationController {
  constructor(private svc: IntegrationService) {}

  list(vendorId: string) {
    return this.svc.list(vendorId);
  }

  async get(id: string, vendorId: string) {
    const row = await this.svc.getById(id, vendorId);
    if (!row) throw new NotFoundError("Integration not found");
    return row;
  }

  create(vendorId: string, body: { name: string; outbound_url?: string | null }) {
    return this.svc.create({
      vendor_id: vendorId,
      name: body.name,
      outbound_url: body.outbound_url,
    });
  }

  async update(id: string, vendorId: string, body: any) {
    const updated = await this.svc.update(id, vendorId, body);
    if (!updated) throw new NotFoundError("Integration not found");
    return updated;
  }

  async delete(id: string, vendorId: string) {
    const ok = await this.svc.softDelete(id, vendorId);
    if (!ok) throw new NotFoundError("Integration not found");
    return { id };
  }

  rotateSecret(id: string, vendorId: string, direction: "outbound" | "inbound") {
    return this.svc.rotateSecret(id, vendorId, direction);
  }
}
