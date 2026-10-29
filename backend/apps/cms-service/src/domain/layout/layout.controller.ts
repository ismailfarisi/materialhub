import type { LayoutService } from "./layout.service.ts";

export class LayoutController {
  constructor(private readonly service: LayoutService) {}

  async list(query: Parameters<LayoutService["list"]>[0]) {
    return this.service.list(query);
  }
  async getById(id: string) {
    return this.service.getById(id);
  }
  async create(data: Parameters<LayoutService["create"]>[0], userId: string) {
    return this.service.create(data, userId);
  }
  async update(id: string, data: Parameters<LayoutService["update"]>[1]) {
    return this.service.update(id, data);
  }
  async remove(id: string) {
    return this.service.remove(id);
  }

  async listVersions(layoutId: string) {
    return this.service.listVersions(layoutId);
  }
  async createVersion(layoutId: string, userId: string) {
    return this.service.createVersion(layoutId, userId);
  }
  async publish(layoutId: string) {
    return this.service.publish(layoutId);
  }
  async schedule(layoutId: string, publishAt: string) {
    return this.service.schedule(layoutId, publishAt);
  }
  async rollback(layoutId: string, versionId: string) {
    return this.service.rollback(layoutId, versionId);
  }

  async listSections(layoutId: string) {
    return this.service.listSections(layoutId);
  }
  async addSection(
    layoutId: string,
    data: Parameters<LayoutService["addSection"]>[1],
    opts?: Parameters<LayoutService["addSection"]>[2],
  ) {
    return this.service.addSection(layoutId, data, opts);
  }
  async updateSection(
    layoutId: string,
    sectionId: string,
    data: Parameters<LayoutService["updateSection"]>[2],
    opts?: Parameters<LayoutService["updateSection"]>[3],
  ) {
    return this.service.updateSection(layoutId, sectionId, data, opts);
  }
  async removeSection(layoutId: string, sectionId: string) {
    return this.service.removeSection(layoutId, sectionId);
  }
  async reorderSections(
    layoutId: string,
    sections: Parameters<LayoutService["reorderSections"]>[1],
  ) {
    return this.service.reorderSections(layoutId, sections);
  }
  async findByVendorAndSlug(vendorId: string, slug: string) {
    return this.service.findByVendorAndSlug(vendorId, slug);
  }
}
