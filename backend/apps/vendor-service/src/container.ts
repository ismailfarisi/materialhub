import { config } from "@materialhub/config";
import { EmailService, EncryptionService } from "@materialhub/utils";
import { Elysia } from "elysia";
import { VendorFollowController } from "./controllers/vendor-follow.controller.ts";
import { VendorController } from "./controllers/vendor.controller.ts";
import { StripeConnectAdapter } from "./providers/payment/stripe-connect.adapter.ts";
import { VendorBankAccountService } from "./services/vendor-bank-account.service.ts";
import { VendorDocumentService } from "./services/vendor-document.service.ts";
import { VendorFollowService } from "./services/vendor-follow.service.ts";
import { VendorMemberService } from "./services/vendor-member.service.ts";
import { VendorSettingsService } from "./services/vendor-settings.service.ts";
import { VendorService } from "./services/vendor.service.ts";

const encryptionService = new EncryptionService(config.vendor.encryptionKey);
const paymentProvider = config.stripe.secretKey
  ? new StripeConnectAdapter(config.stripe.secretKey, config.stripe.connectWebhookSecret)
  : (null as unknown as StripeConnectAdapter);

const vendorService = new VendorService(paymentProvider);
const bankAccountService = new VendorBankAccountService(encryptionService);
const documentService = new VendorDocumentService();
const settingsService = new VendorSettingsService();
const vendorFollowService = new VendorFollowService();

const emailService = new EmailService();
const vendorMemberService = new VendorMemberService(emailService);

const vendorController = new VendorController(
  vendorService,
  bankAccountService,
  documentService,
  settingsService,
);
const vendorFollowController = new VendorFollowController(vendorFollowService);

export const container = new Elysia({ name: "vendor-service-container" })
  .decorate("vendorController", vendorController)
  .decorate("vendorService", vendorService)
  .decorate("vendorFollowController", vendorFollowController)
  .decorate("vendorFollowService", vendorFollowService)
  .decorate("emailService", emailService)
  .decorate("vendorMemberService", vendorMemberService);
