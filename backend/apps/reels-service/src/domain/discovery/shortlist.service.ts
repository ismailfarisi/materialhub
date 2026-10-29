import { AppDataSource, Reel, ReelStatus, ReelVendorShortlist } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";

export interface ShortlistInput {
  vendorId: string;
  reelId: string;
  savedByUserId: string;
  note?: string | null;
}

export class ShortlistService {
  private get repo() {
    return AppDataSource.getRepository(ReelVendorShortlist);
  }

  /** Idempotent save. Re-saving an active row updates the note; saving after an
   *  un-save inserts a fresh active row (the partial unique index only
   *  constrains rows WHERE deleted_at IS NULL). */
  async save(input: ShortlistInput): Promise<void> {
    const reel = await AppDataSource.getRepository(Reel).findOne({
      where: { id: input.reelId },
      withDeleted: false,
    });
    if (!reel || reel.status !== ReelStatus.approved) {
      throw new NotFoundError("reel_not_found_or_not_published");
    }
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ReelVendorShortlist)
      .values({
        vendor_id: input.vendorId,
        reel_id: input.reelId,
        saved_by_user_id: input.savedByUserId,
        note: input.note ?? null,
      })
      // ON CONFLICT (vendor_id, reel_id) WHERE deleted_at IS NULL DO UPDATE SET note=...
      .orUpdate(["note"], ["vendor_id", "reel_id"], {
        indexPredicate: "deleted_at IS NULL",
      })
      .execute();
  }

  /** Soft-delete the active shortlist row, if any. Idempotent. */
  async unsave(vendorId: string, reelId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(ReelVendorShortlist)
      .set({ deleted_at: () => "now()" })
      .where("vendor_id = :vendorId AND reel_id = :reelId AND deleted_at IS NULL", {
        vendorId,
        reelId,
      })
      .execute();
  }

  /** The vendor's active shortlist as reel_ids (most-recent first), bounded.
   *  The route hydrates these into full cards via DiscoveryService.cardsByIds. */
  async listReelIds(vendorId: string, limit = 60, offset = 0): Promise<string[]> {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit)) || 60));
    const safeOffset = Math.max(0, Math.trunc(Number(offset)) || 0);
    const rows: { reel_id: string }[] = await this.repo
      .createQueryBuilder("sl")
      .select("sl.reel_id", "reel_id")
      .where("sl.vendor_id = :vendorId AND sl.deleted_at IS NULL", { vendorId })
      .orderBy("sl.created_at", "DESC")
      .limit(safeLimit)
      .offset(safeOffset)
      .getRawMany();
    return rows.map((r) => r.reel_id);
  }
}
