import { jwtAuth } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";
import { withGuestSession } from "../lib/guest-session.derive.ts";

/**
 * POST /reels/attributions/merge
 *
 * Invoked by the web client after a successful login. Reads the guest
 * session token from `x-guest-session` (attached automatically by the
 * axios interceptor), resolves it to `guest_sessions.id`, and backfills
 * `user_id` on all anonymous `reel_attributions` and `reel_views` rows.
 *
 * Idempotent — re-invoking with the same (session, user) pair is a no-op.
 * Returns 200 with zero work if the user has no attached guest session.
 */
export const attributionMergeRoutes = new Elysia({ prefix: "/reels/attributions" })
  .use(container)
  .use(jwtAuth)
  .use(withGuestSession)
  .post("/merge", async ({ userId, guestSessionId, attributionMergeService }: any) => {
    if (!userId) {
      return {
        statusCode: 401,
        error: "authentication_required",
        timestamp: new Date().toISOString(),
      };
    }
    if (guestSessionId) {
      await attributionMergeService.mergeGuestToUser(guestSessionId, userId);
    }
    return { statusCode: 200, timestamp: new Date().toISOString() };
  });
