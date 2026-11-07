import { AppDataSource, TokenType, UserStatus } from "@materialhub/database";
import { User } from "@materialhub/database";
import { UserSession } from "@materialhub/database";
import { UserToken } from "@materialhub/database";
import { GuestSession } from "@materialhub/database";
import { bumpTokenVersion } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { IsNull, MoreThan } from "typeorm";
import type {
  AppleProfile,
  DeviceInfo,
  GoogleProfile,
  GuestInfo,
  RegisterData,
} from "../domain/types.ts";

function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

function stripPasswordHash(user: User): Omit<User, "password_hash"> {
  const { password_hash: _, ...rest } = user;
  return rest;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const EMAIL_TOKEN_EXPIRY_HOURS = 24;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const GUEST_SESSION_EXPIRY_DAYS = 30;

export class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }

  private get sessionRepo() {
    return AppDataSource.getRepository(UserSession);
  }

  private get tokenRepo() {
    return AppDataSource.getRepository(UserToken);
  }

  private get guestSessionRepo() {
    return AppDataSource.getRepository(GuestSession);
  }

  async register(data: RegisterData) {
    const email = normalizeEmail(data.email);

    const existingUser = await this.userRepo.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existingUser && !existingUser.deleted_at) {
      throw new HttpError(409, "Email already registered", "EMAIL_EXISTS");
    }

    if (existingUser?.deleted_at) {
      existingUser.deleted_at = null;
      existingUser.first_name = data.first_name;
      existingUser.last_name = data.last_name;
      existingUser.password_hash = await Bun.password.hash(data.password, {
        algorithm: "bcrypt",
        cost: 12,
      });
      existingUser.phone = data.phone ?? null;
      existingUser.status = UserStatus.pending_verification;
      existingUser.email_verified_at = null;
      existingUser.login_attempts = 0;
      existingUser.locked_until = null;

      const savedUser = await this.userRepo.save(existingUser);
      const emailToken = await this.createEmailVerifyToken(savedUser.id);
      return {
        user: stripPasswordHash(savedUser),
        emailVerifyToken: emailToken,
      };
    }

    const passwordHash = await Bun.password.hash(data.password, {
      algorithm: "bcrypt",
      cost: 12,
    });

    const user = this.userRepo.create({
      email,
      password_hash: passwordHash,
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone ?? null,
      status: UserStatus.pending_verification,
    });

    const savedUser = await this.userRepo.save(user);
    const emailToken = await this.createEmailVerifyToken(savedUser.id);
    return {
      user: stripPasswordHash(savedUser),
      emailVerifyToken: emailToken,
    };
  }

  async login(email: string, password: string, _deviceInfo: DeviceInfo) {
    const normalizedEmail = normalizeEmail(email);

    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.status === UserStatus.suspended) {
      throw new HttpError(403, "Account has been suspended", "ACCOUNT_SUSPENDED");
    }

    if (user.locked_until && user.locked_until > new Date()) {
      const remainingMs = user.locked_until.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new HttpError(
        423,
        `Account locked. Try again in ${remainingMin} minute(s)`,
        "ACCOUNT_LOCKED",
      );
    }

    if (user.locked_until && user.locked_until <= new Date()) {
      user.locked_until = null;
      user.login_attempts = 0;
    }

    // Guard against OAuth-only accounts that have no valid bcrypt hash
    if (!user.password_hash || !user.password_hash.startsWith("$2")) {
      throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    const passwordValid = await Bun.password.verify(password, user.password_hash);

    if (!passwordValid) {
      user.login_attempts += 1;

      if (user.login_attempts >= MAX_LOGIN_ATTEMPTS) {
        user.locked_until = new Date(Date.now() + LOCK_DURATION_MS);
        await this.userRepo.save(user);
        throw new HttpError(
          423,
          "Account locked due to too many failed login attempts. Try again in 15 minutes",
          "ACCOUNT_LOCKED",
        );
      }

      await this.userRepo.save(user);
      throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    user.login_attempts = 0;
    user.locked_until = null;
    user.last_login_at = new Date();
    await this.userRepo.save(user);

    return stripPasswordHash(user);
  }

  async createSession(userId: string, deviceInfo: DeviceInfo) {
    const rawRefreshToken = crypto.randomUUID();
    const refreshTokenHash = hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const session = this.sessionRepo.create({
      user_id: userId,
      refresh_token_hash: refreshTokenHash,
      device_info: {
        device_type: deviceInfo.device_type,
        device_id: deviceInfo.device_id ?? null,
        user_agent: deviceInfo.user_agent ?? null,
      },
      ip_address: deviceInfo.ip_address,
      expires_at: expiresAt,
      is_revoked: false,
    });

    const savedSession = await this.sessionRepo.save(session);

    return {
      refreshToken: rawRefreshToken,
      session: savedSession,
    };
  }

  async refreshToken(rawRefreshToken: string, deviceInfo?: DeviceInfo) {
    const tokenHash = hashToken(rawRefreshToken);

    // Use a transaction with SELECT FOR UPDATE for atomic rotation
    return AppDataSource.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(UserSession);
      const userRepo = manager.getRepository(User);

      // Check if this token was already revoked (reuse detection)
      const revokedSession = await sessionRepo.findOne({
        where: { refresh_token_hash: tokenHash, is_revoked: true },
      });

      if (revokedSession) {
        // Token reuse detected — invalidate ALL sessions for this user
        await sessionRepo.update(
          { user_id: revokedSession.user_id, is_revoked: false },
          { is_revoked: true },
        );
        throw new HttpError(
          401,
          "Refresh token reuse detected. All sessions revoked for security.",
          "TOKEN_REUSE_DETECTED",
        );
      }

      // Lock session row first (without JOIN to avoid PG FOR UPDATE limitation)
      const session = await sessionRepo.findOne({
        where: {
          refresh_token_hash: tokenHash,
          is_revoked: false,
          expires_at: MoreThan(new Date()),
        },
        lock: { mode: "pessimistic_write" },
      });

      if (!session) {
        throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
      }

      // Load user separately after acquiring the lock
      const user = await userRepo.findOneBy({ id: session.user_id });
      if (!user) {
        throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
      }

      if (user.status === UserStatus.suspended) {
        session.is_revoked = true;
        await sessionRepo.save(session);
        throw new HttpError(403, "Account has been suspended", "ACCOUNT_SUSPENDED");
      }

      // Revoke old session
      session.is_revoked = true;
      await sessionRepo.save(session);

      // Create new session
      const newRawRefreshToken = crypto.randomUUID();
      const newRefreshTokenHash = hashToken(newRawRefreshToken);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

      const newSession = sessionRepo.create({
        user_id: session.user_id,
        refresh_token_hash: newRefreshTokenHash,
        device_info: deviceInfo
          ? {
              device_type: deviceInfo.device_type,
              device_id: deviceInfo.device_id ?? null,
              user_agent: deviceInfo.user_agent ?? null,
            }
          : session.device_info,
        ip_address: deviceInfo?.ip_address ?? session.ip_address,
        expires_at: expiresAt,
        is_revoked: false,
      });

      const savedNewSession = await sessionRepo.save(newSession);

      return {
        user: stripPasswordHash(user),
        refreshToken: newRawRefreshToken,
        session: savedNewSession,
      };
    });
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);

    const session = await this.sessionRepo.findOne({
      where: {
        refresh_token_hash: tokenHash,
        is_revoked: false,
      },
    });

    if (!session) {
      return { success: true };
    }

    session.is_revoked = true;
    await this.sessionRepo.save(session);

    return { success: true };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);

    // Use a transaction to prevent TOCTOU — verify user exists before consuming token
    return AppDataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(UserToken);
      const userRepo = manager.getRepository(User);

      const userToken = await tokenRepo.findOne({
        where: {
          token_hash: tokenHash,
          type: TokenType.email_verify,
          used_at: IsNull(),
          expires_at: MoreThan(new Date()),
        },
      });

      if (!userToken) {
        throw new HttpError(400, "Invalid or expired verification token", "INVALID_TOKEN");
      }

      const user = await userRepo.findOne({
        where: { id: userToken.user_id },
      });

      if (!user) {
        throw new HttpError(404, "User not found", "USER_NOT_FOUND");
      }

      // Mark token as used
      userToken.used_at = new Date();
      await tokenRepo.save(userToken);

      // Activate user
      user.status = UserStatus.active;
      user.email_verified_at = new Date();
      await userRepo.save(user);

      return { success: true, user: stripPasswordHash(user) };
    });
  }

  async googleOAuth(profile: GoogleProfile) {
    const normalizedEmail = normalizeEmail(profile.email);

    let user = await this.userRepo.findOne({
      where: { google_id: profile.google_id },
    });

    if (user) {
      return stripPasswordHash(user);
    }

    user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (user) {
      user.google_id = profile.google_id;
      if (profile.avatar_url && !user.avatar_url) {
        user.avatar_url = profile.avatar_url;
      }
      if (!user.email_verified_at) {
        user.email_verified_at = new Date();
        user.status = UserStatus.active;
      }
      const savedUser = await this.userRepo.save(user);
      return stripPasswordHash(savedUser);
    }

    const randomPassword = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(randomPassword, {
      algorithm: "bcrypt",
      cost: 12,
    });

    const newUser = this.userRepo.create({
      email: normalizedEmail,
      password_hash: passwordHash,
      first_name: profile.first_name,
      last_name: profile.last_name,
      avatar_url: profile.avatar_url ?? null,
      google_id: profile.google_id,
      email_verified_at: new Date(),
      status: UserStatus.active,
    });

    const savedUser = await this.userRepo.save(newUser);
    return stripPasswordHash(savedUser);
  }

  async appleSignIn(profile: AppleProfile) {
    let user = await this.userRepo.findOne({
      where: { apple_id: profile.apple_id },
    });

    if (user) {
      return stripPasswordHash(user);
    }

    if (profile.email) {
      const normalizedEmail = normalizeEmail(profile.email);
      user = await this.userRepo.findOne({
        where: { email: normalizedEmail },
      });

      if (user) {
        user.apple_id = profile.apple_id;
        if (!user.email_verified_at) {
          user.email_verified_at = new Date();
          user.status = UserStatus.active;
        }
        const savedUser = await this.userRepo.save(user);
        return stripPasswordHash(savedUser);
      }
    }

    const email = profile.email
      ? normalizeEmail(profile.email)
      : `apple_${profile.apple_id}@privaterelay.appleid.com`;
    const randomPassword = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(randomPassword, {
      algorithm: "bcrypt",
      cost: 12,
    });

    const newUser = this.userRepo.create({
      email,
      password_hash: passwordHash,
      first_name: profile.first_name ?? "Apple",
      last_name: profile.last_name ?? "User",
      apple_id: profile.apple_id,
      email_verified_at: new Date(),
      status: UserStatus.active,
    });

    const savedUser = await this.userRepo.save(newUser);
    return stripPasswordHash(savedUser);
  }

  async createGuestSession(info: GuestInfo) {
    const sessionToken = crypto.randomUUID();
    const sessionTokenHash = hashToken(sessionToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + GUEST_SESSION_EXPIRY_DAYS);

    const guestSession = this.guestSessionRepo.create({
      session_token: sessionTokenHash,
      fingerprint_hash: info.fingerprint_hash ?? null,
      ip_address: info.ip_address ?? null,
      user_agent: info.user_agent ?? null,
      expires_at: expiresAt,
    });

    const saved = await this.guestSessionRepo.save(guestSession);

    return {
      session_token: sessionToken,
      session: saved,
    };
  }

  async mergeGuestToUser(sessionToken: string, userId: string) {
    const sessionTokenHash = hashToken(sessionToken);

    const guestSession = await this.guestSessionRepo.findOne({
      where: {
        session_token: sessionTokenHash,
        merged_to_user_id: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });

    if (!guestSession) {
      throw new HttpError(
        404,
        "Guest session not found or already merged",
        "GUEST_SESSION_NOT_FOUND",
      );
    }

    guestSession.merged_to_user_id = userId;
    guestSession.merged_at = new Date();
    await this.guestSessionRepo.save(guestSession);

    return { success: true, session_id: guestSession.id };
  }

  async getUserById(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    }

    return stripPasswordHash(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    }

    if (!user.password_hash || !user.password_hash.startsWith("$2")) {
      // 400: the caller is authenticated (OAuth/phone-only accounts have no
      // password to change); a 401 would trigger the clients' refresh-retry.
      throw new HttpError(
        400,
        "This account signs in without a password",
        "PASSWORD_NOT_SET",
      );
    }

    const ok = await Bun.password.verify(currentPassword, user.password_hash);
    if (!ok) {
      // 400, not 401: the caller IS authenticated; a 401 made the frontends'
      // axios interceptors refresh the token and resend the request.
      throw new HttpError(400, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
    }

    const newHash = await Bun.password.hash(newPassword, { algorithm: "bcrypt", cost: 12 });

    await AppDataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update({ id: userId }, { password_hash: newHash, must_change_password: false });
      // Revoke all sessions including the caller's. Vendor must log in again
      // with the new password — matches resetPassword / setPasswordDirectly.
      await manager
        .getRepository(UserSession)
        .update({ user_id: userId, is_revoked: false }, { is_revoked: true });
    });
    // Revoking refresh sessions alone left every issued access token valid
    // for up to 15 minutes; bumping the token version rejects them now.
    await bumpTokenVersion(userId);

    return { success: true };
  }

  private async createEmailVerifyToken(userId: string): Promise<string> {
    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EMAIL_TOKEN_EXPIRY_HOURS);

    const token = this.tokenRepo.create({
      user_id: userId,
      token_hash: tokenHash,
      type: TokenType.email_verify,
      expires_at: expiresAt,
    });

    await this.tokenRepo.save(token);

    return rawToken;
  }
}
