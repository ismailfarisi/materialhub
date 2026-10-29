import { UserStatus } from "@materialhub/database";
import { BadRequestError, HttpError } from "@materialhub/plugins";
import type { DeviceInfo } from "../domain/types.ts";
import type { AuthService } from "../services/auth.service.ts";
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

  async loginVerify(userId: string, code: string, deviceInfo: DeviceInfo) {
    const valid = await this.twoFactorService.verifyCode(userId, code);
    if (!valid) {
      throw new BadRequestError("Invalid TOTP code");
    }
    const user = await this.authService.getUserById(userId);
    this.assertNotSuspended(user);
    const session = await this.authService.createSession(user.id as string, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }

  async backupVerify(userId: string, code: string, deviceInfo: DeviceInfo) {
    const valid = await this.twoFactorService.verifyBackupCode(userId, code);
    if (!valid) {
      throw new BadRequestError("Invalid backup code");
    }
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
