import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// Public storefront availability for one service offering (by slug). No auth —
// the PDP availability picker calls this. Registered public in jwt-auth
// (isRead + /services/) and routed to booking-service in the gateway proxy.
export const availabilityPublicRoutes = new Elysia({ prefix: "/services" }).use(container).get(
  "/:slug/availability",
  // biome-ignore lint/suspicious/noExplicitAny: container context is loosely typed
  async ({ params, query, availabilityController, set }: any) => {
    set.headers["cache-control"] = "public, max-age=60";
    return ok(await availabilityController.getBySlug(params.slug, query));
  },
  {
    params: t.Object({ slug: t.String() }),
    query: t.Object({
      location: t.Optional(t.String()),
      area: t.Optional(t.String()),
      staff: t.Optional(t.String()),
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
    }),
  },
);
