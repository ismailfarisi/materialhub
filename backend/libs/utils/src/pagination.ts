export interface CursorData {
  sortField: string;
  sortValue: string;
  id: string;
}

export function encodeCursor(sortField: string, sortValue: string, id: string): string {
  const raw = JSON.stringify({ sortField, sortValue, id });
  return Buffer.from(raw).toString("base64url");
}

export function decodeCursor(cursor: string): CursorData | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.sortField === "string" &&
      typeof parsed.sortValue === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as CursorData;
    }
    return null;
  } catch {
    return null;
  }
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
