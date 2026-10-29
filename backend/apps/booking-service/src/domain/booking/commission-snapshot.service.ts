import { type Category, CommissionType, type SiteSetting, type Vendor } from "@materialhub/database";
import { maxCommissionForNet } from "@materialhub/utils";
import type { Repository } from "typeorm";

const FALLBACK_COMMISSION_RATE = 10; // 10%, mirrors order-service's CommissionService default.
const GLOBAL_RATE_KEY = "global_commission_rate";

export interface CommissionSnapshotInput {
  vendorId: string;
  categoryId: string | null;
  // Net-of-VAT base the commission is computed on (mirrors
  // CommissionService.createForOrderItemInTx's `netExVat`).
  netAmountFils: number;
}

export interface CommissionSnapshotResult {
  rate: number;
  amountFils: number;
  // The resolved precedence branch (percentage | fixed | tiered — tiered
  // rows still charge a percentage-shaped rate, see the amountFils calc
  // below). Review fix: previously only {rate, amountFils} were returned,
  // which is why the accrual endpoint had to hardcode
  // commission_type="percentage" for every booking row. Surfaced here so
  // callers can snapshot it (see BookingService.create -> booking.commission_type).
  type: CommissionType;
}

/**
 * Booking-time commission snapshot (Phase 4 Task 5; spec §5.3 "Commission
 * snapshotted at booking, accrued into the vendor_payout pipeline on
 * completed"; entity comment on `bookings.commission_rate`/`commission_fils`).
 *
 * order-service's CommissionService
 * (apps/order-service/src/domain/commission/commission.service.ts) owns the
 * canonical precedence — vendor tier > vendor flat rate > category > global
 * default (`global_commission_rate` site setting, fallback 10%) — but it is
 * an app-local class, not exported from a shared lib, and Phase 4 Task 2's
 * internal order-service routes cover payments only (no internal
 * "resolve rate" endpoint exists to call instead). booking-service and
 * order-service share ONE Postgres via `@materialhub/database`, so this reads
 * the SAME `Vendor` / `Category` / `SiteSetting` rows CommissionService reads
 * and mirrors its `resolveRate` + `calculateAmount` logic verbatim (same
 * precedence, same rounding), rather than adding a network hop for a pure
 * read that already lives in the shared DB.
 *
 * CONCERN (see Task 5 report): this is a deliberate, minimal duplication of
 * CommissionService's precedence logic — a drift risk if that precedence
 * changes without updating both copies. Task 9 (commission accrual on
 * `completed`) should extract a shared `resolveCommissionRate` into a lib
 * both services import, rather than each carrying its own copy.
 */
export class CommissionSnapshotService {
  constructor(
    private readonly vendorRepo: Repository<Vendor>,
    private readonly categoryRepo: Repository<Category>,
    private readonly siteSettingRepo: Repository<SiteSetting>,
  ) {}

  async resolve(input: CommissionSnapshotInput): Promise<CommissionSnapshotResult> {
    const vendor = await this.vendorRepo.findOne({ where: { id: input.vendorId } });
    const category = input.categoryId
      ? await this.categoryRepo.findOne({ where: { id: input.categoryId } })
      : null;
    const globalDefault = await this.getGlobalDefaultRate();

    let type: CommissionType;
    let rate: number;

    const tiers =
      (vendor?.commission_tiers as
        | { minAmount: number; maxAmount?: number; rate: number }[]
        | null) ?? null;
    if (vendor?.commission_type === CommissionType.tiered && tiers?.length) {
      const tier = tiers.find(
        (t) =>
          input.netAmountFils >= t.minAmount &&
          (t.maxAmount == null || input.netAmountFils <= t.maxAmount),
      );
      type = CommissionType.tiered;
      rate = tier?.rate ?? globalDefault;
    } else if (vendor?.commission_type && vendor.commission_value != null) {
      type = vendor.commission_type;
      rate = Number(vendor.commission_value);
    } else if (category?.commission_rate != null) {
      type = CommissionType.percentage;
      rate = Number(category.commission_rate);
    } else {
      type = CommissionType.percentage;
      rate = globalDefault;
    }

    const rawAmountFils =
      type === CommissionType.fixed
        ? Math.min(rate, input.netAmountFils)
        : Math.round(input.netAmountFils * (rate / 100));

    // R4-I6: the THIRD path that produces a commission amount, and the one
    // the shared ceiling had never been applied to. A booking commission
    // flows through the same payout pipeline as an order commission
    // (order-service's createForBookingInTx inserts it, the settlement job
    // matures it, computePayoutTotals pays it), so an uncapped fixed fee at
    // or above the net produced `vendor_earning = -round(0.05 * commission)`
    // — a NEGATIVE earning that subtracts from every other commission in
    // that vendor's payout. `maxCommissionForNet` is the same ceiling
    // order-service's creation and recompute paths use, from the same
    // module (@materialhub/utils), so the three cannot drift apart again.
    const amountFils = Math.min(rawAmountFils, maxCommissionForNet(input.netAmountFils));

    return { rate, amountFils, type };
  }

  private async getGlobalDefaultRate(): Promise<number> {
    const setting = await this.siteSettingRepo.findOne({ where: { key: GLOBAL_RATE_KEY } });
    return setting ? Number(setting.value) : FALLBACK_COMMISSION_RATE;
  }
}
