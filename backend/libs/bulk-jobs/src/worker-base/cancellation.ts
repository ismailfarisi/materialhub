export class CancellationChecker {
  private lastChecked = 0;
  private lastResult = false;

  constructor(
    private readonly check: () => Promise<boolean>,
    private readonly throttleMs = 2_000,
  ) {}

  async isCancelled(): Promise<boolean> {
    const now = Date.now();
    if (this.lastChecked !== 0 && now - this.lastChecked < this.throttleMs) {
      return this.lastResult;
    }
    this.lastChecked = now;
    this.lastResult = await this.check();
    return this.lastResult;
  }
}
