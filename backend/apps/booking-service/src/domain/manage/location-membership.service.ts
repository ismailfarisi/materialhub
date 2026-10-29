// location-membership.service.ts
//
// Task 0B (Phase 7) — HTTP CRUD for `location_memberships` (grant/list/revoke a
// per-location managing role). Before this, the table/entity/guard logic
// existed (assertLocationManager consumes it) but a per-location role could
// only be granted by a direct DB write — there was no route for an admin UI to
// call (recon gotcha #8).
//
// ── Authorization (binding, stricter than the other manage routes) ───────────
// ALL three operations require the outer `vendorMembership("products.write")`
// gate AND a vendor-wide `owner`/`manager` role. A location-admin must NOT
// manage memberships — otherwise a per-location manager could self-grant or
// escalate another branch's access (privilege escalation). This is why the
// check is `isVendorManagerRole` (owner/manager only), NOT `assertLocationManager`
// (which a location-admin passes for their own branch). The target location
// must belong to the active vendor (404 otherwise).
//
// ── Grant is a SUBSET of vendor membership (binding) ─────────────────────────
// POST rejects a `user_id` that isn't an ACTIVE vendor_members row of the same
// vendor (422) — a location grant can only ever narrow an existing vendor
// member to a branch, never be a backdoor that admits a non-member into the
// vendor.
//
// ── Duplicate handling (binding — find-then-write, NOT repo.upsert) ───────────
// Keyed on (vendor_location_id, user_id). A bare `repo.upsert(..., ["...","..."])`
// emits an ON CONFLICT that does NOT match this table's partial unique index
// (`WHERE deleted_at IS NULL`) and 500s (the documented TypeORM partial-index
// gotcha). So POST does a find-then-write inside a transaction: an existing
// ACTIVE row is updated in place; a soft-deleted row is reactivated
// (deleted_at -> null, role updated); only a genuinely-new (location,user) pair
// inserts. The active row is preferred over any soft-deleted history so
// restoring never races the partial unique index into two live rows.
import {
  LocationMembership,
  type User,
  type VendorLocation,
  type VendorMember,
  VendorMemberStatus,
} from "@materialhub/database";
import type { LocationMembershipRow, MyLocationMembershipRow } from "@materialhub/dto";
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from "@materialhub/plugins";
import { In, type Repository } from "typeorm";
import { isVendorManagerRole } from "../../guards/location-scope.ts";

export interface LocationMembershipActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface CreateLocationMembershipInput {
  userId: string;
  role: string;
}

export class LocationMembershipService {
  constructor(
    private readonly locationRepo: Repository<VendorLocation>,
    private readonly membershipRepo: Repository<LocationMembership>,
    private readonly vendorMemberRepo: Repository<VendorMember>,
    private readonly userRepo: Repository<User>,
  ) {}

  // owner/manager only (privilege-escalation guard) + the location must belong
  // to the active vendor. Shared by all three operations; returns nothing (it's
  // a pure gate).
  private async assertOwnerManagerOfLocation(
    actor: LocationMembershipActor,
    locationId: string,
  ): Promise<void> {
    if (!isVendorManagerRole(actor.role)) {
      throw new ForbiddenError("Only an owner or manager can manage location memberships");
    }
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location || location.vendor_id !== actor.vendorId) {
      throw new NotFoundError("Location not found");
    }
  }

  // GET /manage/my-location-memberships (Task 7 fix cycle, Important #2) — a
  // SELF-scoped read: the caller's OWN active location_membership rows for
  // the active vendor. Unlike list()/create()/delete() above, this is NOT
  // gated by `isVendorManagerRole` — it only ever reveals grants the actor
  // already holds, so there's no privilege-escalation surface to guard
  // against (mirrors why assertLocationManager itself needs no separate
  // "may you ask" check). Owner/manager callers get `[]`: they pass every
  // location vendor-wide via isVendorManagerRole and never need a row to
  // prove it, so a query would just be wasted work.
  async listMine(actor: LocationMembershipActor): Promise<MyLocationMembershipRow[]> {
    if (isVendorManagerRole(actor.role)) return [];

    // Soft-deleted rows are excluded by TypeORM's default find() (@DeleteDateColumn).
    const memberships = await this.membershipRepo.find({ where: { user_id: actor.userId } });
    if (memberships.length === 0) return [];

    // Cross-check each membership's location still belongs to the ACTIVE
    // vendor (defense in depth, same shape as getManagedLocationIds in
    // location-scope.ts) — a membership row for a location under a different
    // vendor (e.g. the user also works for another vendor) must never leak
    // into this vendor's response.
    const locationIds = [...new Set(memberships.map((m) => m.vendor_location_id))];
    const locations = await this.locationRepo.find({ where: { id: In(locationIds) } });
    const ownLocationIds = new Set(
      locations.filter((l) => l.vendor_id === actor.vendorId).map((l) => l.id),
    );

    return memberships
      .filter((m) => ownLocationIds.has(m.vendor_location_id))
      .map((m) => ({ location_id: m.vendor_location_id, role: m.role }));
  }

  async list(actor: LocationMembershipActor, locationId: string): Promise<LocationMembershipRow[]> {
    await this.assertOwnerManagerOfLocation(actor, locationId);

    // Active rows only (soft-deleted excluded by TypeORM's default).
    const memberships = await this.membershipRepo.find({
      where: { vendor_location_id: locationId },
      order: { created_at: "ASC" },
    });
    if (memberships.length === 0) return [];

    // One batched users lookup for display name + email; a missing user row
    // yields nulls, never a thrown error.
    const userIds = [...new Set(memberships.map((m) => m.user_id))];
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ["id", "first_name", "last_name", "email"],
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return memberships.map((m) => this.toRow(m, userById));
  }

  async create(
    actor: LocationMembershipActor,
    locationId: string,
    input: CreateLocationMembershipInput,
  ): Promise<LocationMembershipRow> {
    await this.assertOwnerManagerOfLocation(actor, locationId);

    // The target must be an ACTIVE vendor member of THIS vendor — a location
    // grant is a subset of vendor membership, never a backdoor into the vendor.
    const vendorMember = await this.vendorMemberRepo.findOne({
      where: {
        vendor_id: actor.vendorId,
        user_id: input.userId,
        status: VendorMemberStatus.active,
      },
    });
    if (!vendorMember) {
      throw new UnprocessableEntityError(
        "User is not an active member of this vendor — grant vendor membership first",
      );
    }

    // find-then-write keyed (vendor_location_id, user_id), in a transaction —
    // NOT repo.upsert (the partial-unique-index ON CONFLICT gotcha).
    const membership = await this.membershipRepo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(LocationMembership);

      // Prefer an ACTIVE row; only if none exists look at soft-deleted history
      // (reactivating a soft-deleted row while an active one exists would race
      // the partial unique index into two live rows).
      let row =
        (await txRepo.findOne({
          where: { vendor_location_id: locationId, user_id: input.userId },
        })) ??
        (await txRepo.findOne({
          where: { vendor_location_id: locationId, user_id: input.userId },
          withDeleted: true,
        }));

      if (row) {
        row.role = input.role;
        row.deleted_at = null; // reactivate if it was soft-deleted (no-op if active)
        return txRepo.save(row);
      }

      row = txRepo.create({
        vendor_location_id: locationId,
        user_id: input.userId,
        role: input.role,
      });
      return txRepo.save(row);
    });

    // Resolve the granted user's display fields for the response (single row).
    const user = await this.userRepo.findOne({
      where: { id: input.userId },
      select: ["id", "first_name", "last_name", "email"],
    });
    const userById = new Map(user ? [[user.id, user]] : []);
    return this.toRow(membership, userById);
  }

  async delete(
    actor: LocationMembershipActor,
    locationId: string,
    membershipId: string,
  ): Promise<{ deleted: true }> {
    await this.assertOwnerManagerOfLocation(actor, locationId);

    // Scope the target to THIS location (a membership id for another location —
    // even one this owner/manager could otherwise see — is a 404 here, not a
    // cross-location delete). Active rows only.
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, vendor_location_id: locationId },
    });
    if (!membership) throw new NotFoundError("Location membership not found");

    await this.membershipRepo.softDelete({ id: membershipId });
    return { deleted: true };
  }

  private toRow(
    membership: LocationMembership,
    userById: Map<string, Pick<User, "id" | "first_name" | "last_name" | "email">>,
  ): LocationMembershipRow {
    const user = userById.get(membership.user_id);
    const name = user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || null : null;
    return {
      id: membership.id,
      vendor_location_id: membership.vendor_location_id,
      user_id: membership.user_id,
      role: membership.role,
      permissions: membership.permissions ?? [],
      user_name: name,
      user_email: user?.email ?? null,
      created_at: toIso(membership.created_at),
      updated_at: toIso(membership.updated_at),
    };
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
