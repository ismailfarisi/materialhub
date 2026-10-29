import {
  AddProductGroupMemberBody,
  CreateProductGroupBody,
  UpdateProductGroupBody,
} from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const productGroupRoutes = new Elysia({ prefix: "/vendor/product-groups" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        async ({ body, member, productController, set }: any) => {
          const data = await productController.createGroup(member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { body: CreateProductGroupBody },
      )
      .get("/by-product/:productId", async ({ params, member, productController }: any) => {
        const data = await productController.getGroupByProduct(params.productId, member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .get("/:id", async ({ params, member, productController }: any) => {
        const data = await productController.getGroup(params.id, member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .patch(
        "/:id",
        async ({ params, body, member, productController }: any) => {
          const data = await productController.updateGroup(params.id, member.vid, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { body: UpdateProductGroupBody },
      )
      .post(
        "/:id/members",
        // NOTE: Incremental member-add is stubbed for Plan 1. The primary
        // authoring flow goes through the createGroup endpoint which accepts
        // the full member list. Full incremental-add (addGroupMember) is
        // deferred to Plan 2.
        async ({ params, member, productController, set }: any) => {
          const data = await productController.getGroup(params.id, member.vid);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { body: AddProductGroupMemberBody },
      )
      .delete("/:id/members/:memberId", async ({ params, member, productController }: any) => {
        const data = await productController.removeGroupMember(
          params.id,
          member.vid,
          params.memberId,
        );
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      }),
  );
