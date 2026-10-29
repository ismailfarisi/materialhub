import { Elysia } from "elysia";
import { container } from "../container.ts";

/** Public: the open-brief board (logged-out creators discover briefs to bid on). */
export const licensingBriefsPublicRoutes = new Elysia({ prefix: "/reels" }).use(container).get(
  "/briefs/open",
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  async ({ briefService }: any) => {
    const data = await briefService.listOpenBriefsPublic();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
);
