import { bearer } from "@elysiajs/bearer";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { getDeviceInfo, requireAuth } from "../domain/types.ts";
import { issueAccessToken } from "../services/token-issuance.service.ts";
import { getAccessTokenFromCookie, setAuthCookies } from "../utils/auth-cookies.ts";

export const twoFactorRoutes = new Elysia({ prefix: "/auth" })
  .use(container)
  .use(bearer())
  .use(auditPlugin)
  .use(
    jwt({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      exp: config.jwt.accessExpiresIn,
    }),
  )
  .use(
    jwt({
      name: "refreshJwt",
      secret: config.jwt.refreshSecret,
      exp: config.jwt.refreshExpiresIn,
    }),
  )

  // POST /auth/2fa/enable — requires auth
  .post(
    "/2fa/enable",
    async ({ bearer: bearerToken, accessJwt, cookie, request, twoFactorController }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      return twoFactorController.enableSetup(authUser.id);
    },
    {
      detail: {
        tags: ["Auth - 2FA"],
        summary: "Enable 2FA setup",
        description:
          "Generates a TOTP secret and returns it along with an otpauth URI for QR code generation.",
      },
    },
  )

  // POST /auth/2fa/verify — requires auth
  .post(
    "/2fa/verify",
    async ({
      bearer: bearerToken,
      accessJwt,
      body,
      cookie,
      request,
      twoFactorController,
      audit,
    }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const result = await twoFactorController.verifyAndEnable(authUser.id, body.code);
      audit.action = "user.2fa_enable";
      audit.entity_type = "user";
      audit.entity_id = authUser.id;
      audit.actor_id = authUser.id;
      audit.actor_role = authUser.role;
      audit.changes = { two_factor_enabled: { old: false, new: true } };
      return result;
    },
    {
      body: t.Object({ code: t.String({ minLength: 6, maxLength: 6 }) }),
      detail: {
        tags: ["Auth - 2FA"],
        summary: "Verify and enable 2FA",
        description:
          "Verify the TOTP code from the authenticator app to finalize 2FA setup. Returns backup codes.",
      },
    },
  )

  // POST /auth/2fa/disable — requires auth
  .post(
    "/2fa/disable",
    async ({
      bearer: bearerToken,
      accessJwt,
      body,
      cookie,
      request,
      twoFactorController,
      audit,
    }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const result = await twoFactorController.disable(authUser.id, body.code);
      audit.action = "user.2fa_disable";
      audit.entity_type = "user";
      audit.entity_id = authUser.id;
      audit.actor_id = authUser.id;
      audit.actor_role = authUser.role;
      audit.changes = { two_factor_enabled: { old: true, new: false } };
      return result;
    },
    {
      body: t.Object({ code: t.String({ minLength: 1 }) }),
      detail: {
        tags: ["Auth - 2FA"],
        summary: "Disable 2FA",
        description: "Disable 2FA by providing a valid TOTP code or backup code.",
      },
    },
  )

  // POST /auth/2fa/login-verify — public (used during login after password auth)
  .post(
    "/2fa/login-verify",
    async ({ body, accessJwt, request, cookie, twoFactorController, audit }) => {
      const result = await twoFactorController.loginVerify(
        body.user_id,
        body.code,
        getDeviceInfo(request),
      );
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.login_2fa";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
      }
      return {
        access_token: accessToken,
        refresh_token: result.refreshToken,
        token_type: "Bearer",
        expires_in: 900,
      };
    },
    {
      body: t.Object({
        user_id: t.String({ format: "uuid" }),
        code: t.String({ minLength: 6, maxLength: 6 }),
      }),
      detail: {
        tags: ["Auth - 2FA"],
        summary: "Verify TOTP code during login",
        description:
          "Complete login by verifying the TOTP code after password authentication. Returns JWT tokens on success.",
      },
    },
  )

  // POST /auth/2fa/backup-verify — public (used during login)
  .post(
    "/2fa/backup-verify",
    async ({ body, accessJwt, request, cookie, twoFactorController, audit }) => {
      const result = await twoFactorController.backupVerify(
        body.user_id,
        body.code,
        getDeviceInfo(request),
      );
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.login_2fa_backup";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
      }
      return {
        access_token: accessToken,
        refresh_token: result.refreshToken,
        token_type: "Bearer",
        expires_in: 900,
      };
    },
    {
      body: t.Object({
        user_id: t.String({ format: "uuid" }),
        code: t.String({ minLength: 1 }),
      }),
      detail: {
        tags: ["Auth - 2FA"],
        summary: "Verify backup code",
        description:
          "Verify a 2FA backup code during login and receive JWT tokens. Used when authenticator app is unavailable.",
      },
    },
  );
