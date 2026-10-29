export interface CircuitInput {
  failures: number[]; // ms timestamps
  now: number;
  windowMs: number;
  threshold: number;
}

export interface CircuitResult {
  tripped: boolean;
  count: number;
  degradedUntil?: number;
}

const COOLDOWN_MS = 10 * 60_000;

export function evaluateCircuit(input: CircuitInput): CircuitResult {
  const cutoff = input.now - input.windowMs;
  const recent = input.failures.filter((t) => t >= cutoff);
  if (recent.length >= input.threshold) {
    return { tripped: true, count: recent.length, degradedUntil: input.now + COOLDOWN_MS };
  }
  return { tripped: false, count: recent.length };
}
