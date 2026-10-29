import type { EmailService } from "@materialhub/utils";
import type { DeviceInfo } from "../domain/types.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { PasswordService } from "../services/password.service.ts";

export class PasswordController {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  async forgotPassword(email: string) {
    const result = await this.passwordService.forgotPassword(email);

    // Send reset email if user exists (fire-and-forget)
    if (result) {
      this.emailService.sendPasswordResetEmail(result.user.email, result.token).catch(() => {});
    }

    // Always return generic message to prevent user enumeration
    return { message: "If an account exists, a reset link has been sent" };
  }

  async resetPassword(token: string, newPassword: string) {
    const result = await this.passwordService.resetPassword(token, newPassword);
    return { message: "Password reset successfully", userId: result.userId };
  }

  async sendMagicLink(email: string) {
    const result = await this.passwordService.sendMagicLink(email);

    // Send magic link email if user exists (fire-and-forget)
    if (result) {
      this.emailService.sendMagicLinkEmail(result.user.email, result.token).catch(() => {});
    }

    // Always return generic message to prevent user enumeration
    return { message: "If an account exists, a magic link has been sent" };
  }

  async verifyMagicLink(token: string, deviceInfo: DeviceInfo) {
    const user = await this.passwordService.verifyMagicLink(token);
    const session = await this.authService.createSession(user.id, deviceInfo);
    return { user, refreshToken: session.refreshToken };
  }
}
