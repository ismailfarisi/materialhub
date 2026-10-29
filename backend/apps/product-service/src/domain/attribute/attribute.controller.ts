import type { AttributeService } from "./attribute.service.ts";

export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  // biome-ignore lint/suspicious/noExplicitAny: typed at the route layer via Elysia schema
  async create(data: any) {
    return this.attributeService.create(data);
  }
  // biome-ignore lint/suspicious/noExplicitAny: typed at the route layer via Elysia schema
  async update(id: string, data: any) {
    return this.attributeService.update(id, data);
  }
  async remove(id: string) {
    return this.attributeService.remove(id);
  }
  async list(page?: number, limit?: number, type?: string) {
    return this.attributeService.list(page, limit, type);
  }
  // biome-ignore lint/suspicious/noExplicitAny: typed at the route layer via Elysia schema
  async addValue(attrId: string, data: any) {
    return this.attributeService.addValue(attrId, data);
  }
  // biome-ignore lint/suspicious/noExplicitAny: typed at the route layer via Elysia schema
  async updateValue(attrId: string, valId: string, data: any) {
    return this.attributeService.updateValue(attrId, valId, data);
  }
  async removeValue(attrId: string, valId: string) {
    return this.attributeService.removeValue(attrId, valId);
  }
  async getValues(attrId: string) {
    const attr = await this.attributeService.findById(attrId);
    return attr.values ?? [];
  }
}
