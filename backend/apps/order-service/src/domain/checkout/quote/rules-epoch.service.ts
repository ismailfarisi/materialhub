import type { RulesEpoch } from "@materialhub/database";
import type { Repository } from "typeorm";

export class RulesEpochService {
  constructor(private repo: Repository<RulesEpoch>) {}

  async get(): Promise<number> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return row ? Number(row.epoch) : 0;
  }
}
