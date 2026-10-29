import { AppDataSource, Banner } from "@materialhub/database";
import type { BannerListQuery, CreateBannerBody, UpdateBannerBody } from "@materialhub/dto";
import { HttpError } from "@materialhub/plugins";
import type { FindOptionsWhere } from "typeorm";

export class BannerService {
  private get repo() {
    return AppDataSource.getRepository(Banner);
  }

  async list(query: BannerListQuery) {
    const { page = 1, limit = 20, placement, is_active } = query;
    const where: FindOptionsWhere<Banner> = {};
    if (placement) where.placement = placement;
    if (is_active !== undefined) where.is_active = is_active;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { sort_order: "ASC", created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getActive(placement: string, locale?: string) {
    const now = new Date();
    const qb = this.repo
      .createQueryBuilder("b")
      .where("b.deleted_at IS NULL")
      .andWhere("b.is_active = true")
      .andWhere("b.placement = :placement", { placement })
      .andWhere("(b.starts_at IS NULL OR b.starts_at <= :now)", { now })
      .andWhere("(b.expires_at IS NULL OR b.expires_at >= :now)", { now })
      .orderBy("b.sort_order", "ASC");

    if (locale) {
      qb.andWhere("(b.locale IS NULL OR b.locale = :locale)", { locale });
    }

    return qb.getMany();
  }

  async create(data: CreateBannerBody) {
    const banner = this.repo.create({
      ...data,
      starts_at: data.starts_at ? new Date(data.starts_at) : null,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
    });
    return this.repo.save(banner);
  }

  async update(id: string, data: UpdateBannerBody) {
    const banner = await this.repo.findOne({ where: { id } });
    if (!banner) throw new HttpError(404, "Banner not found", "BANNER_NOT_FOUND");

    const updateData: Partial<Banner> = { ...data } as any;
    if (data.starts_at !== undefined)
      updateData.starts_at = data.starts_at ? new Date(data.starts_at) : null;
    if (data.expires_at !== undefined)
      updateData.expires_at = data.expires_at ? new Date(data.expires_at) : null;

    Object.assign(banner, updateData);
    return this.repo.save(banner);
  }

  async remove(id: string) {
    const banner = await this.repo.findOne({ where: { id } });
    if (!banner) throw new HttpError(404, "Banner not found", "BANNER_NOT_FOUND");
    await this.repo.softRemove(banner);
  }
}
