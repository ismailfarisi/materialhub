import { AppDataSource } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { EmailService } from "@materialhub/utils";
import type { PasswordService } from "../services/password.service.ts";

/**
 * Phase 3b: vendors.user_id was dropped. The owner's user record is found by
 * joining vendor_members (active owner row) to users.
 */
async function findVendorOwnerUser(
  vendorId: string,
): Promise<{ id: string; email: string } | null> {
  const rows = (await AppDataSource.query(
    `SELECT u.id, u.email
       FROM vendors v
       JOIN vendor_members vm ON vm.vendor_id = v.id
       JOIN users u ON u.id = vm.user_id
      WHERE v.id = $1
        AND v.deleted_at IS NULL
        AND vm.role = 'owner'
        AND vm.status = 'active'
        AND vm.deleted_at IS NULL
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [vendorId],
  )) as Array<{ id: string; email: string }>;
  return rows[0] ?? null;
}

export class AdminPasswordController {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
  ) {}

  async resetVendorPassword(
    vendorId: string,
    _adminId: string,
  ): Promise<{ message: string; vendor_email: string }> {
    const owner = await findVendorOwnerUser(vendorId);
    if (!owner) {
      throw new NotFoundError("Vendor owner not found");
    }

    const result = await this.passwordService.forgotPassword(owner.email);

    if (result) {
      this.emailService.sendPasswordResetEmail(result.user.email, result.token).catch(() => {});

      return {
        message: "Password reset email sent successfully",
        vendor_email: result.user.email,
      };
    }

    throw new NotFoundError("Failed to generate password reset token");
  }

  async setVendorPasswordDirectly(
    vendorId: string,
    _adminId: string,
  ): Promise<{ vendor_email: string; temporary_password: string }> {
    const owner = await findVendorOwnerUser(vendorId);
    if (!owner) {
      throw new NotFoundError("Vendor owner not found");
    }

    const { temporaryPassword } = await this.passwordService.setPasswordDirectly(owner.id);

    // Fire-and-forget security alert. Never includes the password.
    this.emailService.sendPasswordChangedByAdminEmail(owner.email).catch(() => {});

    return {
      vendor_email: owner.email,
      temporary_password: temporaryPassword,
    };
  }
}
