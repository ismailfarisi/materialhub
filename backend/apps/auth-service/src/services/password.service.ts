import {
  AppDataSource,
  TokenType,
  User,
  UserSession,
  UserStatus,
  UserToken,
} from "@materialhub/database";
import { BadRequestError, HttpError, NotFoundError } from "@materialhub/plugins";
import { IsNull, MoreThan } from "typeorm";
import { generateTemporaryPassword } from "../utils/password-generator.ts";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export class PasswordService {
  private userRepo = AppDataSource.getRepository(User);
  private tokenRepo = AppDataSource.getRepository(UserToken);
  private sessionRepo = AppDataSource.getRepository(UserSession);

  private hashToken(rawToken: string): string {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(rawToken);
    return hasher.digest("hex");
  }

  async forgotPassword(email: string): Promise<{ token: string; user: User } | null> {
    const user = await this.userRepo.findOne({
      where: { email: normalizeEmail(email), deleted_at: IsNull() },
    });

    if (!user) {
      return null;
    }

    await this.tokenRepo.update(
      {
        user_id: user.id,
        type: TokenType.password_reset,
        used_at: IsNull(),
      },
      { used_at: new Date() },
    );

    const rawToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const tokenEntity = this.tokenRepo.create({
      user_id: user.id,
      token_hash: tokenHash,
      type: TokenType.password_reset,
      expires_at: expiresAt,
    });

    await this.tokenRepo.save(tokenEntity);

    return { token: rawToken, user };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ userId: string }> {
    const tokenHash = this.hashToken(rawToken);

    const tokenRecord = await this.tokenRepo.findOne({
      where: {
        token_hash: tokenHash,
        type: TokenType.password_reset,
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });

    if (!tokenRecord) {
      throw new BadRequestError("Invalid or expired password reset token");
    }

    const passwordHash = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 12,
    });

    // Wrap all three operations in a transaction for atomicity
    await AppDataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update(
          { id: tokenRecord.user_id },
          { password_hash: passwordHash, must_change_password: false },
        );

      await manager
        .getRepository(UserToken)
        .update({ id: tokenRecord.id }, { used_at: new Date() });

      await manager
        .getRepository(UserSession)
        .update({ user_id: tokenRecord.user_id, is_revoked: false }, { is_revoked: true });
    });

    return { userId: tokenRecord.user_id };
  }

  async sendMagicLink(email: string): Promise<{ token: string; user: User } | null> {
    const user = await this.userRepo.findOne({
      where: { email: normalizeEmail(email), deleted_at: IsNull() },
    });

    if (!user) {
      return null;
    }

    await this.tokenRepo.update(
      {
        user_id: user.id,
        type: TokenType.magic_link,
        used_at: IsNull(),
      },
      { used_at: new Date() },
    );

    const rawToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const tokenEntity = this.tokenRepo.create({
      user_id: user.id,
      token_hash: tokenHash,
      type: TokenType.magic_link,
      expires_at: expiresAt,
    });

    await this.tokenRepo.save(tokenEntity);

    return { token: rawToken, user };
  }

  async verifyMagicLink(rawToken: string): Promise<User> {
    const tokenHash = this.hashToken(rawToken);

    const tokenRecord = await this.tokenRepo.findOne({
      where: {
        token_hash: tokenHash,
        type: TokenType.magic_link,
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      relations: ["user"],
    });

    if (!tokenRecord) {
      throw new BadRequestError("Invalid or expired magic link");
    }

    if (tokenRecord.user.status === UserStatus.suspended) {
      throw new HttpError(403, "Account has been suspended", "ACCOUNT_SUSPENDED");
    }

    await this.tokenRepo.update({ id: tokenRecord.id }, { used_at: new Date() });

    if (!tokenRecord.user.email_verified_at) {
      await this.userRepo.update({ id: tokenRecord.user.id }, { email_verified_at: new Date() });
    }

    return tokenRecord.user;
  }

  /**
   * Admin-initiated direct password set. Returns the plaintext password ONCE
   * to the caller. Never logged, never persisted in plaintext.
   */
  async setPasswordDirectly(userId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId, deleted_at: IsNull() },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status === UserStatus.suspended) {
      throw new HttpError(
        403,
        "Cannot reset password for a suspended account",
        "ACCOUNT_SUSPENDED",
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await Bun.password.hash(temporaryPassword, {
      algorithm: "bcrypt",
      cost: 12,
    });

    await AppDataSource.transaction(async (manager) => {
      // 1. Update password + flip must_change_password flag + clear lockout
      // (admin direct-set is for restoring access — also unblocks attempt counter)
      await manager.getRepository(User).update(
        { id: userId },
        {
          password_hash: passwordHash,
          must_change_password: true,
          login_attempts: 0,
          locked_until: null,
        },
      );

      // 2. Invalidate any active password-reset tokens
      await manager
        .getRepository(UserToken)
        .update(
          { user_id: userId, type: TokenType.password_reset, used_at: IsNull() },
          { used_at: new Date() },
        );

      // 3. Revoke all active sessions
      await manager
        .getRepository(UserSession)
        .update({ user_id: userId, is_revoked: false }, { is_revoked: true });
    });

    return { temporaryPassword };
  }
}
