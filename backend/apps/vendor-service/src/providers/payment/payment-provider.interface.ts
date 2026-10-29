export interface AccountStatus {
  providerId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface WebhookResult {
  eventType: string;
  accountId: string;
  status: AccountStatus;
}

export interface PaymentProviderAdapter {
  createConnectedAccount(vendor: {
    id: string;
    business_email: string;
    business_name: string;
    country: string;
  }): Promise<{ providerId: string }>;

  generateOnboardingUrl(providerId: string, returnUrl: string, refreshUrl: string): Promise<string>;

  getAccountStatus(providerId: string): Promise<AccountStatus>;

  handleWebhook(rawBody: string, signature: string): Promise<WebhookResult>;
}
