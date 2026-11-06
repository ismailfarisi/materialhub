import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const vendorRoutes = new Elysia({ prefix: "/vendors" })
  .use(container)
  .use(jwtAuth)

  .get(
    "/by-slug/:slug",
    async ({ params, vendorController }) => {
      const profile = await vendorController.getPublicProfileBySlug(params.slug);
      return { statusCode: 200, data: profile, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  .get("/:id/profile", async ({ params, vendorController }) => {
    const profile = await vendorController.getPublicProfile(params.id);
    return { statusCode: 200, data: profile, timestamp: new Date().toISOString() };
  })

  // Application endpoint — must run BEFORE the membership chain because the user
  // does not yet have a vendor membership when applying.
  .use(requireRole("customer"))

  .post(
    "/apply",
    async ({ body, user, vendorController, set }) => {
      const vendor = await vendorController.apply(user!.id, body);
      set.status = 201;
      return {
        statusCode: 201,
        message: "Application submitted",
        data: vendor,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        business_name: t.String({ minLength: 2, maxLength: 200 }),
        business_name_ar: t.Optional(t.String()),
        business_email: t.String({ format: "email" }),
        business_phone: t.String(),
        business_address: t.Object({
          street: t.String(),
          city: t.String(),
          state: t.String(),
          country: t.String(),
          postal_code: t.String(),
        }),
        tax_registration_number: t.Optional(t.String()),
        documents: t.Array(
          t.Object({
            type: t.String(),
            s3_key: t.String(),
          }),
          { minItems: 1 },
        ),
        bank_account: t.Object({
          bank_name: t.String(),
          account_holder_name: t.String(),
          account_number: t.String(),
          iban: t.String(),
          swift_code: t.Optional(t.String()),
          currency: t.Optional(t.String()),
        }),
      }),
    },
  )

  // vendor.profile.write — vendor profile, settings, deactivation, documents
  .guard({}, (app) =>
    app
      .use(vendorMembership("vendor.profile.write"))
      .get("/me", async ({ member, vendorController }) => {
        const vendor = await vendorController.getById(member.vid);
        return { statusCode: 200, data: vendor, timestamp: new Date().toISOString() };
      })
      .patch(
        "/me/settings",
        async ({ body, member, vendorController }) => {
          const updated = await vendorController.updateSettings(member.vid, body);
          return { statusCode: 200, data: updated, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            logo_url: t.Optional(t.String()),
            banner_url: t.Optional(t.String()),
            description: t.Optional(t.String()),
            return_policy: t.Optional(t.String()),
            shipping_policy: t.Optional(t.String()),
            payout_schedule: t.Optional(t.String()),
          }),
        },
      )
      .patch(
        "/me/tax",
        async ({ body, member, vendorController }) => {
          // TRN printed as the seller TRN on this vendor's VAT tax invoices.
          const updated = await vendorController.updateTrn(member.vid, body.trn ?? null);
          return { statusCode: 200, data: updated, timestamp: new Date().toISOString() };
        },
        { body: t.Object({ trn: t.Union([t.String({ maxLength: 32 }), t.Null()]) }) },
      )
      .post("/me/deactivate", async ({ vendorController, user }) => {
        const deactivated = await vendorController.deactivate(user!.id);
        return {
          statusCode: 200,
          message: "Vendor deactivated",
          data: deactivated,
          timestamp: new Date().toISOString(),
        };
      })
      .post(
        "/me/documents",
        async ({ body, member, vendorController, set }) => {
          const doc = await vendorController.uploadDocument(
            member.vid,
            body.type,
            body.s3_key,
            body.file_name,
          );
          set.status = 201;
          return { statusCode: 201, data: doc, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            type: t.String(),
            s3_key: t.String(),
            file_name: t.String(),
          }),
        },
      )
      .get("/me/documents", async ({ member, vendorController }) => {
        const docs = await vendorController.listDocuments(member.vid);
        return { statusCode: 200, data: docs, timestamp: new Date().toISOString() };
      }),
  )

  // bank.read — list bank accounts and view connect status
  .guard({}, (app) =>
    app
      .use(vendorMembership("bank.read"))
      .get("/me/bank-accounts", async ({ member, vendorController }) => {
        const accounts = await vendorController.listBankAccounts(member.vid);
        return { statusCode: 200, data: accounts, timestamp: new Date().toISOString() };
      })
      .get("/me/connect/status", async ({ member, vendorController }: any) => {
        const status = await vendorController.getConnectStatus(member.vid);
        return { statusCode: 200, data: status, timestamp: new Date().toISOString() };
      }),
  )

  // bank.write — create/update/delete bank accounts and create connect account
  .guard({}, (app) =>
    app
      .use(vendorMembership("bank.write"))
      .post(
        "/me/bank-accounts",
        async ({ body, member, vendorController, set }) => {
          const account = await vendorController.createBankAccount(member.vid, body);
          set.status = 201;
          return { statusCode: 201, data: account, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            bankName: t.String(),
            accountHolderName: t.String(),
            accountNumber: t.String(),
            iban: t.String(),
            swiftCode: t.Optional(t.String()),
            currency: t.Optional(t.String()),
          }),
        },
      )
      .patch("/me/bank-accounts/:id", async ({ params, body, member, vendorController }) => {
        const updated = await vendorController.updateBankAccount(member.vid, params.id, body);
        return { statusCode: 200, data: updated, timestamp: new Date().toISOString() };
      })
      .delete("/me/bank-accounts/:id", async ({ params, member, vendorController }) => {
        await vendorController.removeBankAccount(member.vid, params.id);
        return {
          statusCode: 200,
          message: "Bank account removed",
          timestamp: new Date().toISOString(),
        };
      })
      .post(
        "/me/connect",
        async ({ body, member, vendorController }: any) => {
          const result = await vendorController.createConnectedAccount(
            member.vid,
            body.return_url,
            body.refresh_url,
          );
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            return_url: t.String(),
            refresh_url: t.String(),
          }),
        },
      ),
  );
