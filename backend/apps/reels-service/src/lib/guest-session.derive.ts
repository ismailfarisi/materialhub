import { AppDataSource, GuestSession } from "@materialhub/database";
import { Elysia } from "elysia";

export function hashGuestSessionToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/**
 * Elysia plugin that exposes `{ userId, guestSessionId }` on the request context.
 * Depends on an upstream `jwtAuth` plugin having set `user` (may be null).
 * Resolves `x-guest-session` to a `guest_sessions.id` only when there is no
 * authenticated user — matches the cart/wishlist precedent.
 */
export const withGuestSession = new Elysia({ name: "reels-guest-session" }).derive(
  { as: "scoped" },
  async ({ request, user }: any) => {
    const userId: string | null = user?.id ?? null;
    let guestSessionId: string | null = null;
    const token = request.headers.get("x-guest-session");
    if (token && !userId) {
      const repo = AppDataSource.getRepository(GuestSession);
      const hash = hashGuestSessionToken(token);
      const session = await repo.findOne({ where: { session_token: hash } });
      if (session) guestSessionId = session.id;
    }
    return { userId, guestSessionId };
  },
);
