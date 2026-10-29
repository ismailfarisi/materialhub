import type { BoxInput, GiftBoxService } from "./gift-box.service.ts";
import type { GiftCatalogService, OccasionInput, StyleInput } from "./gift-catalog.service.ts";

export class GiftController {
  constructor(
    private catalog: GiftCatalogService,
    private boxes: GiftBoxService,
  ) {}

  // storefront
  listOccasions() {
    return this.catalog.listOccasions(true);
  }
  occasionBySlug(slug: string) {
    return this.catalog.getOccasionBySlug(slug);
  }
  listBoxes(occasionSlug?: string, page?: number, perPage?: number) {
    return this.boxes.listActive(occasionSlug, page ?? 1, perPage ?? 24);
  }
  boxBySlug(slug: string) {
    return this.boxes.getActiveBySlug(slug);
  }

  // admin — occasions
  adminListOccasions() {
    return this.catalog.listOccasions(false);
  }
  createOccasion(b: OccasionInput) {
    return this.catalog.createOccasion(b);
  }
  updateOccasion(id: string, b: Partial<OccasionInput>) {
    return this.catalog.updateOccasion(id, b);
  }
  removeOccasion(id: string) {
    return this.catalog.removeOccasion(id);
  }

  // admin — styles
  adminListStyles() {
    return this.catalog.listStyles(false);
  }
  createStyle(b: StyleInput) {
    return this.catalog.createStyle(b);
  }
  updateStyle(id: string, b: Partial<StyleInput>) {
    return this.catalog.updateStyle(id, b);
  }
  removeStyle(id: string) {
    return this.catalog.removeStyle(id);
  }

  // admin — boxes
  adminListBoxes(page?: number, perPage?: number, search?: string) {
    return this.boxes.listForAdmin(page ?? 1, perPage ?? 24, search);
  }
  adminGetBox(id: string) {
    return this.boxes.getById(id);
  }
  createBox(b: BoxInput) {
    return this.boxes.create(b);
  }
  updateBox(id: string, b: Partial<BoxInput>) {
    return this.boxes.update(id, b);
  }
  removeBox(id: string) {
    return this.boxes.remove(id);
  }
}
