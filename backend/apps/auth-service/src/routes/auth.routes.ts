import { bearer } from "@elysiajs/bearer";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { AppDataSource, User, WalletTransaction } from "@materialhub/database";
import { HttpError, auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { getDeviceInfo, requireAuth, tokenResponse } from "../domain/types.ts";
import { issueAccessToken } from "../services/token-issuance.service.ts";
import { issueTwoFactorChallenge } from "../services/two-factor-challenge.ts";
import {
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../utils/auth-cookies.ts";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(container)
  .use(bearer())
  .use(auditPlugin)
  .use(
    jwt({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      exp: config.jwt.accessExpiresIn,
      alg: "HS256",
    }),
  )
  .use(
    jwt({
      name: "refreshJwt",
      secret: config.jwt.refreshSecret,
      exp: config.jwt.refreshExpiresIn,
      alg: "HS256",
    }),
  )

  // ─── Health Check ───────────────────────────────────────────────────
  .get("/health", () => ({
    status: "ok",
    service: "auth-service",
    timestamp: new Date().toISOString(),
  }))

  // ─── Register ───────────────────────────────────────────────────────
  .post(
    "/register",
    async ({ body, set, accessJwt, request, cookie, authController, audit }) => {
      const result = await authController.register(body, getDeviceInfo(request, body));
      set.status = 201;
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      // Self-service customer registration is high-volume and not actionable
      // for admin oversight — skip audit for customers, log for staff.
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.register";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
        audit.metadata = { email: result.user.email };
      }
      // emailVerifyToken is sent via email only, never exposed in API response
      return tokenResponse(
        201,
        "Registration successful. Please verify your email.",
        result.user,
        accessToken,
        result.refreshToken,
      );
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        first_name: t.String({ minLength: 1, maxLength: 100 }),
        last_name: t.String({ minLength: 1, maxLength: 100 }),
        phone: t.Optional(t.String({ maxLength: 20 })),
        device_type: t.Optional(t.String()),
        device_id: t.Optional(t.String()),
      }),
    },
  )

  // ─── Login ──────────────────────────────────────────────────────────
  .post(
    "/login",
    async ({ body, accessJwt, request, cookie, authController, audit }) => {
      const result = await authController.login(
        body.email,
        body.password,
        getDeviceInfo(request, body),
      );

      // 2FA challenge — don't issue tokens yet. The actual login completes
      // via /auth/2fa/login-verify (or backup-verify), which audits there
      // with role context. Skip here to avoid duplicate intermediate rows.
      if ("requires_2fa" in result && result.requires_2fa) {
        audit.skip = true;
        return {
          statusCode: 200,
          message: "2FA verification required",
          // The challenge proves the password step; the verify endpoints
          // require it (a bare user id is not enough to finish a login).
          data: {
            requires_2fa: true,
            challenge_token: issueTwoFactorChallenge(result.user_id as string),
          },
          timestamp: new Date().toISOString(),
        };
      }

      const accessToken = await issueAccessToken(accessJwt, result.user!);
      setAuthCookies(cookie, accessToken, result.refreshToken as string, request);
      // Skip routine customer logins — they're high-volume and don't drive
      // any compliance review. Staff/vendor logins stay audited.
      if (result.user!.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.login";
        audit.entity_type = "user";
        audit.entity_id = result.user!.id as string;
        audit.actor_id = result.user!.id as string;
        audit.actor_role = result.user!.role as string;
      }
      return tokenResponse(
        200,
        "Login successful",
        result.user!,
        accessToken,
        result.refreshToken as string,
      );
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 1 }),
        device_type: t.Optional(t.String()),
        device_id: t.Optional(t.String()),
      }),
    },
  )

  // ─── Customer Phone OTP Auth ──────────────────────────────────────
  .post(
    "/phone/start",
    async ({ body, phoneAuthController, audit }) => {
      audit.skip = true;
      const result = await phoneAuthController.start(body);
      return {
        statusCode: 200,
        message: "Verification code sent",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        phone: t.String({ minLength: 5, maxLength: 20 }),
      }),
    },
  )
  .post(
    "/phone/verify",
    async ({ body, accessJwt, request, cookie, phoneAuthController, audit }) => {
      const result = await phoneAuthController.verify(body, getDeviceInfo(request, body));
      audit.skip = true;

      if (result.requires_registration) {
        return {
          statusCode: 200,
          message: "Phone verified",
          data: result,
          timestamp: new Date().toISOString(),
        };
      }

      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      return tokenResponse(200, "Login successful", result.user, accessToken, result.refreshToken, {
        requires_registration: false,
      });
    },
    {
      body: t.Object({
        phone: t.String({ minLength: 5, maxLength: 20 }),
        code: t.String({ minLength: 4, maxLength: 10 }),
        device_type: t.Optional(t.String()),
        device_id: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/phone/register",
    async ({ body, set, accessJwt, request, cookie, phoneAuthController, audit }) => {
      const result = await phoneAuthController.register(body, getDeviceInfo(request, body));
      audit.skip = true;
      set.status = 201;
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      return tokenResponse(
        201,
        "Registration successful",
        result.user,
        accessToken,
        result.refreshToken,
      );
    },
    {
      body: t.Object({
        phone: t.String({ minLength: 5, maxLength: 20 }),
        registration_token: t.String({ minLength: 1 }),
        first_name: t.String({ minLength: 1, maxLength: 100 }),
        last_name: t.String({ minLength: 1, maxLength: 100 }),
        email: t.String({ format: "email" }),
        device_type: t.Optional(t.String()),
        device_id: t.Optional(t.String()),
      }),
    },
  )

  // ─── Refresh Token ────────────────────────────────────────────────
  .post(
    "/refresh",
    async ({ body, accessJwt, request, cookie, authController, audit }) => {
      const rawRefreshToken = body?.refreshToken || getRefreshTokenFromCookie(cookie, request);
      if (!rawRefreshToken) {
        throw new HttpError(400, "Refresh token is required", "MISSING_REFRESH_TOKEN");
      }
      const result = await authController.refresh(rawRefreshToken, getDeviceInfo(request));
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      // Token refresh fires every 15min per active session — far too noisy
      // to audit for customers. Keep for staff so we can spot session anomalies.
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.token_refresh";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
      }
      return tokenResponse(
        200,
        "Token refreshed successfully",
        result.user,
        accessToken,
        result.refreshToken,
      );
    },
    {
      body: t.Object({
        refreshToken: t.Optional(t.String({ minLength: 1 })),
      }),
    },
  )

  // ─── Logout ─────────────────────────────────────────────────────────
  .post(
    "/logout",
    async ({ body, cookie, request, authController, audit }) => {
      const rawRefreshToken = body?.refreshToken || getRefreshTokenFromCookie(cookie, request);
      if (rawRefreshToken) {
        await authController.logout(rawRefreshToken);
      }
      clearAuthCookies(cookie, request);
      // Logout fires on every session end including silent app closes.
      // We don't have the user's role here without an extra DB hit, and the
      // signal is paired with login (already audited for staff). Skip.
      audit.skip = true;
      return {
        statusCode: 200,
        message: "Logged out successfully",
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        refreshToken: t.Optional(t.String({ minLength: 1 })),
      }),
    },
  )

  // ─── Verify Email ────────────────────────────────────────────────
  .post(
    "/verify-email",
    async ({ body, authController }) => {
      const result = await authController.verifyEmail(body.token);
      return {
        statusCode: 200,
        message: "Email verified successfully",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
      }),
    },
  )

  // ─── Google OAuth: Redirect ─────────────────────────────────────
  .get("/google", ({ set, cookie }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    if (!clientId) {
      throw new HttpError(503, "Google OAuth is not configured", "OAUTH_NOT_CONFIGURED");
    }

    const state = crypto.randomUUID();
    cookie.oauth_state!.set({
      value: state,
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    set.redirect = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  })

  // ─── Google OAuth: Callback ─────────────────────────────────────
  .get(
    "/google/callback",
    async ({ query, cookie, accessJwt, request, authController, audit }) => {
      if (!query.code) {
        throw new HttpError(400, "Authorization code is required", "MISSING_CODE");
      }

      // CSRF state validation
      const storedState = cookie.oauth_state?.value;
      cookie.oauth_state?.remove();
      if (!storedState || storedState !== query.state) {
        throw new HttpError(400, "Invalid OAuth state parameter", "INVALID_STATE");
      }

      const result = await authController.googleCallback(query.code, getDeviceInfo(request));
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      // Customer OAuth signins are routine; only audit if a staff/vendor
      // account is logging in via Google.
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.login_google";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
        audit.force = true;
      }
      return tokenResponse(
        200,
        "Google authentication successful",
        result.user,
        accessToken,
        result.refreshToken,
      );
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        error: t.Optional(t.String()),
        state: t.Optional(t.String()),
      }),
    },
  )

  // ─── Apple Sign In: Redirect ────────────────────────────────────
  .get("/apple", ({ set, cookie }) => {
    const clientId = process.env.APPLE_CLIENT_ID ?? "";
    if (!clientId) {
      throw new HttpError(503, "Apple Sign In is not configured", "OAUTH_NOT_CONFIGURED");
    }

    const state = crypto.randomUUID();
    cookie.oauth_state!.set({
      value: state,
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: process.env.APPLE_REDIRECT_URI ?? "http://localhost:3001/auth/apple/callback",
      response_type: "code id_token",
      scope: "name email",
      response_mode: "form_post",
      state,
    });

    set.redirect = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  })

  // ─── Apple Sign In: Callback ────────────────────────────────────
  .post(
    "/apple/callback",
    async ({ body, cookie, accessJwt, request, authController, audit }) => {
      // CSRF state validation
      const storedState = cookie.oauth_state?.value;
      cookie.oauth_state?.remove();
      if (!storedState || storedState !== body.state) {
        throw new HttpError(400, "Invalid OAuth state parameter", "INVALID_STATE");
      }

      const result = await authController.appleCallback(body, getDeviceInfo(request));
      const accessToken = await issueAccessToken(accessJwt, result.user);
      setAuthCookies(cookie, accessToken, result.refreshToken, request);
      if (result.user.role === "customer") {
        audit.skip = true;
      } else {
        audit.action = "user.login_apple";
        audit.entity_type = "user";
        audit.entity_id = result.user.id as string;
        audit.actor_id = result.user.id as string;
        audit.actor_role = result.user.role as string;
      }
      return tokenResponse(
        200,
        "Apple authentication successful",
        result.user,
        accessToken,
        result.refreshToken,
      );
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        id_token: t.Optional(t.String()),
        state: t.Optional(t.String()),
        user: t.Optional(t.Any()),
      }),
    },
  )

  // ─── Guest Session ──────────────────────────────────────────────
  .post(
    "/guest",
    async ({ request, set, authController }) => {
      const result = await authController.createGuest({
        ip_address:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          undefined,
        user_agent: request.headers.get("user-agent") ?? undefined,
      });
      set.status = 201;
      return {
        statusCode: 201,
        message: "Guest session created",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Optional(
        t.Object({
          fingerprint_hash: t.Optional(t.String()),
        }),
      ),
    },
  )

  // ─── Merge Guest to User (requires auth) ───────────────────────
  .post(
    "/guest/merge",
    async ({ body, bearer: bearerToken, accessJwt, cookie, request, authController }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const result = await authController.mergeGuest(body.session_token, authUser.id);
      return {
        statusCode: 200,
        message: "Guest session merged successfully",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        session_token: t.String({ minLength: 1 }),
      }),
    },
  )

  // ─── Get Current User (requires auth) ──────────────────────────
  .get("/me", async ({ bearer: bearerToken, accessJwt, cookie, request, authController }) => {
    const authUser = await requireAuth(
      bearerToken,
      accessJwt,
      getAccessTokenFromCookie(cookie, request),
    );
    const result = await authController.getMe(authUser.id);
    return {
      statusCode: 200,
      message: "User profile retrieved",
      data: result,
      timestamp: new Date().toISOString(),
    };
  })

  // ─── Update own profile (requires auth) ─────────────────────────
  // Name only: email and phone change through their own verified flows.
  .patch(
    "/me",
    async ({ bearer: bearerToken, accessJwt, cookie, request, body, authController }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const patch: { first_name?: string; last_name?: string } = {};
      if (body.first_name !== undefined) patch.first_name = body.first_name.trim();
      if (body.last_name !== undefined) patch.last_name = body.last_name.trim();
      if (patch.first_name === "" || patch.last_name === "") {
        throw new HttpError(400, "Name can't be empty", "VALIDATION");
      }
      if (Object.keys(patch).length > 0) {
        await AppDataSource.getRepository(User).update({ id: authUser.id }, patch);
      }
      const result = await authController.getMe(authUser.id);
      return {
        statusCode: 200,
        message: "Profile updated",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object(
        {
          first_name: t.Optional(t.String({ maxLength: 100 })),
          last_name: t.Optional(t.String({ maxLength: 100 })),
        },
        { additionalProperties: false },
      ),
    },
  )

  // ─── Wallet balance (requires auth) ────────────────────────────
  .get("/me/wallet", async ({ bearer: bearerToken, accessJwt, cookie, request }) => {
    const authUser = await requireAuth(
      bearerToken,
      accessJwt,
      getAccessTokenFromCookie(cookie, request),
    );
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: authUser.id },
      select: { id: true, wallet_balance: true, wallet_currency: true },
    });
    return {
      statusCode: 200,
      data: {
        balance: user?.wallet_balance ?? 0,
        currency: user?.wallet_currency ?? "AED",
      },
      timestamp: new Date().toISOString(),
    };
  })

  // ─── Wallet transactions (requires auth) ───────────────────────
  .get(
    "/me/wallet/transactions",
    async ({ bearer: bearerToken, accessJwt, cookie, request, query }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
      const limit = query.limit ? Number(query.limit) : 20;
      const [rows, total] = await AppDataSource.getRepository(WalletTransaction).findAndCount({
        where: { user_id: authUser.id },
        order: { created_at: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      });
      // Map transaction_type -> type for the client; expose only display fields.
      const data = rows.map((t) => ({
        id: t.id,
        type: t.transaction_type,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        balance_after: t.balance_after,
        created_at: t.created_at,
      }));
      return {
        statusCode: 200,
        data,
        total,
        page,
        limit,
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )

  // ─── Change Password (requires auth) ──────────────────────────
  .post(
    "/change-password",
    async ({ body, bearer: bearerToken, accessJwt, cookie, request, authController, audit }) => {
      const authUser = await requireAuth(
        bearerToken,
        accessJwt,
        getAccessTokenFromCookie(cookie, request),
      );
      const result = await authController.changePassword(
        authUser.id,
        body.current_password,
        body.new_password,
      );
      audit.action = "user.password_change";
      audit.entity_type = "user";
      audit.entity_id = authUser.id;
      audit.actor_id = authUser.id;
      audit.actor_role = authUser.role;
      return {
        statusCode: 200,
        message: "Password changed successfully",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        current_password: t.String({ minLength: 1, maxLength: 128 }),
        new_password: t.String({ minLength: 8, maxLength: 128 }),
      }),
      detail: {
        tags: ["Auth"],
        summary: "Change password while authenticated",
        description:
          "Changes the authenticated user's password. Requires the current password. Clears must_change_password flag and revokes all sessions (re-login required).",
      },
    },
  );
