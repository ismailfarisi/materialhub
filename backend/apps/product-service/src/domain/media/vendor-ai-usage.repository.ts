import { AppDataSource, VendorAiUsage } from "@materialhub/database";

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class VendorAiUsageRepository {
  private get repo() {
    return AppDataSource.getRepository(VendorAiUsage);
  }

  async getMonthCount(vendorId: string): Promise<number> {
    const row = await this.repo.findOne({
      where: { vendor_id: vendorId, month: currentMonth() },
    });
    return row?.count ?? 0;
  }

  async increment(vendorId: string): Promise<void> {
    const month = currentMonth();
    await AppDataSource.query(
      `INSERT INTO vendor_ai_usage (vendor_id, month, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (vendor_id, month) DO UPDATE SET count = vendor_ai_usage.count + 1`,
      [vendorId, month],
    );
  }

  async decrement(vendorId: string): Promise<void> {
    const month = currentMonth();
    await AppDataSource.query(
      `UPDATE vendor_ai_usage SET count = GREATEST(count - 1, 0)
       WHERE vendor_id = $1 AND month = $2`,
      [vendorId, month],
    );
  }
}
