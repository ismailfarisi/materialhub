import {
  AdminCreateVendorBody,
  AdminUpdateDocumentBody,
  AdminUpdateVendorBody,
  AdminUploadDocumentBody,
} from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { HttpError, auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const vendorAdminRoutes = new Elysia({ prefix: "/admin/vendors" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .onError({ as: "scoped" }, ({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.statusCode;
      return {
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .get("/", async ({ query, vendorController }) => {
    const result = await vendorController.listForAdmin(
      query.status,
      query.page ? Number(query.page) : undefined,
      query.limit ? Number(query.limit) : undefined,
      query.search,
    );
    return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
  })

  .get(
    "/:id",
    async ({ params, vendorController }) => {
      const vendor = await vendorController.getById(params.id);
      return { statusCode: 200, data: vendor, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/trn-verification",
    async ({ params, body, user, vendorController, audit }) => {
      audit.entity_type = "vendor";
      audit.entity_id = params.id;
      audit.action = body.verified ? "vendor.trn_verified" : "vendor.trn_unverified";
      const vendor = await vendorController.setTrnVerified(params.id, user!.id, body.verified);
      return { statusCode: 200, data: vendor, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ verified: t.Boolean() }),
    },
  )

  .get(
    "/:id/documents",
    async ({ params, vendorController }) => {
      const docs = await vendorController.listDocuments(params.id);
      return { statusCode: 200, data: docs, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .patch(
    "/:id/approve",
    async ({ params, body, user, vendorController, audit }) => {
      const vendor = await vendorController.approve(params.id, user!.id, body?.message);
      audit.action = "vendor.approve";
      audit.entity_type = "vendor";
      audit.entity_id = params.id;
      audit.changes = { status: { old: "pending", new: vendor.status } };
      if (body?.message) audit.metadata = { message: body.message };
      return {
        statusCode: 200,
        message: "Vendor approved",
        data: vendor,
        timestamp: new Date().toISOString(),
      };
    },
    { body: t.Optional(t.Object({ message: t.Optional(t.String()) })) },
  )

  .patch(
    "/:id/reject",
    async ({ params, body, user, vendorController, audit }) => {
      const vendor = await vendorController.reject(params.id, user!.id, body.reason);
      audit.action = "vendor.reject";
      audit.entity_type = "vendor";
      audit.entity_id = params.id;
      audit.changes = { status: { old: "pending", new: vendor.status } };
      audit.metadata = { reason: body.reason };
      return {
        statusCode: 200,
        message: "Vendor rejected",
        data: vendor,
        timestamp: new Date().toISOString(),
      };
    },
    { body: t.Object({ reason: t.String({ minLength: 1 }) }) },
  )

  .patch(
    "/:id/suspend",
    async ({ params, body, user, vendorController, audit }) => {
      const vendor = await vendorController.suspend(params.id, user!.id, body.reason);
      audit.action = "vendor.suspend";
      audit.entity_type = "vendor";
      audit.entity_id = params.id;
      audit.changes = { status: { old: "active", new: vendor.status } };
      audit.metadata = { reason: body.reason };
      return {
        statusCode: 200,
        message: "Vendor suspended",
        data: vendor,
        timestamp: new Date().toISOString(),
      };
    },
    { body: t.Object({ reason: t.String({ minLength: 1 }) }) },
  )

  .patch("/:id/reactivate", async ({ params, user, vendorController, audit }) => {
    const vendor = await vendorController.reactivate(params.id, user!.id);
    audit.action = "vendor.reactivate";
    audit.entity_type = "vendor";
    audit.entity_id = params.id;
    audit.changes = { status: { old: "suspended", new: vendor.status } };
    return {
      statusCode: 200,
      message: "Vendor reactivated",
      data: vendor,
      timestamp: new Date().toISOString(),
    };
  })

  .patch(
    "/:id/use-platform-shipping",
    async ({ params, vendorController, audit }) => {
      const vendor = await vendorController.usePlatformShipping(params.id);
      audit.action = "vendor.use_platform_shipping";
      audit.entity_type = "vendor";
      audit.entity_id = params.id;
      audit.metadata = {
        default_shipping_account_id: null,
        auto_create_shipment: true,
      };
      return {
        statusCode: 200,
        message: "Vendor now uses platform shipping",
        data: vendor,
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // Create vendor (admin)
  .post(
    "/",
    async ({ body, user, vendorController }) => {
      const result = await vendorController.createByAdmin(user!.id, body);
      return { statusCode: 201, data: result, timestamp: new Date().toISOString() };
    },
    { body: AdminCreateVendorBody },
  )

  // Update vendor (admin)
  .patch(
    "/:id",
    async ({ params, body, vendorController }) => {
      const vendor = await vendorController.updateByAdmin(params.id, body);
      return { statusCode: 200, data: vendor, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: AdminUpdateVendorBody,
    },
  )

  // Upload document for vendor
  .post(
    "/:id/documents",
    async ({ params, body, vendorController }) => {
      const doc = await vendorController.uploadDocumentForVendor(params.id, body);
      return { statusCode: 201, data: doc, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: AdminUploadDocumentBody,
    },
  )

  // Verify document
  .patch(
    "/:id/documents/:docId/verify",
    async ({ params, user, vendorController, audit }) => {
      const doc = await vendorController.verifyDocument(params.docId, user!.id);
      audit.action = "vendor.kyc_document_verify";
      audit.entity_type = "vendor_document";
      audit.entity_id = params.docId;
      audit.metadata = { vendor_id: params.id };
      return {
        statusCode: 200,
        data: doc,
        message: "Document verified",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), docId: t.String({ format: "uuid" }) }) },
  )

  // Reject document
  .patch(
    "/:id/documents/:docId/reject",
    async ({ params, body, vendorController, audit }) => {
      const doc = await vendorController.rejectDocument(params.docId, body.reason);
      audit.action = "vendor.kyc_document_reject";
      audit.entity_type = "vendor_document";
      audit.entity_id = params.docId;
      audit.metadata = { vendor_id: params.id, reason: body.reason };
      return {
        statusCode: 200,
        data: doc,
        message: "Document rejected",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), docId: t.String({ format: "uuid" }) }),
      body: t.Object({ reason: t.String({ minLength: 1 }) }),
    },
  )

  // Update document (replace file / expiry)
  .patch(
    "/:id/documents/:docId",
    async ({ params, body, vendorController, audit }) => {
      const doc = await vendorController.updateDocument(params.docId, body);
      audit.action = "vendor.kyc_document_update";
      audit.entity_type = "vendor_document";
      audit.entity_id = params.docId;
      audit.metadata = { vendor_id: params.id, ...body };
      return {
        statusCode: 200,
        data: doc,
        message: "Document updated",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), docId: t.String({ format: "uuid" }) }),
      body: AdminUpdateDocumentBody,
    },
  )

  // Delete document
  .delete(
    "/:id/documents/:docId",
    async ({ params, vendorController, audit }) => {
      await vendorController.deleteDocument(params.docId);
      audit.action = "vendor.kyc_document_delete";
      audit.entity_type = "vendor_document";
      audit.entity_id = params.docId;
      audit.metadata = { vendor_id: params.id };
      return {
        statusCode: 200,
        message: "Document removed",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), docId: t.String({ format: "uuid" }) }) },
  )

  // Bank account CRUD
  .get(
    "/:id/bank-accounts",
    async ({ params, vendorController }) => {
      const accounts = await vendorController.listBankAccounts(params.id);
      return { statusCode: 200, data: accounts, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/bank-accounts",
    async ({ params, body, vendorController }) => {
      const account = await vendorController.createBankAccount(params.id, {
        bankName: body.bank_name,
        accountHolderName: body.account_holder_name,
        accountNumber: body.account_number,
        iban: body.iban,
        swiftCode: body.swift_code,
        routingNumber: body.routing_number,
        currency: body.currency,
      });
      return { statusCode: 201, data: account, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        bank_name: t.String(),
        account_holder_name: t.String(),
        account_number: t.String(),
        iban: t.Optional(t.String()),
        swift_code: t.Optional(t.String()),
        routing_number: t.Optional(t.String()),
        currency: t.Optional(t.String()),
      }),
    },
  )

  .patch(
    "/:id/bank-accounts/:accId",
    async ({ params, body, vendorController }) => {
      const account = await vendorController.updateBankAccount(params.id, params.accId, {
        bankName: body.bank_name,
        accountHolderName: body.account_holder_name,
        accountNumber: body.account_number,
        iban: body.iban,
        swiftCode: body.swift_code,
        currency: body.currency,
      });
      return { statusCode: 200, data: account, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), accId: t.String({ format: "uuid" }) }),
      body: t.Partial(
        t.Object({
          bank_name: t.String(),
          account_holder_name: t.String(),
          account_number: t.String(),
          iban: t.String(),
          swift_code: t.String(),
          currency: t.String(),
        }),
      ),
    },
  )

  .patch(
    "/:id/bank-accounts/:accId/primary",
    async ({ params, vendorController }) => {
      const account = await vendorController.setPrimaryBankAccount(params.id, params.accId);
      return {
        statusCode: 200,
        data: account,
        message: "Primary bank account updated",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), accId: t.String({ format: "uuid" }) }) },
  )

  .delete(
    "/:id/bank-accounts/:accId",
    async ({ params, vendorController }) => {
      await vendorController.removeBankAccount(params.id, params.accId);
      return {
        statusCode: 200,
        message: "Bank account removed",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), accId: t.String({ format: "uuid" }) }) },
  )

  // ── Team members (admin-managed) ─────────────────────────────────────────
  // Platform admins manage any vendor's team, reusing the same VendorMemberService
  // the vendor dashboard uses (email invites, role changes, removal). Owner
  // management (transfer/demote/removal) is intentionally out of scope here — the
  // owner seat is left to the vendor. Each mutation is audited via auditPlugin.
  .get(
    "/:id/members",
    async ({ params, vendorMemberService }: any) => {
      const data = await vendorMemberService.list({ vendorId: params.id });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/members/invite",
    async ({ params, body, user, vendorMemberService, audit, set }: any) => {
      const result = await vendorMemberService.invite({
        vendorId: params.id,
        email: body.email,
        role: body.role,
        invitedByUserId: user!.id,
      });
      audit.action = "vendor.member.invited";
      audit.entity_type = "vendor_member";
      audit.entity_id = result.memberId;
      audit.metadata = { vendor_id: params.id, email: body.email, role: body.role };
      set.status = 201;
      return { statusCode: 201, data: result, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        email: t.String({ format: "email" }),
        role: t.Union([t.Literal("manager"), t.Literal("staff"), t.Literal("viewer")]),
      }),
    },
  )

  .patch(
    "/:id/members/:memberId",
    async ({ params, body, user, vendorMemberService, audit }: any) => {
      // changeRole itself rejects touching the owner seat (CANNOT_DEMOTE_OWNER).
      await vendorMemberService.changeRole({
        vendorId: params.id,
        memberId: params.memberId,
        newRole: body.role,
        actorUserId: user!.id,
      });
      audit.action = "vendor.member.role_changed";
      audit.entity_type = "vendor_member";
      audit.entity_id = params.memberId;
      audit.metadata = { vendor_id: params.id, role: body.role };
      return {
        statusCode: 200,
        message: "Member role updated",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        memberId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        role: t.Union([t.Literal("manager"), t.Literal("staff"), t.Literal("viewer")]),
      }),
    },
  )

  .delete(
    "/:id/members/:memberId",
    async ({ params, user, vendorMemberService, audit }: any) => {
      // Guard against orphaning the vendor: an admin must not remove the owner
      // seat here (ownership changes are out of scope for admin management).
      const members = await vendorMemberService.list({ vendorId: params.id });
      const target = members.find((m: any) => m.id === params.memberId);
      if (target?.role === "owner") {
        throw new HttpError(422, "Cannot remove the vendor owner", "CANNOT_REMOVE_OWNER");
      }
      await vendorMemberService.remove({
        vendorId: params.id,
        memberId: params.memberId,
        actorUserId: user!.id,
      });
      audit.action = "vendor.member.removed";
      audit.entity_type = "vendor_member";
      audit.entity_id = params.memberId;
      audit.metadata = { vendor_id: params.id };
      return {
        statusCode: 200,
        message: "Member removed",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        memberId: t.String({ format: "uuid" }),
      }),
    },
  );
