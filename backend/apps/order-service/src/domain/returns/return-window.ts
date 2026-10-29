const RETURN_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

type ErrorCtor = new (message: string) => Error;

export function assertWithinReturnWindow(
  deliveredAt: Date | string | null | undefined,
  now = new Date(),
  ErrorClass: ErrorCtor = Error,
): void {
  if (!deliveredAt) return;

  const deliveredTime = new Date(deliveredAt).getTime();
  if (!Number.isFinite(deliveredTime)) return;

  const expiresAt = deliveredTime + RETURN_WINDOW_DAYS * MS_PER_DAY;
  if (now.getTime() > expiresAt) {
    throw new ErrorClass("Return window has expired");
  }
}
