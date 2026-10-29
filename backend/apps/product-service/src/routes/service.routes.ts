import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// Public storefront read of a published service offering (GET /services/:slug).
// Vendor management lives under /vendor/services and stays gated.
export const serviceRoutes = new Elysia({ prefix: "/services" })
  .use(container)
  .get(
    // Public LIST endpoint — must be registered FIRST so a bare `/services`
    // is never captured by the dynamic `/:slug` route below.
    "/",
    async ({ query, serviceOfferingController, set }) => {
      const data = await serviceOfferingController.searchPublic({
        query: query.q,
        area: query.area,
        category: query.category,
        visit: query.visit,
        minPrice: query.min_price,
        maxPrice: query.max_price,
        minDuration: query.min_duration,
        maxDuration: query.max_duration,
        minRating: query.min_rating,
        paymentMode: query.payment_mode,
        sortBy: query.sort,
        page: query.page,
        limit: query.limit,
      });
      // Short cache, matching the service-detail posture below. Listing is
      // availability-independent, so a stale minute is harmless.
      set.headers["cache-control"] = "public, max-age=60";
      return {
        statusCode: 200,
        data: data.data,
        total: data.total,
        page: data.page,
        limit: data.limit,
        facets: data.facets,
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        area: t.Optional(t.String()),
        category: t.Optional(t.String()),
        visit: t.Optional(t.Union([t.Literal("at_premises"), t.Literal("home_visit")])),
        min_price: t.Optional(t.Numeric({ minimum: 0 })),
        max_price: t.Optional(t.Numeric({ minimum: 0 })),
        min_duration: t.Optional(t.Numeric({ minimum: 0 })),
        max_duration: t.Optional(t.Numeric({ minimum: 0 })),
        min_rating: t.Optional(t.Numeric({ minimum: 0, maximum: 5 })),
        payment_mode: t.Optional(
          t.Union([t.Literal("prepay"), t.Literal("deposit"), t.Literal("pay_at_venue")]),
        ),
        sort: t.Optional(
          t.Union([
            t.Literal("price_asc"),
            t.Literal("price_desc"),
            t.Literal("rating"),
            t.Literal("newest"),
          ]),
        ),
        // Bounded like `limit`: Typesense rejects a search past its own
        // page ceiling, and that error is not an HttpError subclass, so an
        // unbounded `?page=` collapses to a 500 instead of a 422.
        page: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
      }),
    },
  )
  .get(
    // Static path — must be registered before the dynamic `/:slug` route
    // below so `by-id` is never captured as a slug value (mirrors the
    // `/vendor/booking/staff/eligible` vs `/:id` ordering precedent in
    // booking-service). Public id-keyed counterpart to `/:slug`, added for
    // the storefront reschedule flow (Task 3): a Booking row only carries
    // service_offering_id, not a slug.
    "/by-id/:id",
    async ({ params, serviceOfferingController, set }) => {
      const data = await serviceOfferingController.getPublicById(params.id);
      set.headers["cache-control"] = "public, max-age=300";
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get(
    "/:slug",
    async ({ params, serviceOfferingController, set }) => {
      const data = await serviceOfferingController.getPublicBySlug(params.slug);
      // Match the catalog caching posture (service detail is short-cached).
      set.headers["cache-control"] = "public, max-age=300";
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  );
