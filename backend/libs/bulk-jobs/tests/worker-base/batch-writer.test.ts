import { describe, expect, mock, test } from "bun:test";
import { BatchWriter } from "../../src/worker-base/batch-writer.ts";

function makeFakeDataSource() {
  const committed: string[] = [];
  const rolledBack: string[] = [];
  let nextTxId = 0;
  const transaction = mock(async (cb: (m: unknown) => Promise<unknown>) => {
    const id = String(nextTxId++);
    try {
      const result = await cb({ manager: id });
      committed.push(id);
      return result;
    } catch (e) {
      rolledBack.push(id);
      throw e;
    }
  });
  return {
    ds: { transaction } as unknown as import("typeorm").DataSource,
    committed,
    rolledBack,
  };
}

describe("BatchWriter", () => {
  test("commits a batch and surfaces returned result", async () => {
    const { ds, committed } = makeFakeDataSource();
    const writer = new BatchWriter(ds);
    const result = await writer.run(async () => ({ succeeded: [1, 2], skipped: [] }));
    expect(result.succeeded).toEqual([1, 2]);
    expect(committed).toHaveLength(1);
  });

  test("rolls back and rethrows on callback error", async () => {
    const { ds, committed, rolledBack } = makeFakeDataSource();
    const writer = new BatchWriter(ds);
    await expect(
      writer.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(rolledBack).toHaveLength(1);
    expect(committed).toHaveLength(0);
  });
});
