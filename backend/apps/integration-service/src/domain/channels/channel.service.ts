import {
  type ChannelDelivery,
  type ChannelFeedRun,
  type SalesChannel,
  SalesChannelCode,
} from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { EncryptionService } from "@materialhub/utils";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";

const CHANNEL_CODES = new Set<string>(Object.values(SalesChannelCode));

/**
 * True when `code` is a member of `sales_channels_code_enum`. Querying the
 * enum column with anything else makes Postgres raise 22P02, so callers must
 * reject unknown codes before they reach the repository.
 */
export function isSalesChannelCode(code: unknown): code is SalesChannelCode {
  return typeof code === "string" && CHANNEL_CODES.has(code);
}

export interface ChannelView {
  id: string;
  code: string;
  display_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  feed_url: string | null;
  feed_format: string;
  delta_enabled: boolean;
  last_full_feed_at: Date | null;
  last_full_feed_status: string | null;
  last_delta_success_at: Date | null;
  degraded_until: Date | null;
  has_credentials: boolean;
}

export interface ChannelStats {
  runs: { ok: number; fail: number; skipped: number };
  deliveries: { ok: number; fail: number; pct: number | null };
}

const UPDATABLE: (keyof SalesChannel)[] = [
  "display_name",
  "is_enabled",
  "config",
  "feed_format",
  "delta_enabled",
];

function toView(row: SalesChannel): ChannelView {
  return {
    id: row.id,
    code: row.code,
    display_name: row.display_name,
    is_enabled: row.is_enabled,
    config: row.config ?? {},
    feed_url: row.feed_url,
    feed_format: row.feed_format,
    delta_enabled: row.delta_enabled,
    last_full_feed_at: row.last_full_feed_at,
    last_full_feed_status: row.last_full_feed_status,
    last_delta_success_at: row.last_delta_success_at,
    degraded_until: row.degraded_until,
    has_credentials: !!row.credentials_encrypted,
  };
}

export class ChannelService {
  constructor(
    private repo: Repository<SalesChannel>,
    private encryption: EncryptionService,
  ) {}

  async list(): Promise<ChannelView[]> {
    const rows = await this.repo.find({ where: { deleted_at: null as any } });
    return rows.map(toView).sort((a, b) => a.code.localeCompare(b.code));
  }

  async getByCode(code: string): Promise<ChannelView | null> {
    const row = await this.findRow(code);
    return row ? toView(row) : null;
  }

  async update(code: string, patch: Partial<SalesChannel>): Promise<ChannelView | null> {
    const row = await this.findRow(code);
    if (!row) return null;
    for (const key of UPDATABLE) {
      if (patch[key] !== undefined) {
        (row as unknown as Record<string, unknown>)[key] = patch[key];
      }
    }
    const saved = await this.repo.save(row);
    return toView(saved);
  }

  async setCredentials(code: string, creds: Record<string, unknown>): Promise<boolean> {
    const row = await this.findRow(code);
    if (!row) return false;
    row.credentials_encrypted = this.encryption.encryptObject(creds);
    await this.repo.save(row);
    return true;
  }

  async listRecentRuns(
    code: string,
    limit: number,
    runRepo: Repository<ChannelFeedRun>,
  ): Promise<ChannelFeedRun[]> {
    const channel = await this.findRow(code);
    if (!channel) return [];
    return runRepo.find({
      where: { channel_id: channel.id } as unknown as Record<string, unknown>,
      order: { created_at: "DESC" } as unknown as Record<string, "DESC">,
      take: Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 10)),
    });
  }

  async listRecentDeliveries(
    code: string,
    limit: number,
    deliveryRepo: Repository<ChannelDelivery>,
  ): Promise<ChannelDelivery[]> {
    const channel = await this.findRow(code);
    if (!channel) return [];
    return deliveryRepo.find({
      where: { channel_id: channel.id } as unknown as Record<string, unknown>,
      order: { created_at: "DESC" } as unknown as Record<string, "DESC">,
      take: Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20)),
    });
  }

  async stats24h(
    code: string,
    runRepo: Repository<ChannelFeedRun>,
    deliveryRepo: Repository<ChannelDelivery>,
  ): Promise<ChannelStats> {
    const channel = await this.findRow(code);
    const zero: ChannelStats = {
      runs: { ok: 0, fail: 0, skipped: 0 },
      deliveries: { ok: 0, fail: 0, pct: null },
    };
    if (!channel) return zero;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const runRows = await runRepo
      .createQueryBuilder("r")
      .select("r.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("r.channel_id = :id", { id: channel.id })
      .andWhere("r.created_at >= :since", { since })
      .groupBy("r.status")
      .getRawMany();

    const deliveryRows = await deliveryRepo
      .createQueryBuilder("d")
      .select("d.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("d.channel_id = :id", { id: channel.id })
      .andWhere("d.created_at >= :since", { since })
      .groupBy("d.status")
      .getRawMany();

    const runCount = (s: string) => Number(runRows.find((r) => r.status === s)?.count ?? 0);
    const delCount = (s: string) => Number(deliveryRows.find((r) => r.status === s)?.count ?? 0);

    const dOk = delCount("success");
    const dFail = delCount("failed");
    const dTotal = dOk + dFail;

    return {
      runs: { ok: runCount("success"), fail: runCount("failed"), skipped: runCount("skipped") },
      deliveries: {
        ok: dOk,
        fail: dFail,
        pct: dTotal === 0 ? null : Math.round((dOk / dTotal) * 100),
      },
    };
  }

  async enqueueRebuild(code: string, queue: Queue): Promise<{ jobId: string }> {
    const channel = await this.findRow(code);
    if (!channel) throw new NotFoundError("Sales channel not found");
    // jobId is unique enough that two same-second manual rebuilds get distinct
    // BullMQ jobs (microsecond noise via toString(36) is fine — collisions don't
    // corrupt anything since the worker handler is idempotent on the channel).
    // "_" not ":" — BullMQ reserves ":" in custom ids.
    const jobId = `manual_${code}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await queue.add(
      `feed-build:${code}:manual`,
      { channelCode: code, trigger: "manual" },
      { jobId, removeOnComplete: 100, removeOnFail: 100 },
    );
    return { jobId };
  }

  /** Internal — returns the raw row including encrypted credentials. */
  private async findRow(code: string): Promise<SalesChannel | null> {
    if (!isSalesChannelCode(code)) return null;
    return this.repo.findOne({ where: { code, deleted_at: null as any } });
  }
}
