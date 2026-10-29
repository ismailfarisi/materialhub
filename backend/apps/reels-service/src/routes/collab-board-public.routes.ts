import { Elysia } from "elysia";
import { container } from "../container.ts";

/**
 * The open collab opportunity board.
 *
 * Optional auth, NOT public: a signed-in creator's token populates `user` so
 * each row can carry an `eligibility` block; guests still get the listing
 * without one. Registering this as public instead would short-circuit with
 * `user = null` and silently make every row look ineligible.
 */
export const collabBoardPublicRoutes = new Elysia({ prefix: "/reels" }).use(container).get(
  "/collab-board",
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  async ({ user, collabService }: any) => {
    const data = await collabService.listBoard(user?.sub);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
);
