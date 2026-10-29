import type {
  Coupon,
  CouponCategory,
  CouponExcludedProduct,
  CouponProduct,
  CouponUserRestriction,
  CouponVendor,
} from "@materialhub/database";
import { BadRequestError, ConflictError, NotFoundError } from "@materialhub/plugins";
// coupon-admin.service.ts
import type { DataSource, EntityManager, Repository } from "typeorm";

interface ListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: "active" | "scheduled" | "expired" | "disabled";
  type?: string;
  vendor_id?: string;
}

interface CouponPayload {
  code?: string;
  name?: string;
  description?: string | null;
  type?: string;
  applicable_to?: string;
  vendor_id?: string | null;
  collection_id?: string | null;
  discount_value?: number;
  max_discount_amount?: number | null;
  currency?: string;
  minimum_order_amount?: number | null;
  minimum_quantity?: number | null;
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
  is_single_use?: boolean;
  is_public?: boolean;
  first_order_only?: boolean;
  new_users_only?: boolean;
  buy_quantity?: number | null;
  get_quantity?: number | null;
  get_discount_percentage?: number | null;
  product_ids?: string[];
  category_ids?: string[];
  vendor_ids?: string[];
  excluded_product_ids?: string[];
  user_restriction_ids?: string[];
  created_by?: string | null;
}

export class CouponAdminService {
  constructor(
    private dataSource: DataSource,
    private couponRepo: Repository<Coupon>,
    private couponProductRepo: Repository<CouponProduct>,
    private couponCategoryRepo: Repository<CouponCategory>,
    private couponVendorRepo: Repository<CouponVendor>,
    private couponExcludedProductRepo: Repository<CouponExcludedProduct>,
    private couponUserRestrictionRepo: Repository<CouponUserRestriction>,
  ) {}

  async list(
    filters: ListFilters,
  ): Promise<{ items: Coupon[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const now = new Date();

    const qb = this.couponRepo
      .createQueryBuilder("coupon")
      .leftJoinAndSelect("coupon.couponProducts", "couponProducts")
      .leftJoinAndSelect("coupon.couponCategories", "couponCategories")
      .leftJoinAndSelect("coupon.couponVendors", "couponVendors")
      .leftJoinAndSelect("coupon.couponExcludedProducts", "couponExcludedProducts")
      .leftJoinAndSelect("coupon.couponUserRestrictions", "couponUserRestrictions")
      .where("coupon.deleted_at IS NULL");

    if (filters.search) {
      qb.andWhere("(coupon.code ILIKE :search OR coupon.name ILIKE :search)", {
        search: `%${filters.search}%`,
      });
    }

    if (filters.type) {
      qb.andWhere("coupon.type = :type", { type: filters.type });
    }

    if (filters.vendor_id) {
      qb.andWhere("coupon.vendor_id = :vendor_id", { vendor_id: filters.vendor_id });
    }

    if (filters.status) {
      switch (filters.status) {
        case "active":
          qb.andWhere("coupon.is_active = true")
            .andWhere("(coupon.starts_at IS NULL OR coupon.starts_at <= :now)", { now })
            .andWhere("(coupon.expires_at IS NULL OR coupon.expires_at > :now)", { now });
          break;
        case "scheduled":
          qb.andWhere("coupon.is_active = true")
            .andWhere("coupon.starts_at IS NOT NULL")
            .andWhere("coupon.starts_at > :now", { now });
          break;
        case "expired":
          qb.andWhere("coupon.expires_at IS NOT NULL").andWhere("coupon.expires_at <= :now", {
            now,
          });
          break;
        case "disabled":
          qb.andWhere("coupon.is_active = false");
          break;
      }
    }

    qb.orderBy("coupon.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findById(id: string): Promise<Coupon> {
    const coupon = await this.couponRepo
      .createQueryBuilder("coupon")
      .leftJoinAndSelect("coupon.couponProducts", "couponProducts")
      .leftJoinAndSelect("coupon.couponCategories", "couponCategories")
      .leftJoinAndSelect("coupon.couponVendors", "couponVendors")
      .leftJoinAndSelect("coupon.couponExcludedProducts", "couponExcludedProducts")
      .leftJoinAndSelect("coupon.couponUserRestrictions", "couponUserRestrictions")
      .leftJoinAndSelect("coupon.usages", "usages")
      .where("coupon.id = :id", { id })
      .andWhere("coupon.deleted_at IS NULL")
      .getOne();

    if (!coupon) throw new NotFoundError("Coupon not found");
    return coupon;
  }

  async create(payload: CouponPayload): Promise<Coupon> {
    if (payload.applicable_to === "specific_collection" && !payload.collection_id) {
      throw new BadRequestError(
        "collection_id is required when applicable_to is specific_collection",
      );
    }
    // free_shipping coupons carry no amount; every other type must have one.
    if (payload.discount_value == null && payload.type !== "free_shipping") {
      throw new BadRequestError("discount_value is required for this coupon type");
    }
    return this.dataSource.transaction(async (manager) => {
      const couponData: Partial<Coupon> = {
        code: payload.code?.toUpperCase(),
        name: payload.name || payload.code,
        description: payload.description ?? null,
        type: payload.type as any,
        applicable_to: payload.applicable_to as any,
        vendor_id: payload.vendor_id ?? null,
        collection_id: payload.collection_id ?? null,
        discount_value: payload.discount_value ?? 0,
        max_discount_amount: payload.max_discount_amount ?? null,
        currency: payload.currency ?? "AED",
        minimum_order_amount: payload.minimum_order_amount ?? null,
        minimum_quantity: payload.minimum_quantity ?? null,
        usage_limit: payload.usage_limit ?? null,
        usage_limit_per_user: payload.usage_limit_per_user ?? null,
        starts_at: payload.starts_at ? new Date(payload.starts_at) : null,
        expires_at: payload.expires_at ? new Date(payload.expires_at) : null,
        is_active: payload.is_active ?? true,
        is_single_use: payload.is_single_use ?? false,
        is_public: payload.is_public ?? true,
        first_order_only: payload.first_order_only ?? false,
        new_users_only: payload.new_users_only ?? false,
        buy_quantity: payload.buy_quantity ?? null,
        get_quantity: payload.get_quantity ?? null,
        get_discount_percentage: payload.get_discount_percentage ?? null,
        created_by: payload.created_by ?? null,
      };

      let coupon: Coupon;
      try {
        coupon = (await manager.save(
          manager.create(this.couponRepo.target as any, couponData),
        )) as Coupon;
      } catch (err: any) {
        if (err?.code === "23505" || err?.message?.includes("unique")) {
          throw new ConflictError(`Coupon with code "${couponData.code}" already exists`);
        }
        throw err;
      }

      await this.syncPivots(manager, coupon.id, payload);
      return coupon;
    });
  }

  async update(id: string, payload: CouponPayload): Promise<Coupon> {
    return this.dataSource.transaction(async (manager) => {
      const coupon = (await manager.findOne(this.couponRepo.target as any, {
        where: { id, deleted_at: null as any },
      })) as Coupon | null;
      if (!coupon) throw new NotFoundError("Coupon not found");

      const updateFields: Partial<Coupon> = {};
      if (payload.code !== undefined) updateFields.code = payload.code.toUpperCase();
      if (payload.name !== undefined) updateFields.name = payload.name;
      if (payload.description !== undefined) updateFields.description = payload.description ?? null;
      if (payload.type !== undefined) updateFields.type = payload.type as any;
      if (payload.applicable_to !== undefined)
        updateFields.applicable_to = payload.applicable_to as any;
      if ("collection_id" in payload) updateFields.collection_id = payload.collection_id ?? null;
      if (payload.applicable_to === "specific_collection") {
        const resolvedCollectionId =
          "collection_id" in payload ? payload.collection_id : coupon.collection_id;
        if (!resolvedCollectionId) {
          throw new BadRequestError(
            "collection_id is required when applicable_to is specific_collection",
          );
        }
      }
      if ("vendor_id" in payload) updateFields.vendor_id = payload.vendor_id ?? null;
      if (payload.discount_value !== undefined)
        updateFields.discount_value = payload.discount_value;
      if ("max_discount_amount" in payload)
        updateFields.max_discount_amount = payload.max_discount_amount ?? null;
      if (payload.currency !== undefined) updateFields.currency = payload.currency!;
      if ("minimum_order_amount" in payload)
        updateFields.minimum_order_amount = payload.minimum_order_amount ?? null;
      if ("minimum_quantity" in payload)
        updateFields.minimum_quantity = payload.minimum_quantity ?? null;
      if ("usage_limit" in payload) updateFields.usage_limit = payload.usage_limit ?? null;
      if ("usage_limit_per_user" in payload)
        updateFields.usage_limit_per_user = payload.usage_limit_per_user ?? null;
      if ("starts_at" in payload)
        updateFields.starts_at = payload.starts_at ? new Date(payload.starts_at) : null;
      if ("expires_at" in payload)
        updateFields.expires_at = payload.expires_at ? new Date(payload.expires_at) : null;
      if (payload.is_active !== undefined) updateFields.is_active = payload.is_active;
      if (payload.is_single_use !== undefined) updateFields.is_single_use = payload.is_single_use;
      if (payload.is_public !== undefined) updateFields.is_public = payload.is_public;
      if (payload.first_order_only !== undefined)
        updateFields.first_order_only = payload.first_order_only;
      if (payload.new_users_only !== undefined)
        updateFields.new_users_only = payload.new_users_only;
      if ("buy_quantity" in payload) updateFields.buy_quantity = payload.buy_quantity ?? null;
      if ("get_quantity" in payload) updateFields.get_quantity = payload.get_quantity ?? null;
      if ("get_discount_percentage" in payload)
        updateFields.get_discount_percentage = payload.get_discount_percentage ?? null;

      Object.assign(coupon, updateFields);

      let saved: Coupon;
      try {
        saved = await manager.save(coupon);
      } catch (err: any) {
        if (err?.code === "23505" || err?.message?.includes("unique")) {
          throw new ConflictError(`Coupon with code "${updateFields.code}" already exists`);
        }
        throw err;
      }

      await this.syncPivots(manager, id, payload);
      return saved;
    });
  }

  async delete(id: string): Promise<void> {
    const coupon = await this.couponRepo.findOne({ where: { id } } as any);
    if (!coupon) throw new NotFoundError("Coupon not found");
    await this.couponRepo.softRemove(coupon);
  }

  private async syncPivots(
    manager: EntityManager,
    couponId: string,
    payload: CouponPayload,
  ): Promise<void> {
    if (payload.product_ids !== undefined) {
      await manager.delete(this.couponProductRepo.target as any, { coupon_id: couponId });
      if (payload.product_ids.length > 0) {
        await manager.insert(
          this.couponProductRepo.target as any,
          payload.product_ids.map((product_id) => ({ coupon_id: couponId, product_id })),
        );
      }
    }

    if (payload.category_ids !== undefined) {
      await manager.delete(this.couponCategoryRepo.target as any, { coupon_id: couponId });
      if (payload.category_ids.length > 0) {
        await manager.insert(
          this.couponCategoryRepo.target as any,
          payload.category_ids.map((category_id) => ({ coupon_id: couponId, category_id })),
        );
      }
    }

    if (payload.vendor_ids !== undefined) {
      await manager.delete(this.couponVendorRepo.target as any, { coupon_id: couponId });
      if (payload.vendor_ids.length > 0) {
        await manager.insert(
          this.couponVendorRepo.target as any,
          payload.vendor_ids.map((vendor_id) => ({ coupon_id: couponId, vendor_id })),
        );
      }
    }

    if (payload.excluded_product_ids !== undefined) {
      await manager.delete(this.couponExcludedProductRepo.target as any, { coupon_id: couponId });
      if (payload.excluded_product_ids.length > 0) {
        await manager.insert(
          this.couponExcludedProductRepo.target as any,
          payload.excluded_product_ids.map((product_id) => ({ coupon_id: couponId, product_id })),
        );
      }
    }

    if (payload.user_restriction_ids !== undefined) {
      await manager.delete(this.couponUserRestrictionRepo.target as any, { coupon_id: couponId });
      if (payload.user_restriction_ids.length > 0) {
        await manager.insert(
          this.couponUserRestrictionRepo.target as any,
          payload.user_restriction_ids.map((user_id) => ({ coupon_id: couponId, user_id })),
        );
      }
    }
  }
}
