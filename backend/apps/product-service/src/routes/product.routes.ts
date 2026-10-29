import type { VendorMemberRole } from "@materialhub/database";
import { ProductEditorial } from "@materialhub/dto";
import { jwtAuth, permissionMatrix, vendorMembership } from "@materialhub/guards";
import { NotFoundError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import {
  ProductCreateInventoryInput,
  ProductSeoInput,
  VendorStatusInput,
} from "./product-input.schemas.ts";

const ProductAttributeInput = t.Object({
  attribute_id: t.String({ format: "uuid" }),
  value_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  text_value: t.Optional(t.Nullable(t.String())),
});

export const productRoutes = new Elysia({ prefix: "/products" })
  .use(container)

  // ─── Health Check ───────────────────────────────────────────────────
  .get("/health", () => ({
    status: "ok",
    service: "product-service",
    timestamp: new Date().toISOString(),
  }))

  // ─── Public Routes ──────────────────────────────────────────────────
  .get(
    "/suggest",
    async ({ query, suggestService }) => {
      const data = await suggestService.suggest(query.q || "", query.limit ?? 5);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 20 })),
      }),
    },
  )

  .get("/", async ({ query, productController, headers }: any) => {
    const data = await productController.search({
      ...query,
      locale: query.locale ?? headers?.["accept-language"],
    });
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .get(
    "/flash-deals",
    async ({
      query,
      flashDealController,
    }: {
      query: { vendor_id?: string; category?: string; limit?: number | string };
      flashDealController: {
        listPublic: (filters: {
          vendor_id?: string;
          category?: string;
          limit?: number;
        }) => Promise<unknown>;
      };
    }) => {
      const data = await flashDealController.listPublic({
        vendor_id: query.vendor_id,
        category: query.category,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String()),
        category: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
      }),
    },
  )

  .get(
    "/by-slug/:slug",
    async ({ params, productController }) => {
      const data = await productController.getBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  .get(
    "/by-slug/:slug/group",
    async ({ params, productController }) => {
      const data = await productController.getGroupBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  .get(
    "/by-slug/:slug/media",
    async ({ params, productController, mediaController }: any) => {
      const product = await productController.getBySlug(params.slug);
      if (!product) throw new NotFoundError("Product not found");
      const data = await mediaController.getProductMedia(product.id);
      data.items = data.items.filter((i: any) => i.kind === "image" || i.status === "ready");
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String({ minLength: 1 }) }) },
  )

  .get(
    "/:id",
    async ({ params, productController }) => {
      const data = await productController.getById(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .get(
    "/:id/questions",
    async ({ params, productController }) => {
      const data = await productController.listQuestions(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Authenticated: Ask a Question ─────────────────────────────────
  .use(jwtAuth)

  .post(
    "/:id/questions",
    async ({ params, body, user, productController, set }) => {
      const data = await productController.askQuestion(params.id, user!.id, body.question);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ question: t.String({ minLength: 1 }) }),
    },
  )

  // ─── Vendor-Only Routes ─────────────────────────────────────────────
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // permission-aware `vendorMembership(...)` guards. Routes are split into
  // permission groups (read / publish / write).
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.read"))
      .get("/mine", async ({ query, member, productController }: any) => {
        const data = await productController.listByVendor(member.vid, query);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      }),
  )

  .guard({}, (app) =>
    app.use(vendorMembership("products.publish")).patch(
      "/:id/publish",
      async ({ params, member, productController }: any) => {
        const data = await productController.publish(params.id, member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      { params: t.Object({ id: t.String({ format: "uuid" }) }) },
    ),
  )

  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        async ({ body, member, productController, set }: any) => {
          const { base_price, weight, ...rest } = body;
          const data = await productController.create(member.vid, {
            ...rest,
            price: base_price,
            ...(weight !== undefined ? { weight_grams: weight } : {}),
          });
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 500 }),
            description: t.Optional(t.String()),
            short_description: t.Optional(t.String()),
            rich_description: t.Optional(t.String()),
            ingredients: t.Optional(t.String()),
            usage_instructions: t.Optional(t.String()),
            category_id: t.String({ format: "uuid" }),
            brand_id: t.Optional(t.String({ format: "uuid" })),
            base_price: t.Number({ minimum: 0 }),
            compare_at_price: t.Optional(t.Number({ minimum: 0 })),
            cost_price: t.Optional(t.Number({ minimum: 0 })),
            sku: t.Optional(t.String()),
            barcode: t.Optional(t.String()),
            weight: t.Optional(t.Number({ minimum: 0 })),
            weight_grams: t.Optional(t.Number({ minimum: 0 })),
            dimensions_cm: t.Optional(
              t.Object({
                length: t.Number({ minimum: 0 }),
                width: t.Number({ minimum: 0 }),
                height: t.Number({ minimum: 0 }),
              }),
            ),
            country_of_origin: t.Optional(t.String()),
            is_digital: t.Optional(t.Boolean()),
            is_customizable: t.Optional(t.Boolean()),
            tags: t.Optional(t.Array(t.String())),
            attributes: t.Optional(t.Array(ProductAttributeInput)),
            editorial: t.Optional(t.Union([ProductEditorial, t.Null()])),
            status: VendorStatusInput,
            ...ProductSeoInput,
            ...ProductCreateInventoryInput,
          }),
        },
      )

      .patch(
        "/:id",
        async ({ params, body, member, productController }: any) => {
          const { base_price, weight, ...rest } = body;
          const payload = {
            ...rest,
            ...(base_price !== undefined ? { price: base_price } : {}),
            ...(weight !== undefined ? { weight_grams: weight } : {}),
          };
          const data = await productController.update(params.id, member.vid, payload);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
            description: t.Optional(t.String()),
            short_description: t.Optional(t.String()),
            rich_description: t.Optional(t.String()),
            ingredients: t.Optional(t.String()),
            usage_instructions: t.Optional(t.String()),
            category_id: t.Optional(t.String({ format: "uuid" })),
            brand_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
            base_price: t.Optional(t.Number({ minimum: 0 })),
            compare_at_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            cost_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            sku: t.Optional(t.String()),
            barcode: t.Optional(t.String()),
            weight: t.Optional(t.Number({ minimum: 0 })),
            weight_grams: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            dimensions_cm: t.Optional(
              t.Nullable(
                t.Object({
                  length: t.Number({ minimum: 0 }),
                  width: t.Number({ minimum: 0 }),
                  height: t.Number({ minimum: 0 }),
                }),
              ),
            ),
            country_of_origin: t.Optional(t.String()),
            is_digital: t.Optional(t.Boolean()),
            is_customizable: t.Optional(t.Boolean()),
            tags: t.Optional(t.Array(t.String())),
            attributes: t.Optional(t.Array(ProductAttributeInput)),
            editorial: t.Optional(t.Union([ProductEditorial, t.Null()])),
            status: VendorStatusInput,
            ...ProductSeoInput,
          }),
        },
      )

      .delete(
        "/:id",
        async ({ params, member, productController }: any) => {
          await productController.remove(params.id, member.vid);
          return {
            statusCode: 200,
            message: "Product deleted",
            timestamp: new Date().toISOString(),
          };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )

      .post(
        "/bulk-action",
        async ({ body, member, productController, set }: any) => {
          // Outer guard is products.write; publish-bulk still requires products.publish.
          if (
            body.action === "publish" &&
            !permissionMatrix.has(member.r as VendorMemberRole, "products.publish")
          ) {
            set.status = 403;
            return {
              statusCode: 403,
              error: "INSUFFICIENT_VENDOR_PERMISSION",
              message: `Role ${member.r} lacks products.publish`,
              timestamp: new Date().toISOString(),
            };
          }
          const data = await productController.bulkAction(member.vid, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            action: t.Union([t.Literal("archive"), t.Literal("publish"), t.Literal("delete")]),
            ids: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
          }),
        },
      )

      // ─── Images ─────────────────────────────────────────────────────────
      .post(
        "/:id/images",
        async ({ params, body, member, productController, set }: any) => {
          const data = await productController.addImage(params.id, member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            url: t.String(),
            alt_text: t.Optional(t.String()),
            is_primary: t.Optional(t.Boolean()),
          }),
        },
      )

      .patch(
        "/:id/images/reorder",
        async ({ params, body, member, productController }: any) => {
          await productController.reorderImages(params.id, member.vid, body.items);
          return {
            statusCode: 200,
            message: "Images reordered",
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            items: t.Array(
              t.Object({ id: t.String({ format: "uuid" }), sort_order: t.Number({ minimum: 0 }) }),
            ),
          }),
        },
      )

      .delete(
        "/:id/images/:imageId",
        async ({ params, member, productController }: any) => {
          await productController.removeImage(params.id, member.vid, params.imageId);
          return { statusCode: 200, message: "Image deleted", timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
        },
      )

      // ─── Unified Media ───────────────────────────────────────────────────
      .get(
        "/:id/media",
        async ({ params, mediaController }: any) => {
          const data = await mediaController.getProductMedia(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )

      .patch(
        "/:id/media/reorder",
        async ({ params, body, member, mediaController }: any) => {
          await mediaController.reorderMediaInternal(params.id, member.vid, body.items);
          return { statusCode: 200, message: "Reordered", timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            items: t.Array(
              t.Object({
                id: t.String({ format: "uuid" }),
                kind: t.Union([t.Literal("image"), t.Literal("video")]),
                sort_order: t.Number({ minimum: 0 }),
              }),
            ),
          }),
        },
      )

      .patch(
        "/:id/images/:imageId",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.updateImageInternal(
            params.id,
            params.imageId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
          body: t.Object({
            alt_text: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
            focal_x: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
            focal_y: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
            variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
          }),
        },
      )

      .post(
        "/:id/images/:imageId/crop",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.cropImageInternal(
            params.id,
            params.imageId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
          body: t.Object({
            crop: t.Object({
              x: t.Number({ minimum: 0, maximum: 1 }),
              y: t.Number({ minimum: 0, maximum: 1 }),
              w: t.Number({ minimum: 0, maximum: 1 }),
              h: t.Number({ minimum: 0, maximum: 1 }),
            }),
            rotation_degrees: t.Optional(t.Number({ minimum: -360, maximum: 360 })),
          }),
        },
      )

      .post(
        "/:id/images/:imageId/replace",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.replaceImageInternal(
            params.id,
            params.imageId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
          body: t.Object({ key: t.String({ minLength: 1 }) }),
        },
      )

      .post(
        "/:id/videos/presign",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.presignVideoInternal(params.id, member.vid, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            filename: t.String({ minLength: 1 }),
            content_type: t.String({ minLength: 1 }),
            size_bytes: t.Number({ minimum: 1 }),
          }),
        },
      )

      .post(
        "/:id/videos/process",
        async ({ params, body, member, mediaController, set }: any) => {
          const data = await mediaController.processVideoInternal(params.id, member.vid, body);
          set.status = 202;
          return { statusCode: 202, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ key: t.String({ minLength: 1 }) }),
        },
      )

      .patch(
        "/:id/videos/:videoId",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.updateVideoInternal(
            params.id,
            params.videoId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            videoId: t.String({ format: "uuid" }),
          }),
          body: t.Object({ variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))) }),
        },
      )

      .delete(
        "/:id/videos/:videoId",
        async ({ params, member, mediaController }: any) => {
          await mediaController.deleteVideoInternal(params.id, params.videoId, member.vid);
          return { statusCode: 200, message: "Video deleted", timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            videoId: t.String({ format: "uuid" }),
          }),
        },
      )

      .post(
        "/:id/images/:imageId/enhance",
        async ({ params, member, mediaController }: any) => {
          const data = await mediaController.enhanceImageInternal(
            params.id,
            params.imageId,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
        },
      )

      .post(
        "/:id/images/:imageId/enhance/accept",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.acceptAiEnhanceInternal(
            params.id,
            params.imageId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
          body: t.Object({ candidate_id: t.String({ format: "uuid" }) }),
        },
      )

      .post(
        "/:id/images/:imageId/enhance/reject",
        async ({ params, body, member, mediaController }: any) => {
          const data = await mediaController.rejectAiEnhanceInternal(
            params.id,
            params.imageId,
            body,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
          body: t.Object({ candidate_id: t.String({ format: "uuid" }) }),
        },
      )

      .post(
        "/:id/images/:imageId/revert",
        async ({ params, member, mediaController }: any) => {
          const data = await mediaController.revertAiEnhanceInternal(
            params.id,
            params.imageId,
            member.vid,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            imageId: t.String({ format: "uuid" }),
          }),
        },
      )

      // ─── Variants ───────────────────────────────────────────────────────
      .post(
        "/:id/variants",
        async ({ params, body, member, productController, set }: any) => {
          const data = await productController.generateVariants(params.id, member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            options: t.Optional(
              t.Array(
                t.Object({
                  attribute_id: t.String({ format: "uuid" }),
                  values: t.Array(t.String(), { minItems: 1 }),
                }),
                { minItems: 1 },
              ),
            ),
            variants: t.Optional(
              t.Array(
                t.Object({
                  option_values: t.Record(t.String(), t.String()),
                  name: t.Optional(t.String()),
                  price: t.Number({ minimum: 0 }),
                  compare_at_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
                  cost_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
                  sku: t.Optional(t.String()),
                  barcode: t.Optional(t.Nullable(t.String())),
                  quantity_on_hand: t.Optional(t.Number({ minimum: 0 })),
                }),
                { minItems: 1 },
              ),
            ),
          }),
        },
      )

      .patch(
        "/:id/variants/:variantId",
        async ({ params, body, productController }) => {
          const data = await productController.updateVariant(params.id, params.variantId, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            variantId: t.String({ format: "uuid" }),
          }),
          body: t.Object({
            price: t.Optional(t.Number({ minimum: 0 })),
            compare_at_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            cost_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            sku: t.Optional(t.String()),
            barcode: t.Optional(t.Nullable(t.String())),
            weight_grams: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
            dimensions_cm: t.Optional(
              t.Nullable(
                t.Object({
                  length: t.Number({ minimum: 0 }),
                  width: t.Number({ minimum: 0 }),
                  height: t.Number({ minimum: 0 }),
                }),
              ),
            ),
            sort_order: t.Optional(t.Number({ minimum: 0 })),
            is_active: t.Optional(t.Boolean()),
          }),
        },
      )

      .delete(
        "/:id/variants/:variantId",
        async ({ params, productController }) => {
          await productController.removeVariant(params.id, params.variantId);
          return {
            statusCode: 200,
            message: "Variant deleted",
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            variantId: t.String({ format: "uuid" }),
          }),
        },
      )

      // ─── Relations ──────────────────────────────────────────────────────
      .post(
        "/:id/relations",
        async ({ params, body, productController, set }) => {
          const data = await productController.addRelation(params.id, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            related_product_id: t.String({ format: "uuid" }),
            type: t.String({ minLength: 1 }),
            sort_order: t.Optional(t.Number({ minimum: 0 })),
          }),
        },
      )

      .delete(
        "/:id/relations/:relationId",
        async ({ params, productController }) => {
          await productController.removeRelation(params.id, params.relationId);
          return {
            statusCode: 200,
            message: "Relation removed",
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            relationId: t.String({ format: "uuid" }),
          }),
        },
      )

      // ─── Q&A Answer (vendor) ────────────────────────────────────────────
      .post(
        "/:id/questions/:questionId/answer",
        async ({ params, body, user, productController }: any) => {
          const data = await productController.answerQuestion(
            params.id,
            params.questionId,
            user!.id,
            body.answer,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            questionId: t.String({ format: "uuid" }),
          }),
          body: t.Object({ answer: t.String({ minLength: 1 }) }),
        },
      )

      // ─── Bundles ────────────────────────────────────────────────────────
      .post(
        "/:id/bundle",
        async ({ params, body, productController, set }: any) => {
          const data = await productController.createBundle(params.id, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            items: t.Array(
              t.Object({
                product_id: t.String({ format: "uuid" }),
                quantity: t.Number({ minimum: 1 }),
              }),
              { minItems: 1 },
            ),
            discount_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
          }),
        },
      )

      .patch(
        "/:id/bundle",
        async ({ params, body, productController }) => {
          const data = await productController.updateBundle(params.id, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            items: t.Optional(
              t.Array(
                t.Object({
                  product_id: t.String({ format: "uuid" }),
                  quantity: t.Number({ minimum: 1 }),
                }),
              ),
            ),
            discount_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
          }),
        },
      )

      .delete(
        "/:id/bundle",
        async ({ params, productController }) => {
          await productController.removeBundle(params.id);
          return {
            statusCode: 200,
            message: "Bundle removed",
            timestamp: new Date().toISOString(),
          };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  );
