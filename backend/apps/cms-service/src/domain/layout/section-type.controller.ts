import type { SectionTypeService } from "./section-type.service.ts";

export class SectionTypeController {
  constructor(private readonly service: SectionTypeService) {}

  async list() {
    return this.service.listAll();
  }
  async create(data: Parameters<SectionTypeService["create"]>[0]) {
    return this.service.create(data);
  }
  async update(id: string, data: Parameters<SectionTypeService["update"]>[1]) {
    return this.service.update(id, data);
  }
}
