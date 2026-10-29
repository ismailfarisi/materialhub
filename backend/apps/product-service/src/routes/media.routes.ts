import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const mediaRoutes = new Elysia({ prefix: "/media" })
  .use(container)

  // GET /media/product/:productId — public
  .get(
    "/product/:productId",
    ({ params, mediaController }) => mediaController.getProductImages(params.productId),
    { params: t.Object({ productId: t.String({ format: "uuid" }) }) },
  )

  // All routes below require authentication
  .use(jwtAuth)

  // POST /media/presign — requires vendor/admin role
  .post(
    "/presign",
    ({ body, user, mediaController }) => {
      // jwtAuth guarantees user is set on authenticated routes
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      return mediaController.generatePresignedUrl(user!.role, body, user!);
    },
    {
      body: t.Object({
        asset_type: t.String({ minLength: 1 }),
        filename: t.String({ minLength: 1 }),
        content_type: t.String({ minLength: 1 }),
        vendor_id: t.Optional(t.String()),
      }),
    },
  )

  // POST /media/process — requires vendor/admin role
  .post(
    "/process",
    ({ body, user, mediaController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      mediaController.processImage(user!.role, body, user!),
    {
      body: t.Object({
        key: t.String({ minLength: 1 }),
        product_id: t.String({ format: "uuid" }),
        alt_text: t.Optional(t.String()),
        is_primary: t.Optional(t.Boolean()),
        variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
      }),
    },
  )

  // POST /media/process-asset — requires vendor/admin role
  .post(
    "/process-asset",
    ({ body, user, mediaController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      mediaController.processAsset(user!.role, body),
    {
      body: t.Object({
        asset_type: t.String({ minLength: 1 }),
        key: t.String({ minLength: 1 }),
      }),
    },
  )

  // GET /media/kyc/:key/signed-url — admin only
  .get(
    "/kyc/:key/signed-url",
    ({ params, user, mediaController }) => {
      const decodedKey = decodeURIComponent(params.key);
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      return mediaController.getKycSignedUrl(user!.role, decodedKey);
    },
    {
      params: t.Object({ key: t.String({ minLength: 1 }) }),
    },
  )

  // DELETE /media/:id — requires authentication
  .delete("/:id", ({ params, mediaController }) => mediaController.deleteImage(params.id), {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
  })

  // POST /media/videos/layout/presign — admin or vendor
  .post(
    "/videos/layout/presign",
    ({ body, user, layoutVideoController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      layoutVideoController.presign(user!.role, body, user!),
    {
      body: t.Object({
        filename: t.String({ minLength: 1 }),
        content_type: t.String({ minLength: 1 }),
        size_bytes: t.Number({ minimum: 1 }),
      }),
    },
  )

  // POST /media/videos/layout/process — admin or vendor
  .post(
    "/videos/layout/process",
    ({ body, user, layoutVideoController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      layoutVideoController.process(user!.role, body, user!),
    { body: t.Object({ key: t.String({ minLength: 1 }) }) },
  )

  // GET /media/videos/layout/:id — poll transcode status
  .get(
    "/videos/layout/:id",
    ({ params, user, layoutVideoController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      layoutVideoController.get(user!.role, params.id, user!),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // DELETE /media/videos/layout/:id — frees the vendor's quota
  .delete(
    "/videos/layout/:id",
    ({ params, user, layoutVideoController }) =>
      // biome-ignore lint/style/noNonNullAssertion: jwtAuth guarantees user is populated
      layoutVideoController.remove(user!.role, params.id, user!),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
