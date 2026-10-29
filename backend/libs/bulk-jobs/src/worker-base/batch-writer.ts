import type { DataSource, EntityManager } from "typeorm";

export class BatchWriter {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(cb: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => cb(manager));
  }
}
