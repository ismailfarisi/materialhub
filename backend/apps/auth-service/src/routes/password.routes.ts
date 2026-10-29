import { bearer } from "@elysiajs/bearer";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { bumpTokenVersion } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { getDeviceInfo } from "../domain/types.ts";
import { issueAccessToken } from "../services/token-issuance.service.ts";
import { setAuthCookies } from "../utils/auth-cookies.ts";

export const passwordRoutes = new Elysia({ prefix: "/auth" })
  .use(container)
  .use(bearer())
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

  // POST /auth/forgot-password
  .post(
    "/forgot-password",
    ({ body, passwordController }) => passwordController.forgotPassword(body.email),
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      detail: {
        tags: ["Auth"],
        summary: "Request password reset",
        description:
          "Sends a password reset link if the email exists. Always returns 200 to prevent enumeration.",
      },
    },
  )

  // POST /auth/reset-password
  .post(
    "/reset-password",
    async ({ body, passwordController }) => {
      const result = await passwordController.resetPassword(body.token, body.new_password);
      await bumpTokenVersion(result.userId);
      return { message: result.message };
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
        new_password: t.String({ minLength: 8 }),
      }),
      detail: {
        tags: ["Auth"],
        summary: "Reset password with token",
        description:
          "Reset user password using the token received via email. Revokes all active sessions.",
      },
    },
  )

  // POST /auth/magic-link
  .post(
    "/magic-link",
    ({ body, passwordController }) => passwordController.sendMagicLink(body.email),
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      detail: {
        tags: ["Auth"],
        summary: "Request magic link login",
        description: "Sends a magic link for passwordless login if the email exists.",
      },
    },
  )

  // POST /auth/magic-link/verify
  .post(
    "/magic-link/verify",
    async ({ body, accessJwt, request, cookie, passwordController }) => {
      const result = await passwordController.verifyMagicLink(body.token, getDeviceInfo(request));
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      return {
        access_token: accessToken,
        refresh_token: result.refreshToken,
        token_type: "Bearer",
        expires_in: 900,
      };
    },
    {
      body: t.Object({ token: t.String({ minLength: 1 }) }),
      detail: {
        tags: ["Auth"],
        summary: "Verify magic link",
        description: "Verify magic link token and receive JWT access/refresh tokens.",
      },
    },
  );
