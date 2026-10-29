import { AppDataSource } from "@materialhub/database";

export interface IVendorLookup {
  findVendorIdByUserId(userId: string): Promise<string | null>;
}

/**
 * Phase 3a+: resolves the vendor id for any user via their vendor_members row.
 * Works for owners AND added staff (managers/staff/viewer). Returns null when
 * the user has no active membership.
 *
 * Phase 3b: vendor.user_id was dropped; the only path now is vendor_members.
 */
export class VendorLookupService implements IVendorLookup {
  async findVendorIdByUserId(userId: string): Promise<string | null> {
    const rows = (await AppDataSource.query(
      `SELECT vendor_id FROM vendor_members
        WHERE user_id = $1
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY role = 'owner' DESC, created_at ASC
        LIMIT 1`,
      [userId],
    )) as Array<{ vendor_id: string }>;
    return rows[0]?.vendor_id ?? null;
  }
}
