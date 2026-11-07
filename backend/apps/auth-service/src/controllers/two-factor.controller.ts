import { UserStatus } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { DeviceInfo } from "../domain/types.ts";
import type { AuthService } from "../services/auth.service.ts";
import { verifyWithChallenge } from "../services/two-factor-challenge.ts";
import type { TwoFactorService } from "../services/two-factor.service.ts";

export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  async enableSetup(userId: string) {
    const result = await this.twoFactorService.enableSetup(userId);
    return {
      ...result,
      message: "Scan the QR code with your authenticator app, then verify with a code.",
    };
  }

  async verifyAndEnable(userId: string, code: string) {
    const result = await this.twoFactorService.verifyAndEnable(userId, code);
    return {
      message: "2FA has been enabled successfully. Save your backup codes in a safe place.",
      backup_codes: result.backup_codes,
    };
  }

  async disable(userId: string, code: string) {
    await this.twoFactorService.disable(userId, code);
    return { message: "2FA has been disabled successfully." };
  }

  async loginVerify(challengeToken: string, code: string, deviceInfo: DeviceInfo) {
    const userId = await verifyWithChallenge(challengeToken, code, (uid, c) =>
      this.twoFactorService.verifyCode(uid, c),
    );
    const user = await this.authService.getUserById(userId);
    this.assertNotSuspended(user);
    const session = await this.authService.createSession(user.id as string, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  async backupVerify(challengeToken: string, code: string, deviceInfo: DeviceInfo) {
    const userId = await verifyWithChallenge(challengeToken, code, (uid, c) =>
      this.twoFactorService.verifyBackupCode(uid, c),
    );
    const user = await this.authService.getUserById(userId);
    this.assertNotSuspended(user);
    const session = await this.authService.createSession(user.id as string, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  private assertNotSuspended(user: { status?: string }) {
    if (user.status === UserStatus.suspended) {
      throw new HttpError(403, "Account has been suspended", "ACCOUNT_SUSPENDED");
    }
  }
}
