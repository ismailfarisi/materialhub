import type { RowError } from "../types/parsed-row.ts";

export class ErrorAccumulator {
  private readonly errors: RowError[] = [];

  push(err: RowError): void {
    this.errors.push(err);
  }

  pushAll(errs: Iterable<RowError>): void {
    for (const e of errs) this.errors.push(e);
  }

  list(): ReadonlyArray<RowError> {
    return this.errors;
  }

  count(): number {
    return this.errors.length;
  }

  hasAny(): boolean {
    return this.errors.length > 0;
  }

  rowsWithErrors(): Set<number> {
    return new Set(this.errors.map((e) => e.rowNumber));
  }
}
