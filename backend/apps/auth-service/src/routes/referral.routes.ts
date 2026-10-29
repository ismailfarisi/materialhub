import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const referralRoutes = new Elysia()
  .use(container)

  .get(
    "/ref/:code",
    async ({ params, referralController }: any) => {
      const referral = await referralController.lookupCode(params.code);
      if (!referral) {
        return {
          statusCode: 404,
          message: "Invalid or expired referral code",
          timestamp: new Date().toISOString(),
        };
      }
      return {
        statusCode: 200,
        data: { referral_code: referral.referral_code, referrer_id: referral.referrer_id },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ code: t.String() }) },
  )

  .use(jwtAuth)

  .get("/me/referral-code", async ({ user, referralController }: any) => {
    const code = await referralController.getMyCode(user!.id);
    return { statusCode: 200, data: { referral_code: code }, timestamp: new Date().toISOString() };
  })

  .get(
    "/me/referrals",
    async ({ query, user, referralController }: any) => {
      const data = await referralController.listMyReferrals(
        user!.id,
        query.page ? Number(query.page) : undefined,
        query.limit ? Number(query.limit) : undefined,
      );
      return { statusCode: 200, ...data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Integer({ default: 1 })),
        limit: t.Optional(t.Integer({ default: 20 })),
      }),
    },
  );
