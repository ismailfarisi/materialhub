import { ProductEditorial } from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ProductAttributeInput = t.Object({
  attribute_id: t.String({ format: "uuid" }),
  value_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  text_value: t.Optional(t.Nullable(t.String())),
});

const ProductTranslationInput = t.Object({
  locale: t.String({ minLength: 2, maxLength: 10 }),
  name: t.String({ maxLength: 255 }),
  short_description: t.Optional(t.Nullable(t.String())),
  description: t.Optional(t.Nullable(t.String())),
  rich_description: t.Optional(t.Nullable(t.Record(t.String(), t.Unknown()))),
  ingredients: t.Optional(t.Nullable(t.String())),
  usage_instructions: t.Optional(t.Nullable(t.String())),
  meta_title: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  meta_description: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
});

export const adminProductRoutes = new Elysia({ prefix: "/admin/products" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  // ─── List ──────────────────────────────────────────────────────────
  .get("/", async ({ query, productController }) => {
    const data = await productController.adminList(query);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  // ─── Get by ID ─────────────────────────────────────────────────────
  .get(
    "/:id",
    async ({ params, productController }) => {
      const data = await productController.adminGetById(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Create ────────────────────────────────────────────────────────
  .post(
    "/",
    async ({ body, productController, set }) => {
      const data = await productController.adminCreate(body.vendor_id, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        vendor_id: t.String({ format: "uuid" }),
        name: t.String({ minLength: 1, maxLength: 500 }),
        description: t.Optional(t.String()),
        rich_description: t.Optional(t.String()),
        short_description: t.Optional(t.String()),
        ingredients: t.Optional(t.String()),
        usage_instructions: t.Optional(t.String()),
        category_id: t.String({ format: "uuid" }),
        additional_category_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
        brand_id: t.Optional(t.String({ format: "uuid" })),
        price: t.Number({ minimum: 0 }),
        compare_at_price: t.Optional(t.Number({ minimum: 0 })),
        cost_price: t.Optional(t.Number({ minimum: 0 })),
        sku: t.Optional(t.String()),
        barcode: t.Optional(t.String()),
        weight_grams: t.Optional(t.Number({ minimum: 0 })),
        dimensions_cm: t.Optional(
          t.Object({
            length: t.Number(),
            width: t.Number(),
            height: t.Number(),
          }),
        ),
        country_of_origin: t.Optional(t.String()),
        requires_shipping: t.Optional(t.Boolean()),
        quantity_on_hand: t.Optional(t.Number({ minimum: 0 })),
        warehouse_id: t.Optional(t.String({ format: "uuid" })),
        tags: t.Optional(t.Array(t.String())),
        attributes: t.Optional(t.Array(ProductAttributeInput)),
        translations: t.Optional(t.Array(ProductTranslationInput)),
        meta_title: t.Optional(t.String()),
        meta_description: t.Optional(t.String()),
        meta_keywords: t.Optional(t.Array(t.String())),
        is_featured: t.Optional(t.Boolean()),
        is_digital: t.Optional(t.Boolean()),
        is_customizable: t.Optional(t.Boolean()),
        status: t.Optional(
          t.Union([
            t.Literal("draft"),
            t.Literal("pending_review"),
            t.Literal("approved"),
            t.Literal("published"),
          ]),
        ),
        editorial: t.Optional(t.Union([ProductEditorial, t.Null()])),
      }),
    },
  )

  // ─── Update ────────────────────────────────────────────────────────
  .patch(
    "/:id",
    async ({ params, body, productController }) => {
      const data = await productController.adminUpdate(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
        description: t.Optional(t.String()),
        rich_description: t.Optional(t.String()),
        short_description: t.Optional(t.String()),
        ingredients: t.Optional(t.String()),
        usage_instructions: t.Optional(t.String()),
        category_id: t.Optional(t.String({ format: "uuid" })),
        brand_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        price: t.Optional(t.Number({ minimum: 0 })),
        compare_at_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
        cost_price: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
        sku: t.Optional(t.String()),
        barcode: t.Optional(t.String()),
        weight_grams: t.Optional(t.Number({ minimum: 0 })),
        dimensions_cm: t.Optional(
          t.Nullable(
            t.Object({
              length: t.Number(),
              width: t.Number(),
              height: t.Number(),
            }),
          ),
        ),
        country_of_origin: t.Optional(t.String()),
        requires_shipping: t.Optional(t.Boolean()),
        tags: t.Optional(t.Array(t.String())),
        attributes: t.Optional(t.Array(ProductAttributeInput)),
        translations: t.Optional(t.Array(ProductTranslationInput)),
        meta_title: t.Optional(t.String()),
        meta_description: t.Optional(t.String()),
        meta_keywords: t.Optional(t.Array(t.String())),
        is_featured: t.Optional(t.Boolean()),
        is_digital: t.Optional(t.Boolean()),
        is_customizable: t.Optional(t.Boolean()),
        editorial: t.Optional(t.Union([ProductEditorial, t.Null()])),
      }),
    },
  )

  // ─── Delete ────────────────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, productController }) => {
      await productController.adminRemove(params.id);
      return {
        statusCode: 200,
        message: "Product deleted",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Approve ───────────────────────────────────────────────────────
  .post(
    "/:id/approve",
    async ({ params, user, productController }) => {
      const data = await productController.adminApprove(params.id, user!.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Reject ────────────────────────────────────────────────────────
  .post(
    "/:id/reject",
    async ({ params, body, user, productController }) => {
      const data = await productController.adminReject(params.id, user!.id, body.reason);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ reason: t.String({ minLength: 1 }) }),
    },
  )

  // ─── Publish ───────────────────────────────────────────────────────
  .post(
    "/:id/publish",
    async ({ params, productController }) => {
      const data = await productController.adminPublish(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Unpublish ─────────────────────────────────────────────────────
  .post(
    "/:id/unpublish",
    async ({ params, productController }) => {
      const data = await productController.adminUnpublish(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Feature Toggle ────────────────────────────────────────────────
  .post(
    "/:id/feature",
    async ({ params, productController }) => {
      const data = await productController.adminToggleFeature(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Bulk Action ───────────────────────────────────────────────────
  .post(
    "/bulk-action",
    async ({ body, user, productController, audit }) => {
      const data = await productController.adminBulkAction(body.action, body.ids, {
        reason: body.reason,
        reviewer_id: user!.id,
      });
      audit.action = `product.bulk_${body.action}`;
      audit.entity_type = "product";
      audit.metadata = {
        action: body.action,
        ids: body.ids,
        count: body.ids.length,
        reason: body.reason,
      };
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        action: t.Union([
          t.Literal("approve"),
          t.Literal("reject"),
          t.Literal("archive"),
          t.Literal("delete"),
          t.Literal("feature"),
          t.Literal("unfeature"),
          t.Literal("publish"),
          t.Literal("unpublish"),
        ]),
        ids: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
        reason: t.Optional(t.String()),
      }),
    },
  )

  // ─── Images ────────────────────────────────────────────────────────
  .post(
    "/:id/images",
    async ({ params, body, productController, set }) => {
      const data = await productController.adminAddImage(params.id, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        url: t.String(),
        thumbnail_url: t.Optional(t.String()),
        medium_url: t.Optional(t.String()),
        alt_text: t.Optional(t.String()),
        is_primary: t.Optional(t.Boolean()),
        variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
      }),
    },
  )

  .patch(
    "/:id/images/reorder",
    async ({ params, body, productController }) => {
      await productController.adminReorderImages(params.id, body.items);
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
          t.Object({
            id: t.String({ format: "uuid" }),
            sort_order: t.Number({ minimum: 0 }),
          }),
        ),
      }),
    },
  )

  .delete(
    "/:id/images/:imageId",
    async ({ params, productController }) => {
      await productController.adminRemoveImage(params.id, params.imageId);
      return {
        statusCode: 200,
        message: "Image deleted",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        imageId: t.String({ format: "uuid" }),
      }),
    },
  )

  // ─── Unified media GET ─────────────────────────────────────────────
  .get(
    "/:id/media",
    async ({ params, mediaController }) => {
      const data = await mediaController.getProductMedia(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Reorder mixed media ───────────────────────────────────────────
  .patch(
    "/:id/media/reorder",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      await mediaController.reorderMedia(user!.role, params.id, body.items, user!);
      return {
        statusCode: 200,
        message: "Reordered",
        timestamp: new Date().toISOString(),
      };
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

  // ─── PATCH image (alt_text, focal, variant) ────────────────────────
  .patch(
    "/:id/images/:imageId",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.updateImage(
        user!.role,
        params.id,
        params.imageId,
        body,
        user!,
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

  // ─── POST image crop ───────────────────────────────────────────────
  .post(
    "/:id/images/:imageId/crop",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.cropImage(
        user!.role,
        params.id,
        params.imageId,
        body,
        user!,
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

  // ─── POST image replace ────────────────────────────────────────────
  .post(
    "/:id/images/:imageId/replace",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.replaceImage(
        user!.role,
        params.id,
        params.imageId,
        body,
        user!,
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

  // ─── Video presign ─────────────────────────────────────────────────
  .post(
    "/:id/videos/presign",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.presignVideo(user!.role, params.id, body, user!);
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

  // ─── Video process ─────────────────────────────────────────────────
  .post(
    "/:id/videos/process",
    async ({ params, body, user, mediaController, set }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.processVideo(user!.role, params.id, body, user!);
      set.status = 202;
      return { statusCode: 202, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ key: t.String({ minLength: 1 }) }),
    },
  )

  // ─── Video PATCH (variant assign) ──────────────────────────────────
  .patch(
    "/:id/videos/:videoId",
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.updateVideo(
        user!.role,
        params.id,
        params.videoId,
        body,
        user!,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        videoId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
      }),
    },
  )

  // ─── Video delete ──────────────────────────────────────────────────
  .delete(
    "/:id/videos/:videoId",
    async ({ params, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      await mediaController.deleteVideo(user!.role, params.id, params.videoId, user!);
      return {
        statusCode: 200,
        message: "Video deleted",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        videoId: t.String({ format: "uuid" }),
      }),
    },
  )

  // ─── AI enhance ────────────────────────────────────────────────────
  .post(
    "/:id/images/:imageId/enhance",
    async ({ params, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.enhanceImage(user!.role, params.id, params.imageId, user!);
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
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.acceptAiEnhance(
        user!.role,
        params.id,
        params.imageId,
        body,
        user!,
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
    async ({ params, body, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.rejectAiEnhance(
        user!.role,
        params.id,
        params.imageId,
        body,
        user!,
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
    async ({ params, user, mediaController }) => {
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user
      const data = await mediaController.revertAiEnhance(
        user!.role,
        params.id,
        params.imageId,
        user!,
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

  // ─── Variants ──────────────────────────────────────────────────────
  .post(
    "/:id/variants",
    async ({ params, body, productController, set }) => {
      const data = await productController.adminGenerateVariants(params.id, body);
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
              values: t.Array(t.String()),
            }),
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

  // ─── Inventory (Admin) ────────────────────────────────────────────
  .get(
    "/:id/inventory",
    async ({ params, inventoryController, productController }) => {
      const product = await productController.adminGetById(params.id);
      const data = await inventoryController.listForVendor(product.vendor_id, params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  .post(
    "/:id/inventory/restock",
    async ({ params, body, inventoryController, productController, set }) => {
      const product = await productController.adminGetById(params.id);
      const data = await inventoryController.restock(product.vendor_id, {
        product_id: params.id,
        variant_id: body.variant_id,
        warehouse_id: body.warehouse_id,
        quantity: body.quantity,
      });
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        variant_id: t.Optional(t.String({ format: "uuid" })),
        warehouse_id: t.Optional(t.String({ format: "uuid" })),
        quantity: t.Number({ minimum: 1 }),
      }),
    },
  )

  .post(
    "/:id/inventory/adjust",
    async ({ params, body, inventoryController, productController, audit }) => {
      const product = await productController.adminGetById(params.id);
      const data = await inventoryController.adjust(product.vendor_id, {
        product_id: params.id,
        variant_id: body.variant_id,
        warehouse_id: body.warehouse_id,
        quantity: body.quantity,
        reason: body.reason,
      });
      audit.action = "inventory.adjust";
      audit.entity_type = "product";
      audit.entity_id = params.id;
      audit.metadata = {
        variant_id: body.variant_id,
        warehouse_id: body.warehouse_id,
        delta: body.quantity,
        reason: body.reason,
      };
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        variant_id: t.Optional(t.String({ format: "uuid" })),
        warehouse_id: t.Optional(t.String({ format: "uuid" })),
        quantity: t.Number(),
        reason: t.String({ minLength: 1 }),
      }),
    },
  )

  .post(
    "/:id/ai-enhance-content",
    async ({ params, productController, productAiEnhance, categoryController }) => {
      const product = await productController.adminGetById(params.id);
      const categoryAttributes = await categoryController.getCategoryAttributes(
        product.category_id,
      );
      const data = await productAiEnhance.generateDraft({
        product: { ...product, categoryAttributes },
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  );
