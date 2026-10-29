import { config } from "@materialhub/config";
import { BadRequestError, HttpError } from "@materialhub/plugins";
import type { EmailService } from "@materialhub/utils";
import type { DeviceInfo, GuestInfo, RegisterData } from "../domain/types.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { TwoFactorService } from "../services/two-factor.service.ts";

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(data: RegisterData, deviceInfo: DeviceInfo) {
    const result = await this.authService.register(data);
    const session = await this.authService.createSession(result.user.id, deviceInfo);

    // Send verification email via SES (fire-and-forget)
    this.emailService.sendVerificationEmail(data.email, result.emailVerifyToken).catch(() => {});

    // Seed default notification preferences (fire-and-forget to notification-service)
    fetch(`${config.internal.notificationServiceUrl}/notifications/preferences/seed-internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": config.internal.serviceSecret,
      },
      body: JSON.stringify({ user_id: result.user.id }),
    }).catch(() => {
      // Non-critical: preferences can be seeded later via POST /notifications/preferences/seed
    });

    return {
      user: result.user,
      refreshToken: session.refreshToken,
    };
  }

  async login(email: string, password: string, deviceInfo: DeviceInfo) {
    const user = await this.authService.login(email, password, deviceInfo);

    // Check if 2FA is enabled — return a challenge instead of full tokens
    const twoFaEnabled = await this.twoFactorService.isEnabled(user.id as string);
    if (twoFaEnabled) {
      return { requires_2fa: true, user_id: user.id };
    }

    const session = await this.authService.createSession(user.id as string, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  async refresh(rawRefreshToken: string, deviceInfo: DeviceInfo) {
    return this.authService.refreshToken(rawRefreshToken, deviceInfo);
  }

  async logout(rawRefreshToken: string) {
    await this.authService.logout(rawRefreshToken);
    return { message: "Logged out successfully" };
  }

  async verifyEmail(token: string) {
    const result = await this.authService.verifyEmail(token);
    return { user: result.user };
  }

  async googleCallback(code: string, deviceInfo: DeviceInfo) {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/google/callback";

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new HttpError(401, "Failed to exchange authorization code", "OAUTH_EXCHANGE_FAILED");
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new HttpError(401, "Failed to fetch Google profile", "OAUTH_PROFILE_FAILED");
    }

    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      given_name: string;
      family_name: string;
      picture?: string;
    };

    const user = await this.authService.googleOAuth({
      google_id: profile.id,
      email: profile.email,
      first_name: profile.given_name,
      last_name: profile.family_name,
      avatar_url: profile.picture,
    });

    const session = await this.authService.createSession(user.id, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  async appleCallback(
    body: { code?: string; id_token?: string; user?: unknown },
    deviceInfo: DeviceInfo,
  ) {
    const { code, id_token, user: appleUser } = body;

    if (!code && !id_token) {
      throw new BadRequestError("Authorization code or id_token is required");
    }

    let appleId = "";
    let email: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;

    if (id_token) {
      // Verify Apple id_token JWT signature against Apple's JWKS
      const payload = await this.verifyAppleIdToken(id_token);
      appleId = payload.sub;
      email = payload.email;
    }

    if (appleUser) {
      try {
        const parsed = typeof appleUser === "string" ? JSON.parse(appleUser) : appleUser;
        firstName = (parsed as any)?.name?.firstName;
        lastName = (parsed as any)?.name?.lastName;
        if ((parsed as any)?.email) {
          email = (parsed as any).email;
        }
      } catch {
        // Ignore parse errors for user data
      }
    }

    if (!appleId) {
      throw new HttpError(401, "Failed to extract Apple user identity", "OAUTH_IDENTITY_FAILED");
    }

    const user = await this.authService.appleSignIn({
      apple_id: appleId,
      email,
      first_name: firstName,
      last_name: lastName,
    });

    const session = await this.authService.createSession(user.id as string, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  /**
   * Verify Apple id_token by fetching Apple's JWKS and validating the JWT signature.
   */
  private async verifyAppleIdToken(idToken: string): Promise<{ sub: string; email?: string }> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new HttpError(401, "Invalid Apple id_token format", "INVALID_ID_TOKEN");
    }

    // Decode header to get the key ID (kid) and validate algorithm
    const headerJson = atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerJson) as { kid: string; alg: string };

    if (header.alg !== "RS256") {
      throw new HttpError(401, "Unsupported Apple id_token algorithm", "INVALID_ALGORITHM");
    }

    // Fetch Apple's public keys
    const jwksRes = await fetch("https://appleid.apple.com/auth/keys");
    if (!jwksRes.ok) {
      throw new HttpError(502, "Failed to fetch Apple JWKS", "APPLE_JWKS_ERROR");
    }
    const jwks = (await jwksRes.json()) as {
      keys: Array<{ kid: string; kty: string; n: string; e: string; alg: string }>;
    };

    const key = jwks.keys.find((k) => k.kid === header.kid);
    if (!key) {
      throw new HttpError(401, "Apple signing key not found", "APPLE_KEY_NOT_FOUND");
    }

    // Import the RSA public key and verify
    const { createPublicKey, createVerify } = await import("node:crypto");
    const publicKey = createPublicKey({
      key: {
        kty: key.kty,
        n: key.n,
        e: key.e,
      },
      format: "jwk",
    });

    const signatureInput = `${parts[0]!}.${parts[1]!}`;
    const signature = Buffer.from(parts[2]!.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(signatureInput);
    const isValid = verifier.verify(publicKey, signature);

    if (!isValid) {
      throw new HttpError(401, "Apple id_token signature verification failed", "INVALID_SIGNATURE");
    }

    // Decode and validate payload
    const payloadJson = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as {
      sub: string;
      email?: string;
      iss: string;
      aud: string;
      exp: number;
    };

    // Validate issuer, audience, and expiry
    if (payload.iss !== "https://appleid.apple.com") {
      throw new HttpError(401, "Invalid Apple id_token issuer", "INVALID_ISSUER");
    }
    const expectedAud = process.env.APPLE_CLIENT_ID;
    if (expectedAud && payload.aud !== expectedAud) {
      throw new HttpError(401, "Invalid Apple id_token audience", "INVALID_AUDIENCE");
    }
    if (payload.exp * 1000 < Date.now()) {
      throw new HttpError(401, "Apple id_token has expired", "TOKEN_EXPIRED");
    }

    return { sub: payload.sub, email: payload.email };
  }

  async createGuest(info: GuestInfo) {
    const result = await this.authService.createGuestSession(info);
    return {
      session_token: result.session_token,
      expires_at: result.session.expires_at,
    };
  }

  async mergeGuest(sessionToken: string, userId: string) {
    return this.authService.mergeGuestToUser(sessionToken, userId);
  }

  async getMe(userId: string) {
    const [user, beauty_profile_completed] = await Promise.all([
      this.authService.getUserById(userId),
      this.authService.isBeautyProfileCompleted(userId),
    ]);
    return { user: { ...user, beauty_profile_completed } };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    return this.authService.changePassword(userId, currentPassword, newPassword);
  }
}
