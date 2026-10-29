// booking-query.service.ts
//
// Read side of the customer booking APIs (Phase 4 Task 8). Kept separate from
// BookingService (the write/transaction side) mirroring order-service's
// OrderQueryService/OrderService split. Both methods scope to
// `customer_user_id = customerId` so one customer can never read another
// customer's booking — getById returns null (route maps to 404) rather than
// throwing, matching order-service's OrderQueryService.getById convention.
import type { Booking } from "@materialhub/database";
import type { Repository } from "typeorm";

export interface ListBookingsQuery {
  page?: number;
  limit?: number;
  status?: string;
}

export interface AdminListBookingsQuery {
  page?: number;
  limit?: number;
  status?: string;
  vendorId?: string;
  staffMemberId?: string;
  locationId?: string;
  from?: string;
  to?: string;
  search?: string;
}

// The admin cross-vendor surface is the whole point of these reads (an admin
// looking at a list of bookings needs to know whose booking each row is), but
// `bookings.vendor_id` is a plain uuid with no relation to `Vendor` (the
// service/vendor-service boundary is deliberately kept loose — see
// booking.entity.ts). So the admin reads join `vendors` by raw table name,
// same pattern as brief.service.ts's `listOpenBriefsPublic`, and select only
// `vendor.name` (the field product-service's admin joins already use for
// display — see product.service.ts / postgres-search.adapter.ts) rather than
// `business_name`.
export type AdminBookingWithVendor = Booking & { vendor_name: string | null };

export class BookingQueryService {
  constructor(private readonly bookingRepo: Repository<Booking>) {}

  async list(
    customerId: string,
    query: ListBookingsQuery,
  ): Promise<{ data: Booking[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.bookingRepo
      .createQueryBuilder("booking")
      .where("booking.customer_user_id = :customerId", { customerId })
      .orderBy("booking.starts_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("booking.status = :status", { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getById(bookingId: string, customerId: string): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder("booking")
      .where("booking.id = :bookingId", { bookingId })
      .andWhere("booking.customer_user_id = :customerId", { customerId })
      .getOne();
  }

  // ─── Admin (cross-vendor) reads ──────────────────────────────────────
  // Deliberately separate methods rather than an optional customerId on
  // list()/getById(): the customer-scoped path must have no code path that can
  // be called without its scoping. Platform staff act on any booking by id, in
  // the same posture as manage-booking.routes.ts's admin no-show.

  async adminList(
    query: AdminListBookingsQuery,
  ): Promise<{ data: AdminBookingWithVendor[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.bookingRepo
      .createQueryBuilder("booking")
      .leftJoin("vendors", "vendor", "vendor.id = booking.vendor_id")
      .addSelect("vendor.name", "vendor_name")
      .orderBy("booking.starts_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("booking.status = :status", { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere("booking.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    if (query.staffMemberId) {
      qb.andWhere("booking.staff_member_id = :staffMemberId", {
        staffMemberId: query.staffMemberId,
      });
    }
    if (query.locationId) {
      qb.andWhere("booking.location_id = :locationId", { locationId: query.locationId });
    }
    if (query.from) {
      qb.andWhere("booking.starts_at >= :from", { from: query.from });
    }
    if (query.to) {
      qb.andWhere("booking.starts_at <= :to", { to: query.to });
    }
    if (query.search) {
      qb.andWhere("booking.booking_number ILIKE :search", { search: `%${query.search}%` });
    }

    // getManyAndCount() only hydrates entities — the raw `vendor_name`
    // addSelect above isn't attached to a Booking's own columns, so it needs
    // getRawAndEntities() instead, same as the count: a plain getCount() (no
    // skip/take) matches getManyAndCount()'s pagination-ignoring count.
    const [{ entities, raw }, total] = await Promise.all([qb.getRawAndEntities(), qb.getCount()]);
    const data = entities.map((booking, i) => ({
      ...booking,
      vendor_name: raw[i]?.vendor_name ?? null,
    }));
    return { data, total };
  }

  async adminGetById(bookingId: string): Promise<AdminBookingWithVendor | null> {
    const { entities, raw } = await this.bookingRepo
      .createQueryBuilder("booking")
      .leftJoin("vendors", "vendor", "vendor.id = booking.vendor_id")
      .addSelect("vendor.name", "vendor_name")
      .where("booking.id = :bookingId", { bookingId })
      .getRawAndEntities();

    if (!entities[0]) return null;
    return { ...entities[0], vendor_name: raw[0]?.vendor_name ?? null };
  }
}
