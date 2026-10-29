import {
  CollabOpportunityStatus,
  CollabOpportunityType,
  CollabVisibility,
} from "@materialhub/database";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import {
  toVendorFacingApplication,
  toVendorFacingApplications,
} from "../domain/collab/serializers.ts";

const PREFIX = "/vendor/reels/collabs";

const ok = (data: unknown) => ({
  statusCode: 200,
  data,
  timestamp: new Date().toISOString(),
});

const deliverableSchema = t.Array(
  t.Object({
    kind: t.Union([
      t.Literal("reel"),
      t.Literal("story"),
      t.Literal("post"),
      t.Literal("appearance"),
    ]),
    count: t.Integer({ minimum: 1 }),
  }),
);

/** Nullable optional field: `t.Optional` alone rejects an explicit null. */
const nullable = <T extends ReturnType<typeof t.String>>(schema: T) =>
  t.Optional(t.Union([schema, t.Null()]));

const opportunityBody = {
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.String({ minLength: 1 }),
  visibility: t.Enum(CollabVisibility),
  deliverables: t.Optional(t.Union([deliverableSchema, t.Null()])),
  slotsTotal: t.Optional(t.Integer({ minimum: 1 })),
  applicationsCloseAt: nullable(t.String({ format: "date-time" })),
  deliverBy: nullable(t.String({ format: "date-time" })),
  minFollowerCount: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  requiredPlatforms: t.Optional(t.Union([t.Array(t.String()), t.Null()])),
  requiredCategories: t.Optional(t.Union([t.Array(t.String()), t.Null()])),
  rightsScope: nullable(t.String()),
  feeFils: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  fundingSource: nullable(t.String()),
  seededProductId: nullable(t.String({ format: "uuid" })),
  seededVariantId: nullable(t.String({ format: "uuid" })),
  seededQty: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  seedingValueFils: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  locationId: nullable(t.String({ format: "uuid" })),
  startsAt: nullable(t.String({ format: "date-time" })),
  endsAt: nullable(t.String({ format: "date-time" })),
};

const toDate = (v?: string | null) => (v == null ? (v as null | undefined) : new Date(v));

/** Dates arrive as ISO strings; the service takes Date objects. */
// biome-ignore lint/suspicious/noExplicitAny: request body typing follows the slice-1 route pattern
const coerceDates = (body: any) => ({
  ...body,
  applicationsCloseAt: toDate(body.applicationsCloseAt),
  deliverBy: toDate(body.deliverBy),
  startsAt: toDate(body.startsAt),
  endsAt: toDate(body.endsAt),
});

/**
 * Read-only vendor collab surface. Gated by `analytics.read`, matching the
 * shortlist/discovery routes — browsing your own collab pipeline is appropriate
 * for any read-capable member.
 */
const collabVendorReadRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("analytics.read"))
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get(
    "/",
    async ({ member, collabService, query }: any) => {
      const list = await collabService.listForVendor(member.vid, {
        status: query.status as CollabOpportunityStatus | undefined,
        type: query.type as CollabOpportunityType | undefined,
      });
      return ok(list);
    },
    {
      query: t.Object({
        status: t.Optional(t.Enum(CollabOpportunityStatus)),
        type: t.Optional(t.Enum(CollabOpportunityType)),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/:id", async ({ params, member, collabService }: any) => {
    const opportunity = await collabService.getOpportunity(params.id);
    if (opportunity.vendor_id !== member.vid) {
      return { statusCode: 404, data: null, timestamp: new Date().toISOString() };
    }
    const applications = await collabService.listApplicationsForOpportunity(member.vid, params.id);
    // Serializer, never the raw rows: it is what keeps the creator's address out
    // of a vendor response.
    return ok({ opportunity, applications: toVendorFacingApplications(applications) });
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/:id/events", async ({ params, member, collabService }: any) => {
    const opportunity = await collabService.getOpportunity(params.id);
    if (opportunity.vendor_id !== member.vid) {
      return { statusCode: 404, data: null, timestamp: new Date().toISOString() };
    }
    return ok(await collabService.listEvents(params.id));
  });

/**
 * Write surface. Gated by `bank.read` to match the licensing write group:
 * accepting a collab commits vendor funds for the paid types.
 *
 * `product_seeding` moves no money, so this is stricter than strictly necessary
 * for it. One guard per surface is easier to reason about than a per-type guard,
 * and a member who can seed product can already commit inventory.
 */
const collabVendorWriteRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("bank.read"))
  .post(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ body, member, collabService }: any) => {
      const opp = await collabService.createOpportunity({
        ...coerceDates(body),
        vendorId: member.vid,
        type: body.type,
      });
      return { statusCode: 201, data: opp, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ type: t.Enum(CollabOpportunityType), ...opportunityBody }) },
  )
  .patch(
    "/:id",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) =>
      ok(await collabService.updateOpportunity(member.vid, params.id, coerceDates(body))),
    {
      body: t.Partial(
        t.Object({ ...opportunityBody, visibility: t.Optional(t.Enum(CollabVisibility)) }),
      ),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/:id/publish", async ({ params, member, collabService }: any) =>
    ok(await collabService.publishOpportunity(member.vid, params.id)),
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/:id/cancel", async ({ params, member, collabService }: any) => {
    await collabService.cancelOpportunity(member.vid, params.id);
    return ok({ cancelled: true });
  })
  .post(
    "/:id/invite",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) =>
      ok(await collabService.invite(member.vid, params.id, body.creatorIds, body.note ?? null)),
    {
      body: t.Object({
        creatorIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
        // Optional personal note, delivered with the invite notification.
        note: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
      }),
    },
  )
  .post(
    "/:id/applications/:appId/ship",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) =>
      ok(
        toVendorFacingApplication(
          await collabService.markShipped(member.vid, params.appId, {
            carrier: body?.carrier ?? null,
            trackingNumber: body?.trackingNumber ?? null,
          }),
        ),
      ),
    {
      body: t.Optional(
        t.Object({
          carrier: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
          trackingNumber: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
        }),
      ),
    },
  )
  .post(
    "/:id/applications/:appId/accept",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, member, collabService }: any) =>
      ok(await collabService.acceptApplication(member.vid, params.appId)),
  )
  .post(
    "/:id/applications/:appId/decline",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) => {
      await collabService.declineApplication(member.vid, params.appId, body?.note ?? null);
      return ok({ declined: true });
    },
    { body: t.Optional(t.Object({ note: t.Optional(t.String()) })) },
  )
  .post(
    "/:id/applications/:appId/approve",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, member, collabService }: any) =>
      ok(await collabService.approveDelivery(member.vid, params.appId)),
  )
  .post(
    "/:id/applications/:appId/revise",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) =>
      ok(await collabService.requestRevision(member.vid, params.appId, body.note)),
    { body: t.Object({ note: t.String({ minLength: 1 }) }) },
  )
  .post(
    "/:id/applications/:appId/reject",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, collabService }: any) => {
      await collabService.rejectDelivery(member.vid, params.appId, body.note);
      return ok({ rejected: true });
    },
    { body: t.Object({ note: t.String({ minLength: 1 }) }) },
  );

export const collabVendorRoutes = new Elysia()
  .use(collabVendorReadRoutes)
  .use(collabVendorWriteRoutes);
