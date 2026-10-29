export function resolvePath(ctx: unknown, path: string): unknown {
  if (ctx === null || ctx === undefined) return null;
  const segments = path.split(".");
  let current: unknown = ctx;
  for (const seg of segments) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current)) {
      const idx = Number.parseInt(seg, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= current.length) return null;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
      if (current === undefined) return null;
    } else {
      return null;
    }
  }
  return current ?? null;
}
