// manual-booking.routes.ts
//
// Phase 6 Task 1 (spec off-platform capacity) — POST /manage/bookings.
// Vendor-scoped (NOT admin-only): gated by the SAME `vendorMembership
// ("products.write")` guard staff.routes.ts/location.routes.ts/
// availability-rule.routes.ts already use for booking-service's vendor
// management surface, plus the location-scoped `assertLocationManager` check
// (ManualBookingController.create) so a per-location manager can only record
// walk-ins for their own branch.
import type { EngagementKind } from "@materialhub/database";
import { CreateManualBookingBody } from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// `.use(jwtAuth)` is explicit here (unlike staff.routes.ts/location.routes.ts,
// which rely on jwtAuth's `{ as: "scoped" }` derive being pulled in by a
// sibling route module mounted in the same app.ts) so this route's auth
// doesn't depend on mount order elsewhere — harmless if Elysia's plugin
// dedup-by-name also hoists it from a sibling, matching how
// service-review.routes.ts's customer route and manage-booking.routes.ts
// both chain it explicitly ahead of their own role/permission guard.
export const manualBookingRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).post(
      "/bookings",
      // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
      async ({ body, user, member, manualBookingController, set }: any) => {
        const actor = { userId: user.id, vendorId: member.vid, role: member.r };
        const data = await manualBookingController.create(actor, {
          ...body,
          // The DTO's literal union ("walk_in" | "phone") carries the same
          // string values as EngagementKind — cast at this one boundary
          // rather than threading a plain-string type through the
          // controller/service/EngagementService.reserve chain.
          kind: body.kind as EngagementKind,
        });
        set.status = 201;
        return ok(data, 201);
      },
      { body: CreateManualBookingBody },
    ),
  );
