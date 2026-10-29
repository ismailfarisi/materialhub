import { AppDataSource, UserAddress } from "@materialhub/database";
import { EmailService } from "@materialhub/utils";
import { Elysia } from "elysia";
import { AdminPasswordController } from "./controllers/admin-password.controller.ts";
import { AuthController } from "./controllers/auth.controller.ts";
import { PasswordController } from "./controllers/password.controller.ts";
import { PhoneAuthController } from "./controllers/phone-auth.controller.ts";
import { TwoFactorController } from "./controllers/two-factor.controller.ts";
import { UserAdminController } from "./controllers/user-admin.controller.ts";
import { AddressPhoneVerificationService } from "./services/address-phone-verification.service.ts";
import { AddressService } from "./services/address.service.ts";
import { AuthService } from "./services/auth.service.ts";
import { PasswordService } from "./services/password.service.ts";
import { PhoneAuthService } from "./services/phone-auth.service.ts";
import { createPhoneVerificationProvider } from "./services/phone-verification-provider.ts";
import { TwoFactorService } from "./services/two-factor.service.ts";
import { UserAdminService } from "./services/user-admin.service.ts";

const emailService = new EmailService();
const authService = new AuthService();
const phoneVerificationProvider = createPhoneVerificationProvider();
const phoneAuthService = new PhoneAuthService(phoneVerificationProvider);
const addressPhoneVerificationService = new AddressPhoneVerificationService(
  phoneVerificationProvider,
);
const addressService = new AddressService(
  AppDataSource.getRepository(UserAddress),
  addressPhoneVerificationService,
);
const passwordService = new PasswordService();
const twoFactorService = new TwoFactorService();

const authController = new AuthController(authService, emailService, twoFactorService);
const phoneAuthController = new PhoneAuthController(phoneAuthService);
const passwordController = new PasswordController(passwordService, authService, emailService);
const twoFactorController = new TwoFactorController(twoFactorService, authService);
const userAdminService = new UserAdminService();
const userAdminController = new UserAdminController(userAdminService);
const adminPasswordController = new AdminPasswordController(passwordService, emailService);

export const container = new Elysia({ name: "auth-service-container" })
  .decorate("authController", authController)
  .decorate("phoneAuthController", phoneAuthController)
  .decorate("passwordController", passwordController)
  .decorate("twoFactorController", twoFactorController)
  .decorate("userAdminController", userAdminController)
  .decorate("adminPasswordController", adminPasswordController)
  .decorate("addressPhoneVerificationService", addressPhoneVerificationService)
  .decorate("addressService", addressService);
