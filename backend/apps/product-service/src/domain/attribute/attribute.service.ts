import {
  AppDataSource,
  Attribute,
  AttributeFilterInputType,
  AttributeTranslation,
  AttributeValue,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { In } from "typeorm";

export class AttributeService {
  private get repo() {
    return AppDataSource.getRepository(Attribute);
  }
  private get valueRepo() {
    return AppDataSource.getRepository(AttributeValue);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(AttributeTranslation);
  }

  async create(data: {
    name: string;
    type: string;
    is_filterable?: boolean;
    is_searchable?: boolean;
    is_required?: boolean;
    is_variant?: boolean;
    is_groupable?: boolean;
    filter_input_type?: AttributeFilterInputType | null;
    ar_label?: string | null;
    // biome-ignore lint/suspicious/noExplicitAny: validation is an open-ended JSON schema
    validation?: Record<string, any>;
  }) {
    let slug = generateSlug(data.name);
    const existing = await this.repo.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const isFilterable = data.is_filterable ?? false;
    const filterInputType = isFilterable ? (data.filter_input_type ?? null) : null;

    if (filterInputType === AttributeFilterInputType.color_swatch) {
      console.warn(
        `[attributes] ${slug}: filter_input_type=color_swatch but no values yet — add values with color_hex/swatch_image_url for swatches to render.`,
      );
    }

    const result = await this.repo.save(
      this.repo.create({
        name: data.name,
        slug,
        // biome-ignore lint/suspicious/noExplicitAny: AttributeType enum cast from string input
        type: data.type as any,
        is_filterable: isFilterable,
        is_searchable: data.is_searchable ?? false,
        is_required: data.is_required ?? false,
        is_variant: data.is_variant ?? false,
        is_groupable: data.is_groupable ?? false,
        filter_input_type: filterInputType,
        validation: data.validation ?? null,
      }),
    );
    if (data.ar_label !== undefined) await this.upsertArabicLabel(result.id, data.ar_label);
    return { ...result, ar_label: this.normalizeLabel(data.ar_label) };
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      is_filterable: boolean;
      is_searchable: boolean;
      is_required: boolean;
      is_variant: boolean;
      is_groupable: boolean;
      filter_input_type: AttributeFilterInputType | null;
      ar_label: string | null;
      // biome-ignore lint/suspicious/noExplicitAny: validation is an open-ended JSON schema
      validation: Record<string, any>;
    }>,
  ) {
    const attr = await this.repo.findOne({ where: { id } });
    if (!attr) throw new HttpError(404, "Attribute not found", "ATTRIBUTE_NOT_FOUND");
    const { ar_label, ...attrData } = data;
    Object.assign(attr, attrData);
    if (attr.is_filterable === false) {
      attr.filter_input_type = null;
    }
    const result = await this.repo.save(attr);
    if (ar_label !== undefined) await this.upsertArabicLabel(id, ar_label);
    return {
      ...result,
      ...(ar_label !== undefined ? { ar_label: this.normalizeLabel(ar_label) } : {}),
    };
  }

  private normalizeLabel(label: string | null | undefined) {
    const normalized = label?.trim();
    return normalized || null;
  }

  private async upsertArabicLabel(attributeId: string, label: string | null | undefined) {
    const existing = await this.translationRepo.findOne({
      where: { attribute_id: attributeId, locale: "ar" },
      withDeleted: true,
    });
    const name = this.normalizeLabel(label);

    if (!name) {
      if (existing) await this.translationRepo.remove(existing);
      return;
    }

    if (existing) {
      existing.name = name;
      existing.deleted_at = null;
      await this.translationRepo.save(existing);
      return;
    }

    await this.translationRepo.save(
      this.translationRepo.create({
        attribute_id: attributeId,
        locale: "ar",
        name,
      }),
    );
  }

  async remove(id: string) {
    const attr = await this.repo.findOne({ where: { id } });
    if (!attr) throw new HttpError(404, "Attribute not found", "ATTRIBUTE_NOT_FOUND");
    // Check if in use by any product_attribute_values
    const inUse = await AppDataSource.getRepository("ProductAttributeValue").count({
      where: { attribute_id: id },
    });
    if (inUse > 0) {
      throw new HttpError(409, "Cannot delete attribute in use by products", "ATTRIBUTE_IN_USE");
    }
    await this.repo.softRemove(attr);
  }

  async list(page = 1, limit = 20, type?: string) {
    const qb = this.repo.createQueryBuilder("a").where("a.deleted_at IS NULL");
    if (type) qb.andWhere("a.type = :type", { type });
    qb.orderBy("a.created_at", "DESC")
      .addOrderBy("a.name", "ASC")
      .skip((page - 1) * limit)
      .take(limit);
    const [attributes, total] = await qb.getManyAndCount();

    // Batch count values per attribute
    if (attributes.length > 0) {
      const ids = attributes.map((a) => a.id);
      const counts: { attribute_id: string; cnt: string }[] = await this.valueRepo
        .createQueryBuilder("av")
        .select("av.attribute_id", "attribute_id")
        .addSelect("COUNT(av.id)", "cnt")
        .where("av.attribute_id IN (:...ids)", { ids })
        .andWhere("av.deleted_at IS NULL")
        .groupBy("av.attribute_id")
        .getRawMany();

      const countMap = new Map(counts.map((c) => [c.attribute_id, Number(c.cnt)]));
      const arLabels = await this.loadArabicLabels(ids);
      const data = attributes.map((a) => ({
        ...a,
        ar_label: arLabels.get(a.id) ?? null,
        value_count: countMap.get(a.id) ?? 0,
      }));
      return { data, total, page, limit };
    }

    return {
      data: attributes.map((a) => ({ ...a, value_count: 0 })),
      total,
      page,
      limit,
    };
  }

  private async loadArabicLabels(attributeIds: string[]) {
    const rows = await this.translationRepo.find({
      where: { attribute_id: In(attributeIds), locale: "ar" },
    });
    return new Map(rows.map((row) => [row.attribute_id, row.name]));
  }

  async addValue(
    attributeId: string,
    data: {
      value: string;
      display_value?: string;
      color_hex?: string | null;
      swatch_image_url?: string | null;
    },
  ) {
    const attr = await this.repo.findOne({ where: { id: attributeId } });
    if (!attr) throw new HttpError(404, "Attribute not found", "ATTRIBUTE_NOT_FOUND");

    let slug = generateSlug(data.value);
    const existing = await this.valueRepo.findOne({
      where: { attribute_id: attributeId, slug },
      withDeleted: true,
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    return this.valueRepo.save(
      this.valueRepo.create({
        attribute_id: attributeId,
        value: data.value,
        slug,
        display_value: data.display_value ?? data.value,
        color_hex: data.color_hex ?? null,
        swatch_image_url: data.swatch_image_url ?? null,
      }),
    );
  }

  async updateValue(
    attributeId: string,
    valueId: string,
    data: Partial<{
      value: string;
      display_value: string;
      color_hex: string | null;
      swatch_image_url: string | null;
    }>,
  ) {
    const val = await this.valueRepo.findOne({
      where: { id: valueId, attribute_id: attributeId },
    });
    if (!val) throw new HttpError(404, "Attribute value not found", "VALUE_NOT_FOUND");
    Object.assign(val, data);
    return this.valueRepo.save(val);
  }

  async removeValue(attributeId: string, valueId: string) {
    const val = await this.valueRepo.findOne({
      where: { id: valueId, attribute_id: attributeId },
    });
    if (!val) throw new HttpError(404, "Attribute value not found", "VALUE_NOT_FOUND");
    await this.valueRepo.softRemove(val);
  }

  async findById(id: string) {
    const attr = await this.repo.findOne({
      where: { id },
      relations: ["values"],
    });
    if (!attr) throw new HttpError(404, "Attribute not found", "ATTRIBUTE_NOT_FOUND");
    return attr;
  }

  async getVariantAttributes(attributeIds: string[]) {
    return this.repo.find({
      where: attributeIds.map((id) => ({ id, is_variant: true })),
      relations: ["values"],
    });
  }
}
