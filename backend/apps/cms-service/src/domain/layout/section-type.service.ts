import { AppDataSource, SectionType } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class SectionTypeService {
  private get repo() {
    return AppDataSource.getRepository(SectionType);
  }

  async list() {
    return this.repo.find({
      where: { is_active: true },
      order: { name: "ASC" },
    });
  }

  async listAll() {
    return this.repo.find({ order: { name: "ASC" } });
  }

  async create(data: {
    name: string;
    label: Record<string, string>;
    description?: string;
    icon?: string;
    settings_schema?: Record<string, unknown>;
    max_per_layout?: number;
    supports_bidding?: boolean;
    default_settings?: Record<string, unknown>;
  }) {
    const existing = await this.repo.findOne({ where: { name: data.name } });
    if (existing)
      throw new HttpError(409, "Section type name already exists", "DUPLICATE_SECTION_TYPE");

    const sectionType = this.repo.create(data);
    return this.repo.save(sectionType);
  }

  async update(
    id: string,
    data: Partial<{
      label: Record<string, string>;
      description: string;
      icon: string;
      settings_schema: Record<string, unknown>;
      max_per_layout: number;
      is_active: boolean;
      supports_bidding: boolean;
      default_settings: Record<string, unknown>;
    }>,
  ) {
    const sectionType = await this.repo.findOne({ where: { id } });
    if (!sectionType) throw new HttpError(404, "Section type not found", "SECTION_TYPE_NOT_FOUND");

    Object.assign(sectionType, data);
    return this.repo.save(sectionType);
  }
}
